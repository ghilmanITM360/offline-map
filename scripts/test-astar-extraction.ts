// B2a extraction gate: golden parity, Dijkstra differential, edge cases, re-exports, module independence.
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as sharedAStar from '../packages/offline-navigation/src/domain/algorithms/AStar';
import * as sharedHeap from '../packages/offline-navigation/src/domain/algorithms/MinHeap';
import * as legacyAStar from '../src/utils/AStar';
import * as legacyHeap from '../src/utils/MinHeap';
import { computeGoldenSnapshot, computeTieSnapshot, sha256 } from './astar-golden-lib';

const { runAStar, reconstructAStarPath } = sharedAStar;
const ALGO_DIR = 'packages/offline-navigation/src/domain/algorithms';

// ---- Golden parity (fixture captured pre-extraction by capture-astar-golden.ts; never rewritten here) ----
{
  const golden = JSON.parse(readFileSync('scripts/fixtures/astar-golden-baseline.json', 'utf8'));
  const now = computeGoldenSnapshot();
  for (const key of ['nodeCount', 'pairCount', 'routableCount', 'unreachableCount', 'pathHash', 'costHash', 'graphHash', 'sampledCosts'] as const) {
    assert.deepEqual(now[key], golden[key], `golden mismatch: ${key}`);
  }
  assert.deepEqual(computeTieSnapshot(), golden.tie, 'tie-breaking changed');
  // Extraction moved the files byte-for-byte.
  assert.equal(sha256(readFileSync(`${ALGO_DIR}/AStar.ts`, 'utf8')), golden.algorithmSourceHashes['src/utils/AStar.ts']);
  assert.equal(sha256(readFileSync(`${ALGO_DIR}/MinHeap.ts`, 'utf8')), golden.algorithmSourceHashes['src/utils/MinHeap.ts']);
}

// ---- Independent Dijkstra oracle: O(V^2) array scan, no heap, no AStar import ----
type G = Record<string, Array<{ to: string; w: number }>>;
const dijkstra = (g: G, src: string): Record<string, number> => {
  const dist: Record<string, number> = {};
  for (const n of Object.keys(g)) dist[n] = Infinity;
  dist[src] = 0;
  const done = new Set<string>();
  for (;;) {
    let u: string | undefined;
    for (const n of Object.keys(g)) if (!done.has(n) && dist[n] < Infinity && (u === undefined || dist[n] < dist[u])) u = n;
    if (u === undefined) return dist;
    done.add(u);
    for (const e of g[u]) if (dist[u] + e.w < dist[e.to]) dist[e.to] = dist[u] + e.w;
  }
};

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const search = (g: G, s: string, t: string, h: (n: string) => number) =>
  runAStar<{ w: number }>({
    seeds: [{ id: s, gScore: 0 }],
    heuristic: h,
    neighbors: (n) => g[n].map((e) => ({ to: e.to, weight: e.w, edge: { w: e.w } })),
    isGoal: (n) => n === t,
  });

let comparisons = 0;
for (let seed = 1; seed <= 1200; seed++) {
  const rand = rng(seed);
  const n = 1 + Math.floor(rand() * 20);
  const g: G = {};
  for (let i = 0; i < n; i++) g[`n${i}`] = [];
  const edges = Math.floor(rand() * n * 3);
  for (let i = 0; i < edges; i++) {
    // Integer weights (incl. 0, parallel edges, self-loops) keep float comparison exact.
    g[`n${Math.floor(rand() * n)}`].push({ to: `n${Math.floor(rand() * n)}`, w: Math.floor(rand() * 6) });
  }
  const s = `n${Math.floor(rand() * n)}`;
  const t = `n${Math.floor(rand() * n)}`;
  // Reverse-graph distances give an exact, consistent heuristic for the second variant.
  const rev: G = {};
  for (const k of Object.keys(g)) rev[k] = [];
  for (const [from, es] of Object.entries(g)) for (const e of es) rev[e.to].push({ to: from, w: e.w });
  const toT = dijkstra(rev, t);
  const expected = dijkstra(g, s)[t];

  for (const h of [() => 0, (x: string) => (toT[x] === Infinity ? 0 : toT[x] * 0.5)]) {
    const r = search(g, s, t, h);
    if (expected === Infinity) assert.equal(r, undefined, `seed ${seed}: expected unreachable`);
    else {
      assert.ok(r, `seed ${seed}: expected reachable`);
      assert.equal(r.gScore[t], expected, `seed ${seed}: cost differs from Dijkstra`);
      const { nodes, edges: es } = reconstructAStarPath(r, t);
      assert.equal(nodes[0], s);
      assert.equal(nodes[nodes.length - 1], t);
      assert.equal(es.reduce((a, e) => a + e.w, 0), expected, `seed ${seed}: path cost != reported cost`);
      assert.deepEqual(reconstructAStarPath(search(g, s, t, h)!, t).nodes, nodes, `seed ${seed}: non-deterministic path`);
    }
    comparisons++;
  }
}
assert.ok(comparisons >= 1000);

