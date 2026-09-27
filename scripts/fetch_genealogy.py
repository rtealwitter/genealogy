#!/usr/bin/env python3
"""Fetch bounded MGP ancestry and optional direct students, with cached HTML and citations."""
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


def mgp_record(identifier, name, **fields):
    """Use the same identity, source, and missing-value fields for every MGP record."""
    return {
        'id': f'mgp-{identifier}', 'mgpId': int(identifier), 'name': name,
        'year': None, 'institution': '', 'advisors': [],
        'sources': [{'label': 'Mathematics Genealogy Project',
                     'url': BASE + 'id.php?id=' + str(identifier)}],
        **fields,
    }


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

    def students(self, identifier):
        """Read direct student rows only; descendant counts are not student records."""
        soup = self.get('id.php?id=' + str(identifier))
        if soup.find('h2') is None:
            raise ValueError(f'MGP record {identifier} has no person heading.')
        if 'No students known.' in soup.get_text(' ', strip=True):
            return []
        marker = next((p for p in soup.find_all('p')
                       if re.match(r'^Students?:', clean(p.get_text(' ', strip=True)))), None)
        table = marker.find_next('table') if marker else None
        if table is None or not {'Name', 'School', 'Year'}.issubset(
                {clean(th.get_text()) for th in table.find_all('th')}):
            raise ValueError(f'Unrecognized student table in MGP record {identifier}.')
        students = {}
        for row in table.find_all('tr'):
            cells = row.find_all('td', recursive=False)
            a = cells[0].select_one('a[href*="id.php?id="]') if cells else None
            if a:
                sid = 'mgp-' + re.search(r'id=(\d+)', a['href']).group(1)
                students.setdefault(sid, {'id': sid, 'name': clean(a.get_text())})
        if not students:
            raise ValueError(f'MGP record {identifier} has a student section but no parsed students.')
        return list(students.values())

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
        advisor_names = {}
        relationship_notes = []
        for p in soup.find_all('p'):
            label = re.match(r'((?:Doctoral\s+)?Advisor|Adviser|Tutor|Teacher|Mentor|Supervisor)(?:s|\s*\d*)?:', clean(p.get_text(' ', strip=True)), re.I)
            if label:
                for a in p.select('a[href*="id.php?id="]'):
                    aid = 'mgp-' + re.search(r'id=(\d+)', a['href']).group(1)
                    if aid not in advisor_names:
                        advisor_names[aid] = clean(a.get_text())
                        if label.group(1).lower() not in ('advisor', 'adviser', 'doctoral advisor'):
                            relationship_notes.append(f'MGP labels the relationship to {advisor_names[aid]} as {label.group(1).lower()}.')
        advisors = list(advisor_names)
        # Stop if MGP introduces a relationship label this parser does not understand.
        # Advisor links occur before the Student/Students section; never infer from descendants.
        header = re.split(r'Students?:|No students known\.', str(soup).split('</h2>', 1)[1], maxsplit=1)[0]
        linked_people = {'mgp-' + re.search(r'id=(\d+)', a['href']).group(1)
                         for a in BeautifulSoup(header, 'html.parser').select('a[href*="id.php?id="]')}
        if linked_people != set(advisors):
            raise ValueError(f'Unrecognized relationship markup in MGP record {identifier}; inspect the source instead of silently truncating ancestry.')
        result = mgp_record(identifier, name, year=year, institution=institution, advisors=advisors)
        if relationship_notes:
            result['note'] = ' '.join(relationship_notes)
        if not advisors:
            result['note'] = 'No advisor is recorded in the Mathematics Genealogy Project. This is a limit of the record, not evidence of no advisor.'
        return result, advisor_names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('people', nargs='*', help='MGP IDs, MGP URLs, or quoted names (ambiguous names require an ID)')
    parser.add_argument('--include-students', action='store_true', help='Include direct MGP students of selected people, verifying each student’s advisors; also fetch co-advisor ancestors within the same bounds')
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
    student_faculty = {}
    verified_students = set()
    student_names = {}
    unavailable_students = []
    if args.include_students:
        for identifier in roots:
            if not identifier.startswith('mgp-'):
                unavailable_students.append(people[identifier]['name'])
                continue
            for student in client.students(identifier[4:]):
                student_faculty.setdefault(student['id'], []).append(identifier)
                student_names[student['id']] = student['name']
        for sid, name in student_names.items():
            people.setdefault(sid, mgp_record(sid[4:], name, incomplete=True,
                note='Listed in a selected faculty member’s student table; the student’s own advisor record has not yet been verified.'))
    queue = deque((identifier, 0) for identifier in dict.fromkeys(roots + list(student_faculty)))
    seen = set()
    fetched = 0
    warnings = []
    def save():
        document = {'title': overlay.get('title', 'Academic genealogy'), 'description': overlay.get('description', 'A sourced snapshot of advisor relationships from the Mathematics Genealogy Project.'), 'updated': date.today().isoformat(), 'defaultRoots': roots, 'people': list(people.values()), 'warnings': warnings}
        if args.include_students:
            document['description'] += ' Includes direct students recorded by MGP and their co-advisor lineages.'
            document['defaultStudents'] = [sid for sid in student_faculty if sid in verified_students]
            document['studentNote'] = 'Direct students listed by MGP for the selected people; student records verify the advisor links. This is not a complete list of everyone they have supervised.'
            if unavailable_students:
                document['studentNote'] += ' Student lookup unavailable without an identified MGP record: ' + ', '.join(unavailable_students) + '.'
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
            if identifier in student_faculty:
                if not all(rid in person['advisors'] for rid in student_faculty[identifier]):
                    raise ValueError(f'Student {identifier} does not confirm the faculty advisor link from the student table; inspect both source records.')
                verified_students.add(identifier)
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
                people.setdefault(aid, mgp_record(aid[4:], advisor_names[aid], incomplete=True,
                    note='Ancestor record has not yet been fetched; the relationship is sourced on the student’s record.'))
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
