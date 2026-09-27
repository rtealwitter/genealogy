import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { subgraph } from '../graph.js';
import { buildLayout } from '../layout.js';
import { preparePosterLayout } from '../poster-layout.js';
import { getPosterMetrics, createPosterDocument, createPosterSvg } from '../poster.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/genealogy.json', import.meta.url)));
const graph = subgraph(new Map(data.people.map(person => [person.id, person])), data.defaultRoots);
for (const node of graph.nodes) { node.width = 190; node.height = 75; }
const original = buildLayout(graph, data.defaultRoots);
const folded = preparePosterLayout(original, { mode: 'landscape' });

test('landscape folding retains every person and relationship while enlarging the full tree', () => {
  assert.equal(folded.posterLayout, 'landscape');
  assert.deepEqual(new Set(folded.nodes.map(node => node.id)), new Set(original.nodes.map(node => node.id)));
  assert.deepEqual(folded.edges.map(edge => [edge.from, edge.to]), original.edges.map(edge => [edge.from, edge.to]));
  const before = getPosterMetrics(original, 'arch-d');
  const after = getPosterMetrics(original, 'arch-d', 'landscape');
  assert.ok(after.nameSize > before.nameSize * 1.3);
  assert.equal(after.width, 36);
  assert.equal(after.height, 24);
  assert.equal(preparePosterLayout(original), original);
  assert.equal(preparePosterLayout(folded, { mode: 'landscape' }), folded);
});

test('each cut relationship has two matching continuations and every path stays on the page', () => {
  const counts = new Map();
  for (const marker of folded.continuations) counts.set(marker.label, (counts.get(marker.label) || 0) + 1);
  assert.equal(counts.size, folded.continuationCount);
  assert.ok([...counts.values()].every(count => count === 2));
  assert.equal(folded.edges.filter(edge => edge.segments.length === 2).length, counts.size);
  for (const edge of folded.edges) {
    assert.ok(edge.segments.length === 1 || edge.segments.length === 2);
    for (const points of edge.segments) for (const point of points) {
      assert.ok(Number.isFinite(point.x) && point.x >= 0 && point.x <= folded.width);
      assert.ok(Number.isFinite(point.y) && point.y >= 0 && point.y <= folded.height);
    }
  }
  for (const node of folded.nodes) {
    assert.ok(node.x - node.width / 2 >= 0 && node.x + node.width / 2 <= folded.width);
    assert.ok(node.y - node.height / 2 >= 0 && node.y + node.height / 2 <= folded.height);
  }
  for (const panel of folded.panels) {
    const markers = folded.continuations.filter(marker => marker.x >= panel.x && marker.x <= panel.x + panel.width).sort((a, b) => a.x - b.x);
    for (let i = 1; i < markers.length; i++) assert.ok(markers[i].x - markers[i - 1].x >= 33.99);
  }
  // Preparing a poster never mutates the interactive tree.
  assert.ok(original.edges.every(edge => edge.points.length && !edge.segments));
});

test('PDF and SVG preserve the complete graph as vectors and keep a uniform name size', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(fs.readFileSync(url));
  try {
    const options = { size: 'arch-d', layoutMode: 'landscape' };
    const doc = await createPosterDocument(original, options);
    assert.equal(doc.getNumberOfPages(), 1);
    assert.equal(doc.internal.pageSize.getWidth(), 2592);
    assert.equal(doc.internal.pageSize.getHeight(), 1728);
    const svg = await createPosterSvg(original, options);
    assert.match(svg, /Read down each column/);
    assert.match(svg, /Earlier generations/);
    assert.match(svg, /Later generations/);
    assert.ok(!svg.includes('<image'));
    assert.equal([...svg.matchAll(/<path /g)].length, original.edges.length + folded.continuationCount);
    const nameSize = getPosterMetrics(original, 'arch-d', 'landscape').nameSize;
    const nameTexts = [...svg.matchAll(/<text[^>]+font-size="([^"]+)"[^>]*>([^<]*)<\/text>/g)].filter(match => Number(match[1]) === nameSize);
    assert.ok(nameTexts.length >= original.nodes.length);
    assert.match(svg, /data:font\/ttf;base64,/);
    assert.match(svg, /style="font-family:GenealogyFallback,serif"[^>]*>[^<]*Ṭ/);
    assert.ok(!svg.includes('University of Michigan'));
  } finally { globalThis.fetch = previousFetch; }
});
