import { decodeHTML } from 'entities';

const BASE = 'https://www.mathgenealogy.org/';
const DELAY = 10_000;
const ORIGINS = new Set(['https://www.rtealwitter.com', 'https://rtealwitter.com',
  'https://rtealwitter.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000',
  'http://localhost:8765', 'http://127.0.0.1:8765']);
const clean = value => decodeHTML(String(value || '')).replace(/\s+/g, ' ').trim();
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers });

export function validate(url) {
  if (url.pathname === '/person') {
    const id = url.searchParams.get('id') || '';
    if (!/^[1-9]\d{0,7}$/.test(id)) throw new Error('Enter a valid numeric MGP ID.');
    return { type: 'person', value: id, key: `v2:person:${id}` };
  }
  if (url.pathname === '/search') {
    const q = clean(url.searchParams.get('q'));
    if (q.length < 2 || q.length > 120 || /[\u0000-\u001f\u007f]/.test(url.searchParams.get('q') || '')) {
      throw new Error('Enter a name between 2 and 120 characters.');
    }
    return { type: 'search', value: q, key: `v2:search:${q.toLocaleLowerCase('en-US')}` };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && !ORIGINS.has(origin)) return json({ error: 'This origin is not allowed.' }, 403);
    const headers = { 'Vary': 'Origin', 'Cache-Control': 'no-store',
      'Access-Control-Expose-Headers': 'Retry-After, X-Genealogy-Cache' };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, headers);
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, source: BASE, crawlDelaySeconds: 10 }, 200, headers);
    try {
      const query = validate(url);
      if (!query) return json({ error: 'Not found.' }, 404, headers);
      const response = await env.MGP.get(env.MGP.idFromName('global-mgp-broker')).fetch(request);
      const result = new Response(response.body, response);
      for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
      return result;
    } catch (error) {
      return json({ error: error.message }, error.message.startsWith('Enter ') ? 400 : 502, headers);
    }
  }
};

// All users and locations share this one object. Its durable clock survives restarts.
export class MGPBroker {
  constructor(ctx) {
    this.ctx = ctx;
    this.busy = false;
    this.nextFetch = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.nextFetch = await ctx.storage.get('nextFetch') || 0;
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL)');
    });
  }

  async fetch(request) {
    const query = validate(new URL(request.url));
    if (!query) return json({ error: 'Not found.' }, 404);
    const row = this.ctx.storage.sql.exec('SELECT body FROM cache WHERE key = ? AND expires > ?', query.key, Date.now()).toArray()[0];
    if (row) return new Response(row.body, { headers: { 'Content-Type': 'application/json', 'X-Genealogy-Cache': 'hit' } });
    if (this.busy || Date.now() < this.nextFetch) return json({
      error: 'The source is being accessed respectfully. Please retry shortly.', retryable: true
    }, 429, { 'Retry-After': String(Math.max(1, Math.ceil((this.nextFetch - Date.now()) / 1000), this.busy ? 10 : 0)) });
    this.busy = true;
    try {
      let result;
      if (query.type === 'person') {
        result = await parsePerson(await this.upstream(`id.php?id=${query.value}`), query.value);
      } else {
        const parts = query.value.split(' ');
        const form = new URLSearchParams({ given_name: parts.length > 1 ? parts[0] : '', family_name: parts.at(-1), chrono: '0' });
        const html = await this.upstream('query-prep.php', { method: 'POST', body: form });
        result = await parseSearch(html);
      }
      result.fetchedAt = new Date().toISOString();
      const body = JSON.stringify(result), now = Date.now();
      const ttl = query.type === 'person' ? 90 * 86400_000 : 7 * 86400_000;
      this.ctx.storage.sql.exec('DELETE FROM cache WHERE expires <= ?', now);
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO cache VALUES (?, ?, ?, ?)', query.key, body, now + ttl, now);
      // Keep storage bounded even if a public client searches a large variety of names.
      this.ctx.storage.sql.exec('DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY created DESC LIMIT -1 OFFSET 10000)');
      return new Response(body, { headers: { 'Content-Type': 'application/json', 'X-Genealogy-Cache': 'miss' } });
    } catch (error) {
      return json({ error: error.message || 'The genealogy source is unavailable. Please try again.', retryable: true }, 502);
    } finally { this.busy = false; }
  }

  async upstream(path, options = {}) {
    let url = new URL(path, BASE), cookie = '';
    for (let redirect = 0; redirect < 4; redirect++) {
      if (url.origin !== new URL(BASE).origin || !/^\/(id|query-prep|results)\.php$/.test(url.pathname)) {
        throw new Error('The genealogy source returned an unexpected redirect.');
      }
      const wait = this.nextFetch - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.nextFetch = Date.now() + DELAY;
      await this.ctx.storage.put('nextFetch', this.nextFetch);
      const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(25_000), headers: {
        'User-Agent': 'AcademicGenealogy/1.0 (+https://www.rtealwitter.com/genealogy/; cached; 10-second crawl delay)',
        ...(cookie ? { Cookie: cookie } : {})
      } });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
      if (response.status >= 300 && response.status < 400 && response.headers.has('Location')) {
        url = new URL(response.headers.get('Location'), url);
        options = {};
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) throw new Error(`The genealogy source returned HTTP ${response.status}. Please try again later.`);
      const html = await response.text();
      if (html.length > 2_000_000 || !html.includes('Mathematics Genealogy Project')) throw new Error('The genealogy source returned an unexpected page.');
      return html;
    }
    throw new Error('The genealogy source redirected too many times.');
  }
}