// ---- Edge cases (current behavior, recorded not changed) ----
{
  const g: G = { a: [{ to: 'b', w: 2 }], b: [], c: [] };
  // source == destination: goal is hit on first pop, zero cost, single-node path
  const same = search(g, 'a', 'a', () => 0)!;
  assert.equal(same.gScore.a, 0);
  assert.deepEqual(reconstructAStarPath(same, 'a'), { nodes: ['a'], edges: [] });
  // unreachable and unknown goal
  assert.equal(search(g, 'a', 'c', () => 0), undefined);
  assert.equal(search(g, 'a', 'zzz', () => 0), undefined);
  // no seeds
  assert.equal(runAStar({ seeds: [], heuristic: () => 0, neighbors: () => [], isGoal: () => true }), undefined);
  // multi-seed: cheaper seed wins; duplicate seed keeps lowest gScore
  const multi = runAStar<never>({
    seeds: [{ id: 'a', gScore: 10 }, { id: 'a', gScore: 1 }, { id: 'c', gScore: 0 }],
    heuristic: () => 0,
    neighbors: (n) => (n === 'a' ? [{ to: 'b', weight: 2 }] : []),
    isGoal: (n) => n === 'b',
  })!;
  assert.equal(multi.gScore.b, 3);
  // tie: S->A->T and S->B->T equal cost; unchanged algorithm picks A (insertion order)
  assert.deepEqual(computeTieSnapshot(), { path: ['S', 'A', 'T'], cost: 2 });
  // zero-weight cycle terminates
  const cyc: G = { a: [{ to: 'b', w: 0 }], b: [{ to: 'a', w: 0 }, { to: 'c', w: 1 }], c: [] };
  assert.equal(search(cyc, 'a', 'c', () => 0)!.gScore.c, 1);
  // MinHeap boundary
  const heap = new sharedHeap.MinHeap<number>();
  for (const p of [5, 1, 1, 3, 0, 9]) heap.push(p, p);
  const out: number[] = [];
  while (!heap.isEmpty()) out.push(heap.pop()!.priority);
  assert.deepEqual(out, [0, 1, 1, 3, 5, 9]);
}

// ---- Compatibility re-exports resolve to the single shared implementation ----
assert.strictEqual(legacyAStar.runAStar, sharedAStar.runAStar);
assert.strictEqual(legacyAStar.reconstructAStarPath, sharedAStar.reconstructAStarPath);
assert.strictEqual(legacyHeap.MinHeap, sharedHeap.MinHeap);
for (const f of ['AStar', 'MinHeap']) {
  const body = readFileSync(`src/utils/${f}.ts`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.equal(body, `export * from '../../packages/offline-navigation/src/domain/algorithms/${f}';`);
}

// ---- Module independence + exactly one implementation ----
{
  const importsOf = (p: string) => [...readFileSync(p, 'utf8').matchAll(/^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(importsOf(`${ALGO_DIR}/AStar.ts`), ['./MinHeap']);
  assert.deepEqual(importsOf(`${ALGO_DIR}/MinHeap.ts`), []);
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((e) => {
      const p = join(d, e);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
    });
  const files = [...walk('src'), ...walk('packages')].filter((p) => !p.includes('__tests__'));
  const hits = (re: RegExp) => files.filter((p) => re.test(readFileSync(p, 'utf8')));
  assert.deepEqual(hits(/\bclass\s+MinHeap\b/), [`${ALGO_DIR}/MinHeap.ts`]);
  assert.deepEqual(hits(/\bfunction\s+runAStar\b/), [`${ALGO_DIR}/AStar.ts`]);
  assert.deepEqual(hits(/\bfunction\s+reconstructAStarPath\b/), [`${ALGO_DIR}/AStar.ts`]);
  // Package domain must not reach into the app.
  // Relative imports may cross domain subfolders (e.g. ../geo) but never leave the domain root.
  const domainRoot = resolve('packages/offline-navigation/src/domain');
  for (const p of walk('packages')) for (const spec of importsOf(p)) {
    assert.ok(spec.startsWith('.') && resolve(dirname(p), spec).startsWith(domainRoot), `${p} imports ${spec}`);
  }
}

console.log(JSON.stringify({ name: 'astar-extraction', seededComparisons: comparisons, status: 'PASS' }));
