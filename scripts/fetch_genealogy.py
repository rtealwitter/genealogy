#!/usr/bin/env python3
"""Fetch an explicitly bounded set of MGP ancestors, with cached HTML and citations."""
import argparse
import hashlib
import json
import re
import sys
import time
from collections import deque
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = 'https://www.mathgenealogy.org/'
ROOT = Path(__file__).resolve().parents[1]


def clean(value):
    return ' '.join(value.split())


class MGP:
    def __init__(self, cache, delay=10):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.delay = max(10, delay)
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'AcademicGenealogy/1.0 (personal research; cached, bounded requests)'
        self.last_request = 0

    def get(self, path, data=None):
        key = hashlib.sha256((path + json.dumps(data, sort_keys=True)).encode()).hexdigest()
        target = self.cache / (key + '.html')
        if target.exists():
            return BeautifulSoup(target.read_text(), 'html.parser')
        url = BASE + path
        method = 'POST' if data else 'GET'
        for _ in range(6):
            parsed = urlparse(url)
            if parsed.scheme != 'https' or parsed.netloc != 'www.mathgenealogy.org' or parsed.path not in ['/query-prep.php', '/results.php', '/id.php']:
                raise ValueError('Unexpected MGP redirect; refusing to follow it.')
            time.sleep(max(0, self.last_request + self.delay - time.monotonic()))
            self.last_request = time.monotonic()
            response = self.session.request(method, url, data=data if method == 'POST' else None, timeout=30, allow_redirects=False)
            response.raise_for_status()
            if response.status_code not in (301, 302, 303, 307, 308):
                break
            location = response.headers.get('Location')
            if not location:
                raise ValueError('MGP returned a redirect without a destination.')
            url = urljoin(url, location)
            if response.status_code == 303 or (response.status_code in (301, 302) and method == 'POST'):
                method = 'GET'
        else:
            raise ValueError('Too many MGP redirects.')
        if 'Mathematics Genealogy Project' not in response.text:
            raise ValueError('Unexpected MGP response; stopping instead of guessing.')
        target.write_text(response.text)
        return BeautifulSoup(response.text, 'html.parser')

    def search(self, name):
        parts = name.strip().split()
        soup = self.get('query-prep.php', {'given_name': parts[0] if len(parts) > 1 else '', 'family_name': parts[-1], 'chrono': '0'})
        if soup.find('h2') and ' - The Mathematics Genealogy Project' in soup.title.get_text():
            raise ValueError('Unexpected search redirect; use an MGP ID instead.')
        candidates = {}
        for a in soup.select('a[href*="id.php?id="]'):
            identifier = re.search(r'id=(\d+)', a['href']).group(1)
            row = a.find_parent('tr')
            candidates.setdefault(identifier, {'id': identifier, 'name': clean(a.get_text()), 'detail': clean(row.get_text(' ', strip=True)) if row else ''})
        return list(candidates.values())

    def person(self, identifier):
        soup = self.get('id.php?id=' + str(identifier))
        heading = soup.find('h2')
        if heading is None:
            raise ValueError(f'MGP record {identifier} has no person heading.')
        name = clean(heading.get_text())
        degree = soup.find('span', style=lambda s: s and 'margin-right: 0.5em' in s)
        institution, year = '', None
        if degree:
            school = degree.find('span')
            institution = clean(school.get_text()) if school else ''
            match = re.search(r'\b(1[0-9]{3}|20[0-9]{2})\b', degree.get_text(' ', strip=True))
            year = int(match.group()) if match else None
        advisors = []
        advisor_names = {}
        for p in soup.find_all('p'):
            if re.match(r'Advisor(?:s|\s*\d*)?:', clean(p.get_text(' ', strip=True))):
                for a in p.select('a[href*="id.php?id="]'):
                    aid = 'mgp-' + re.search(r'id=(\d+)', a['href']).group(1)
                    if aid not in advisors:
                        advisors.append(aid)
                        advisor_names[aid] = clean(a.get_text())
        result = {'id': f'mgp-{identifier}', 'mgpId': int(identifier), 'name': name, 'year': year, 'institution': institution, 'advisors': advisors, 'sources': [{'label': 'Mathematics Genealogy Project', 'url': BASE + 'id.php?id=' + str(identifier)}]}
        if not advisors:
            result['note'] = 'No advisor is recorded in the Mathematics Genealogy Project. This is a limit of the record, not evidence of no advisor.'
        return result, advisor_names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('people', nargs='*', help='MGP IDs, MGP URLs, or quoted names (ambiguous names require an ID)')
    parser.add_argument('--names-file', type=Path, help='UTF-8 file with one name or MGP ID per line')
    parser.add_argument('--search', help='Print candidate MGP IDs and exit')
    parser.add_argument('--output', type=Path, default=ROOT / 'data' / 'custom.json')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache' / 'mgp')
    parser.add_argument('--max-people', type=int, default=250)
    parser.add_argument('--max-depth', type=int, default=40)
    parser.add_argument('--delay', type=float, default=10, help='Seconds between requests (minimum 10)')
    parser.add_argument('--overlay', type=Path, help='JSON people/defaultRoots and metadata to merge, e.g. data/cmc-roots.json')
    args = parser.parse_args()
    if args.max_people < 1 or args.max_depth < 0:
        parser.error('max-people must be positive and max-depth nonnegative')
    client = MGP(args.cache, args.delay)
    if args.search:
        print(json.dumps(client.search(args.search), ensure_ascii=False, indent=2))
        return
    inputs = args.people + (args.names_file.read_text().splitlines() if args.names_file else [])
    overlay = json.loads(args.overlay.read_text()) if args.overlay else {}
    roots = list(overlay.get('defaultRoots', []))
    people = {p['id']: p for p in overlay.get('people', [])}
    for value in inputs:
        value = value.strip()
        if not value or value.startswith('#'):
            continue
        match = re.fullmatch(r'(?:mgp-)?(\d+)', value) or re.search(r'mathgenealogy\.(?:org|com)/id\.php\?id=(\d+)', value)
        if match:
            identifier = match.group(1)
        else:
            candidates = client.search(value)
            if len(candidates) != 1:
                raise ValueError(f'{value!r} matched {len(candidates)} records. Run --search {value!r}, then pass the correct ID. Candidates: {candidates}')
            identifier = candidates[0]['id']
        if 'mgp-' + identifier not in roots:
            roots.append('mgp-' + identifier)
    if not roots:
        parser.error('Provide names/IDs, --names-file, or an overlay with defaultRoots.')
    queue = deque((identifier, 0) for identifier in roots)
    seen = set()
    fetched = 0
    warnings = []
    def save():
        document = {'title': overlay.get('title', 'Academic genealogy'), 'description': overlay.get('description', 'A sourced snapshot of advisor relationships from the Mathematics Genealogy Project.'), 'updated': date.today().isoformat(), 'defaultRoots': roots, 'people': list(people.values()), 'warnings': warnings}
        for key in ['rosterSource', 'rosterNote']:
            if key in overlay:
                document[key] = overlay[key]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + '.tmp')
        temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(args.output)
    while queue:
        identifier, depth = queue.popleft()
        if identifier in seen:
            continue
        seen.add(identifier)
        existing = people.get(identifier)
        if identifier.startswith('mgp-') and fetched < args.max_people and depth <= args.max_depth:
            person, advisor_names = client.person(identifier[4:])
            if existing:
                person.update({k: v for k, v in existing.items() if k in ['aliases', 'role']})
                if existing.get('preferredName'):
                    person['aliases'] = list(dict.fromkeys(person.get('aliases', []) + [person['name']]))
                    person['name'] = existing['preferredName']
                if existing.get('note') and not existing.get('incomplete'):
                    person['note'] = existing['note']
            people[identifier] = person
            fetched += 1
            print(f'{fetched}: {person["name"]} ({person["year"]})', file=sys.stderr, flush=True)
            for aid in person['advisors']:
                people.setdefault(aid, {'id': aid, 'mgpId': int(aid[4:]), 'name': advisor_names[aid], 'year': None, 'institution': '', 'advisors': [], 'sources': [{'label': 'Mathematics Genealogy Project', 'url': BASE + 'id.php?id=' + aid[4:]}], 'incomplete': True, 'note': 'Ancestor record has not yet been fetched; the relationship is sourced on the student’s record.'})
        elif not existing:
            raise ValueError(f'Missing root record {identifier}; increase --max-people or --max-depth.')
        elif identifier.startswith('mgp-'):
            warnings.append(f'Record {identifier} was not fetched because a configured bound was reached.')
        for aid in people[identifier]['advisors']:
            queue.append((aid, depth + 1))
        save()
    save()
    print(f'Wrote {len(people)} people to {args.output}', file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except (requests.RequestException, ValueError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
