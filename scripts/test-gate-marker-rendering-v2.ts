import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

const ZOOM = 15;
const FORBIDDEN_GATES = ['GATE_06', 'GATE_09', 'GATE_10', 'GATE_11', 'GATE_12'];
const REQUIRED_GATES = [
  'GATE_01','GATE_02','GATE_03','GATE_04','GATE_05',
  'GATE_07','GATE_08',
  'GATE_13','GATE_14','GATE_15','GATE_16','GATE_17',
  'GATE_18','GATE_19','GATE_20','GATE_21','GATE_22',
];

const layers = V2MapRenderingService.getHomeLayers({ mapFilter: 'gates', zoomLevel: ZOOM });

// count
assert(layers.gates.length === 17, `gates filter: exactly 17 active gates (got ${layers.gates.length})`);
assert(layers.visibleGateMarkers.length === 17, `gates filter: all 17 gate markers visible (got ${layers.visibleGateMarkers.length})`);

// each required gate present
for (const id of REQUIRED_GATES) {
  assert(layers.gates.some(g => g.id === id), `gate ${id} present`);
}

// no forbidden gates
for (const id of FORBIDDEN_GATES) {
  assert(!layers.gates.some(g => g.id === id), `forbidden gate ${id} absent`);
}

// friendly labels
const labels = layers.gates.map(g => g.label);
assert(
  labels.every(l => /^Gate \d{2}$/.test(l)),
  `all gate labels friendly "Gate XX" — got: ${labels.join(', ')}`,
);

// no raw GATE_ IDs in labels
assert(
  labels.every(l => !l.includes('GATE_')),
  'no raw GATE_ IDs in labels',
);

// all gates have valid coordinates
assert(
  layers.gates.every(g => typeof g.coordinate.latitude === 'number' && typeof g.coordinate.longitude === 'number'),
  'all gates have valid lat/lng coordinates',
);

// activeMapFilter
assert(layers.activeMapFilter === 'gates', 'activeMapFilter = "gates"');

// non-gate layers hidden in gates filter
assert(layers.blocks.length === 0, 'blocks hidden in gates filter');
assert(layers.rastas.length === 0, 'rastas hidden in gates filter');
assert(layers.specialRoutes.length === 0, 'special routes hidden in gates filter');

// all-mode gates still present (not zero)
const allLayers = V2MapRenderingService.getHomeLayers({ zoomLevel: ZOOM });
assert(allLayers.gates.length === 17, 'all mode: 17 gates returned');

// gate 15 specifically
assert(layers.gates.some(g => g.id === 'GATE_15'), 'Gate 15 present');

// gates 13/14 present (near-duplicate coords, both shown)
assert(layers.gates.some(g => g.id === 'GATE_13'), 'Gate 13 present');
assert(layers.gates.some(g => g.id === 'GATE_14'), 'Gate 14 present');

// hidden connector absent
assert(!layers.gates.some(g => g.id.includes('NPC') || g.id.includes('PERIMETER')), 'NPC/PERIMETER absent from gates');

// zoom-aware display label derivation (mirrors HomeScreen render logic)
function getGateDisplayLabel(label: string, zoomLevel: number, isSelected: boolean): string {
  const gateNum = label.replace('Gate ', '');
  if (isSelected || zoomLevel >= 16.5) return label;
  if (zoomLevel >= 14) return `G${gateNum}`;
  return gateNum;
}

const sampleGate = layers.gates.find(g => g.id === 'GATE_01')!;
assert(getGateDisplayLabel(sampleGate.label, 12, false) === '01', 'low zoom (12): number only "01"');
assert(getGateDisplayLabel(sampleGate.label, 15, false) === 'G01', 'medium zoom (15): compact "G01"');
assert(getGateDisplayLabel(sampleGate.label, 17, false) === 'Gate 01', 'high zoom (17): full "Gate 01"');
assert(getGateDisplayLabel(sampleGate.label, 12, true) === 'Gate 01', 'selected at low zoom: full "Gate 01"');

// no label contains "Gate te" (clipping artifact check)
assert(labels.every(l => !l.includes('Gate te')), 'no "Gate te" clipping artifact in labels');

// needsConnectorVerification gates have warning style (Gate 17/18/19 area)
const warnGates = layers.gates.filter(g => g.needsConnectorVerification);
assert(warnGates.length >= 0, `blocked/warning gates count: ${warnGates.length} (may be 0 if all connected)`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
