import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// The block/gate/rasta Polygon/Marker/Polyline JSX moved out of HomeScreen.tsx into shared
// layer components (src/views/components/map/*) — see docs/ARCHITECTURE.md. Each
// component renders a 'nav' variant (simple, fixed z-order) and a 'home' variant (interactive,
// selection/focus-aware z-order) — the checks below target the home variant specifically.
const blockLayer = readFileSync('src/views/components/map/BlockLayer.tsx', 'utf8');
const gateLayer = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const rastaLayer = readFileSync('src/views/components/map/RastaLayer.tsx', 'utf8');

// --- block Polygon must have an explicit, low zIndex -----------------------
// BlockLayer renders a Polygon with this key template in both the nav and home variants —
// take the last match, since the home (interactive, tappable) branch is written second.

const blockPolygonMatches = [...blockLayer.matchAll(/<Polygon\s+key=\{`\$\{keyPrefix\}_\$\{block\.id\}`\}[\s\S]*?\/>/g)];
assert(blockPolygonMatches.length >= 1, 'BlockLayer must render the v2 block Polygon layer.');
const blockPolygonBlock = blockPolygonMatches[blockPolygonMatches.length - 1][0];
assert(blockPolygonBlock.includes('tappable'), 'The extracted block Polygon block must be the interactive home variant.');

const blockZIndexMatch = blockPolygonBlock.match(/zIndex=\{(-?\d+)\}/);
assert(blockZIndexMatch, 'Block Polygon must declare an explicit numeric zIndex.');
const blockZIndex = Number(blockZIndexMatch![1]);

// --- extract gate marker zIndex expression ---------------------------------
// Gate markers use a conditional expression: gate.isSelected ? A : focused ? B : C
// The lowest of the three branches is the relevant floor to compare against.

const gateMarkerMatch = gateLayer.match(/<Marker[\s\S]*?<\/Marker>/);
assert(gateMarkerMatch, 'GateLayer must render v2 gate markers.');
const gateZIndexExprMatch = gateLayer.match(
  /zIndex=\{gate\.isSelected \? (-?\d+) : focused \? (-?\d+) : (-?\d+)\}/,
);
assert(gateZIndexExprMatch, 'Gate marker zIndex expression must be extractable from source.');
const gateZIndexValues = gateZIndexExprMatch!.slice(1, 4).map(Number);
const minGateZIndex = Math.min(...gateZIndexValues);

// --- extract rasta polyline zIndex expressions ------------------------------
// Two stacked Polylines per rasta, each: rasta.isSelected ? A : focused ? B : C

const rastaPolylineMatches = [...rastaLayer.matchAll(/zIndex=\{rasta\.isSelected \? (-?\d+) : focused \? (-?\d+) : (-?\d+)\}/g)];
assert(rastaPolylineMatches.length >= 1, 'Rasta polyline zIndex expressions must be present in source.');
const rastaZIndexValues = rastaPolylineMatches.flatMap((match) => match.slice(1, 4).map(Number));
const minRastaZIndex = Math.min(...rastaZIndexValues);

// --- assertions --------------------------------------------------------------

assert.equal(blockZIndex, 1, 'Block Polygon zIndex should be the low, explicit value set by the layering fix.');

assert(
  blockZIndex < minGateZIndex,
  `Block Polygon zIndex (${blockZIndex}) must be lower than every gate marker zIndex branch (min ${minGateZIndex}), so blocks never render above gates.`,
);

assert(
  blockZIndex < minRastaZIndex,
  `Block Polygon zIndex (${blockZIndex}) must be lower than every rasta polyline zIndex branch (min ${minRastaZIndex}), so blocks never render above rasta paths.`,
);

console.log('Layer zIndex v2 checks passed.');