function collect(rewriter, selector, items) {
  let item;
  return rewriter.on(selector, {
    element(element) { item = { text: '', href: element.getAttribute('href') }; items.push(item); },
    text(chunk) { if (item) item.text += chunk.text; }
  });
}

export async function parsePerson(html, id) {
  const names = [], degrees = [], schools = [], paragraphs = [];
  let paragraph, link;
  let rewriter = new HTMLRewriter();
  rewriter = collect(rewriter, 'h2', names);
  rewriter = collect(rewriter, 'span[style*="margin-right: 0.5em"]', degrees);
  rewriter = collect(rewriter, 'span[style*="margin-right: 0.5em"] span', schools);
  rewriter.on('p', {
    element(element) { paragraph = { text: '', links: [] }; paragraphs.push(paragraph); element.onEndTag(() => { paragraph = null; }); },
    text(chunk) { if (paragraph) paragraph.text += chunk.text; }
  }).on('p a[href*="id.php?id="]', {
    element(element) { link = { href: element.getAttribute('href'), text: '' }; if (paragraph) paragraph.links.push(link); },
    text(chunk) { if (link) link.text += chunk.text; }
  });
  await rewriter.transform(new Response(html)).text();
  const name = clean(names[0]?.text);
  if (!name || /not found|error|search/i.test(name)) throw new Error('No person record was found for that MGP ID.');
  const advisorNames = {};
  for (const p of paragraphs) if (/^Advisor(?:s|\s*\d*)?:/.test(clean(p.text))) {
    for (const a of p.links) {
      const match = a.href?.match(/[?&]id=(\d+)/);
      if (match) advisorNames[`mgp-${match[1]}`] = clean(a.text);
    }
  }
  const year = clean(degrees[0]?.text).match(/\b(1\d{3}|20\d{2})\b/);
  const person = { id: `mgp-${id}`, mgpId: Number(id), name, year: year ? Number(year[1]) : null,
    institution: clean(schools[0]?.text), advisors: Object.keys(advisorNames),
    sources: [{ label: 'Mathematics Genealogy Project', url: `${BASE}id.php?id=${id}` }] };
  if (!person.advisors.length) person.note = 'No advisor is recorded in the Mathematics Genealogy Project. This is a limit of the record, not evidence of no advisor.';
  return { person, advisorNames };
}

export async function parseSearch(html) {
  const rows = [];
  let row, link;
  const rewriter = new HTMLRewriter().on('tr', {
    element(element) { row = { text: '', links: [] }; rows.push(row); element.onEndTag(() => { row = null; }); },
    text(chunk) { if (row) row.text += chunk.text; }
  }).on('tr td', { element() { if (row) row.text += ' '; } }).on('tr a[href*="id.php?id="]', {
    element(element) { link = { href: element.getAttribute('href'), text: '' }; if (row) row.links.push(link); },
    text(chunk) { if (link) link.text += chunk.text; }
  });
  await rewriter.transform(new Response(html)).text();
  if (/non-null query|could not execute|database error/i.test(html)) throw new Error('The genealogy search session failed. Please try again.');
  const candidates = [];
  const seen = new Set();
  for (const row of rows) for (const a of row.links) {
    const id = a.href?.match(/[?&]id=(\d+)/)?.[1];
    if (id && !seen.has(id)) { seen.add(id); candidates.push({ id, name: clean(a.text), detail: clean(row.text) }); }
  }
  return { candidates: candidates.slice(0, 100), truncated: candidates.length > 100 };
}
