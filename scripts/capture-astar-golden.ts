// One-shot capture. Run ONCE against the pre-extraction source; never re-run after changing the algorithm.
// Refuses to overwrite an existing fixture.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { computeGoldenSnapshot, computeTieSnapshot, sha256 } from './astar-golden-lib';

const out = 'scripts/fixtures/astar-golden-baseline.json';
if (existsSync(out)) throw new Error(`${out} already exists; golden data must not be overwritten`);
const src = (p: string) => sha256(readFileSync(p, 'utf8'));
const snapshot = {
  sourceSha: execSync('git rev-parse HEAD').toString().trim(),
  algorithmSourceHashes: { 'src/utils/AStar.ts': src('src/utils/AStar.ts'), 'src/utils/MinHeap.ts': src('src/utils/MinHeap.ts') },
  ...computeGoldenSnapshot(),
  tie: computeTieSnapshot(),
};
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({ ...snapshot, sampledCosts: undefined }, null, 2));
