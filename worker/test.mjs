import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validate, MGPBroker } from './index.js';

test('only bounded names and numeric record IDs reach the upstream', () => {
  assert.equal(validate(new URL('https://test/person?id=339304')).key, 'v2:person:339304');
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
