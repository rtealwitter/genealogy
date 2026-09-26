import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validate, MGPBroker, parseRelationships, assertCompleteRelationships } from './index.js';

test('only bounded names and numeric record IDs reach the upstream', () => {
  assert.equal(validate(new URL('https://test/person?id=339304')).key, 'v4:person:339304');
  assert.equal(validate(new URL('https://test/search?q=Albert%20%20Einstein')).key, 'v2:search:albert einstein');
  for (const path of ['/person?id=0', '/person?id=https://example.com', '/person?id=1%26foo=bar', '/search?q=a', `/search?q=${'x'.repeat(121)}`, '/search?q=foo%0Abar']) {
    assert.throws(() => validate(new URL(`https://test${path}`)));
  }
  assert.equal(validate(new URL('https://test/proxy')), null);
});

test('CORS allows the website, rejects other origins, and exposes retry timing', async () => {
  const bad = await worker.fetch(new Request('https://test/health', { headers: { Origin: 'https://evil.example' } }), {});
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  const good = await worker.fetch(new Request('https://test/health', { headers: { Origin: 'https://www.rtealwitter.com' } }), {});
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), 'https://www.rtealwitter.com');
  assert.match(good.headers.get('Access-Control-Expose-Headers'), /Retry-After/);
  assert.equal((await good.json()).crawlDelaySeconds, 10);
});

test('invalid routes and methods never need the Durable Object binding', async () => {
  assert.equal((await worker.fetch(new Request('https://test/search?q=x'), {})).status, 400);
  assert.equal((await worker.fetch(new Request('https://test/arbitrary'), {})).status, 404);
  assert.equal((await worker.fetch(new Request('https://test/person?id=1', { method: 'POST' }), {})).status, 405);
});

test('global throttle rejects overlapping misses but cached records remain available', async () => {
  let cached = [];
  const broker = Object.create(MGPBroker.prototype);
  broker.ctx = { storage: { sql: { exec: () => ({ toArray: () => cached }) } } };
  broker.busy = true;
  broker.nextFetch = Date.now() + 9000;
  const request = new Request('https://test/person?id=53269');
  const limited = await broker.fetch(request);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '10');
  broker.busy = false;
  const clockLimited = await broker.fetch(request);
  assert.equal(clockLimited.status, 429);
  assert.ok(Number(clockLimited.headers.get('Retry-After')) >= 8);
  broker.busy = true;
  cached = [{ body: '{"person":{"name":"Albert Einstein"}}' }];
  const hit = await broker.fetch(request);
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get('X-Genealogy-Cache'), 'hit');
  assert.equal((await hit.json()).person.name, 'Albert Einstein');
});

test('historical tutors are included with their source label, without including student links', () => {
  const result = parseRelationships([
    { text: 'Tutor: Edward John Routh', links: [{ href: 'id.php?id=101929', text: 'Edward John Routh' }] },
    { text: 'Students: Example Student', links: [{ href: 'id.php?id=123', text: 'Example Student' }] },
    { text: 'An Advisor: mentioned in prose', links: [{ href: 'id.php?id=456', text: 'Unrelated' }] }
  ]);
  assert.deepEqual(result, {
    advisorNames: { 'mgp-101929': 'Edward John Routh' },
    notes: ['MGP labels the relationship to Edward John Routh as tutor.']
  });
});

test('numbered and plural relationship labels preserve all advisors and historical notes', () => {
  for (const label of ['Advisor 1', 'Advisors', 'Teacher', 'Mentors', 'Supervisor 2']) {
    const result = parseRelationships([{ text: `${label}: Example`, links: [{ href: 'id.php?id=12', text: 'Example' }] }]);
    assert.deepEqual(result.advisorNames, { 'mgp-12': 'Example' });
    assert.equal(result.notes.length, label.startsWith('Advisor') ? 0 : 1);
  }
});

test('all advisors from multiple degrees survive Doctoral advisor and Adviser labels', () => {
  const result = parseRelationships([
    { text: 'Doctoral advisor: Johann Andreas Quenstedt', links: [{ href: 'id.php?id=127956', text: 'Johann Andreas Quenstedt' }] },
    { text: 'Advisor 1: Example', links: [{ href: 'id.php?id=127801', text: 'Example' }] },
    { text: 'ADVISER: Another', links: [{ href: 'id.php?id=230796', text: 'Another' }] }
  ]);
  assert.deepEqual(Object.keys(result.advisorNames), ['mgp-127956', 'mgp-127801', 'mgp-230796']);
  assert.deepEqual(result.notes, []);
});

test('unrecognized ancestor links fail closed while student links are excluded', () => {
  const html = '<h2>Person</h2><p>Doctoral advisor: <a href="id.php?id=127956">Advisor</a></p><h3>Students:</h3><a href="id.php?id=12">Student</a>';
  assert.throws(() => assertCompleteRelationships(html, {}), /unrecognized advisor/);
  assert.doesNotThrow(() => assertCompleteRelationships(html, { 'mgp-127956': 'Advisor' }));
  assert.doesNotThrow(() => assertCompleteRelationships('<h2>Person</h2><p>No students known.</p>', {}));
});
