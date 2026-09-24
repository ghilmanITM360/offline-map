import { strict as assert } from 'node:assert';
import { validateV2Dataset, ValidationIssue, V2DatasetInput } from '../src/data/ijtema/v2Validation';
import { Block, CentralPoint, Gate, MapBounds, Rasta, SpecialRoute } from '../src/data/ijtema/types';

// ---------------------------------------------------------------------------
// Synthetic fixtures only. Never validated against real field/production data
// in this file's RED cases — see the separate real-dataset run at the bottom.
// ---------------------------------------------------------------------------

const BOUNDS: MapBounds = { minLat: 24.96, maxLat: 24.98, minLng: 66.99, maxLng: 67.02 };
const c = (lat: number, lng: number) => ({ lat, lng });

const validGate = (overrides: Partial<Gate> = {}): Gate => ({
  id: 'GATE_01',
  number: 1,
  name: { en: 'Gate 01' },
  coordinate: c(24.97, 67.0),
  aliases: ['Gate 01', 'Gate 1', 'G1'],
  category: 'gate',
  status: 'provided',
  entryRole: 'official_entry_exit',
  routingStatus: 'routable',
  isOfficialEntry: true,
  canStartRouteFromOutside: true,
  connectorStatus: 'verified_by_geometry',
  userFacingBehavior: { normalSearch: 'searchable', mapDisplay: 'visible', routeSelection: 'enabled' },
  ...overrides,
});

const validBlock = (overrides: Partial<Block> = {}): Block => ({
  id: 'B1',
  number: 1,
  name: { en: 'Block 1' },
  center: c(24.97, 67.0),
  corners: { c1: c(24.9701, 67.0001), c2: c(24.9701, 67.0002), c3: c(24.9702, 67.0001), c4: c(24.9702, 67.0002) },
  entryPoints: { c1: c(24.9701, 67.0001), c2: c(24.9701, 67.0002), c3: c(24.9702, 67.0001), c4: c(24.9702, 67.0002) },
  polygon: [c(24.9701, 67.0001), c(24.9701, 67.0002), c(24.9702, 67.0002), c(24.9702, 67.0001)],
  aliases: ['Block 1', 'B1'],
  category: 'block',
  status: 'provided',
  visual: { label: 'Block 1', fillKey: 'block-1', showLabelByDefault: true },
  ...overrides,
});

const validRasta = (overrides: Partial<Rasta> = {}): Rasta => {
  const points = [
    { id: 'R1-01' as const, rastaId: 'R1' as const, rastaNumber: 1, sequence: 1, coordinate: c(24.971, 67.001), name: { en: 'Rasta 01 Point 01' } },
    { id: 'R1-02' as const, rastaId: 'R1' as const, rastaNumber: 1, sequence: 2, coordinate: c(24.972, 67.002), name: { en: 'Rasta 01 Point 02' } },
  ];
  return {
    id: 'R1',
    number: 1,
    name: { en: 'Rasta 01' },
    points,
    segments: [{ id: 'R1_SEGMENT_01', pointIds: ['R1-01', 'R1-02'] }],
    junctions: [],
    aliases: ['Rasta 01', 'R1'],
    category: 'rasta',
    visual: { label: 'Rasta 01', strokeKey: 'rasta-01', showLabelByDefault: true },
    ...overrides,
  };
};

const validSpecialRoute = (): SpecialRoute => ({
  id: 'SP_TEST',
  name: { en: 'Test Special Route' },
  points: [{ id: 'SP_TEST-01', group: 'prp', sequence: 1, coordinate: c(24.973, 67.003), name: { en: 'Test Point 01' } }],
  aliases: ['Test Special Route'],
  category: 'special_route',
  visual: { label: 'Test Special Route', strokeKey: 'sp-test', showLabelByDefault: true },
});

const validCentralPoint = (): CentralPoint => ({
  id: 'P1',
  coordinate: c(24.974, 67.004),
  name: { en: 'Central Point 1' },
  developerLabel: 'P1',
});

const baseInput = (overrides: Partial<V2DatasetInput> = {}): V2DatasetInput => ({
  gates: [validGate()],
  blocks: [validBlock()],
  rastas: [validRasta()],
  specialRoutes: [validSpecialRoute()],
  centralPoints: [validCentralPoint()],
  graphAdjacency: { GATE_01: ['edge'], B1_C1: ['edge'], B1_C2: [], B1_C3: [], B1_C4: [] },
  bounds: BOUNDS,
  ...overrides,
});

const hasIssue = (issues: ValidationIssue[], code: string, entityId?: string): boolean =>
  issues.some((issue) => issue.code === code && (entityId === undefined || issue.entityId === entityId));

// --- RED: a fully valid baseline dataset must report zero errors/warnings ---
{
  const report = validateV2Dataset(baseInput());
  assert.equal(report.valid, true, `Baseline fixture should be valid:\n${JSON.stringify(report.errors, null, 2)}`);
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length, 0);
}

// --- duplicate ID within the same entity type ---
{
  const report = validateV2Dataset(baseInput({ gates: [validGate(), validGate()] }));
  assert(hasIssue(report.errors, 'DUPLICATE_ID', 'GATE_01'), 'Duplicate gate ID must be reported as an error');
}

// --- duplicate ID across different entity types ---
{
  const report = validateV2Dataset(baseInput({ blocks: [validBlock({ id: 'GATE_01' as unknown as Block['id'] })] }));
  assert(hasIssue(report.errors, 'DUPLICATE_ID'), 'Cross-entity duplicate ID (gate vs block) must be reported');
}

// --- duplicate alias across different entities (ambiguous search) ---
{
  const report = validateV2Dataset(baseInput({ blocks: [validBlock({ aliases: ['Block 1', 'B1', 'Gate 01'] })] }));
  assert(hasIssue(report.warnings, 'DUPLICATE_ALIAS'), 'Cross-entity duplicate alias must be reported as a warning');
}

// --- malformed (Infinity) coordinate ---
{
  const report = validateV2Dataset(baseInput({ gates: [validGate({ coordinate: c(Infinity, 67.0) })] }));
  assert(hasIssue(report.errors, 'MALFORMED_COORDINATE', 'GATE_01'), 'Infinity coordinate must be reported');
}

// --- NaN coordinate ---
{
  const report = validateV2Dataset(baseInput({ gates: [validGate({ coordinate: c(NaN, 67.0) })] }));
  assert(hasIssue(report.errors, 'MALFORMED_COORDINATE', 'GATE_01'), 'NaN coordinate must be reported');
}

// --- out-of-bounds coordinate ---
{
  const report = validateV2Dataset(baseInput({ gates: [validGate({ coordinate: c(0.1, 0.1) })] }));
  assert(hasIssue(report.errors, 'OUT_OF_BOUNDS_COORDINATE', 'GATE_01'), 'Out-of-bounds coordinate must be reported');
}

// --- empty name ---
{
  const report = validateV2Dataset(baseInput({ centralPoints: [validCentralPoint(), { ...validCentralPoint(), id: 'P2', name: { en: '' } }] }));
  assert(hasIssue(report.errors, 'EMPTY_NAME', 'P2'), 'Empty name must be reported');
}

// --- orphan rasta segment reference (missing point) ---
{
  const report = validateV2Dataset(
    baseInput({ rastas: [validRasta({ segments: [{ id: 'R1_SEGMENT_01', pointIds: ['R1-01', 'R1-99'] }] })] }),
  );
  assert(hasIssue(report.errors, 'ORPHAN_SEGMENT_REFERENCE', 'R1'), 'Orphan segment point reference must be reported');
}

// --- orphan rasta junction reference ---
{
  const report = validateV2Dataset(
    baseInput({ rastas: [validRasta({ junctions: [{ fromPointId: 'R1-01', toPointId: 'R1-99' }] })] }),
  );
  assert(hasIssue(report.errors, 'ORPHAN_JUNCTION_REFERENCE', 'R1'), 'Orphan junction point reference must be reported');
}

// --- unexpectedly disconnected block (all 4 entries have zero adjacency) ---
{
  const report = validateV2Dataset(baseInput({ graphAdjacency: { GATE_01: ['edge'] } }));
  assert(hasIssue(report.errors, 'UNEXPECTED_DISCONNECTED_DESTINATION', 'B1'), 'Fully disconnected block must be an error');
}

// --- unexpectedly disconnected gate (verified_by_geometry but zero adjacency) ---
{
  const report = validateV2Dataset(baseInput({ graphAdjacency: { B1_C1: ['edge'] } }));
  assert(hasIssue(report.errors, 'UNEXPECTED_DISCONNECTED_DESTINATION', 'GATE_01'), 'Fully disconnected, non-field-blocked gate must be an error');
}

// --- Gate-18/19-style ground_truth_required gate: expected WARNING, not a failure ---
{
  const fieldBlockedGate = validGate({
    id: 'GATE_18',
    connectorStatus: 'ground_truth_required',
    canStartRouteFromOutside: false,
    userFacingBehavior: { normalSearch: 'unavailable', mapDisplay: 'visible', routeSelection: 'disabled', unavailableReason: 'field survey required' },
  });
  const report = validateV2Dataset(baseInput({ gates: [fieldBlockedGate], graphAdjacency: { B1_C1: ['edge'] } }));
  assert(hasIssue(report.warnings, 'FIELD_DATA_BLOCKED_GATE', 'GATE_18'), 'Ground-truth-required gate must produce an expected warning');
  assert(!hasIssue(report.errors, 'UNEXPECTED_DISCONNECTED_DESTINATION', 'GATE_18'), 'Ground-truth-required gate must NOT be reported as an unexpected break');
  assert.equal(report.valid, true, 'A dataset with only an acknowledged field-data blocker must still be valid (warning, not error)');
}

// --- contradiction: ground_truth_required gate still exposed as searchable/routable ---
{
  const contradictoryGate = validGate({
    id: 'GATE_18',
    connectorStatus: 'ground_truth_required',
    userFacingBehavior: { normalSearch: 'searchable', mapDisplay: 'visible', routeSelection: 'enabled' },
  });
  const report = validateV2Dataset(baseInput({ gates: [contradictoryGate], graphAdjacency: { B1_C1: ['edge'] } }));
  assert(hasIssue(report.errors, 'CONTRADICTORY_FIELD_BLOCKER_EXPOSURE', 'GATE_18'), 'Exposing a field-blocked gate as searchable must be an error');
}

console.log('Synthetic-fixture RED/GREEN cases passed.');

// ---------------------------------------------------------------------------
// GREEN: run the validator against the actual current production v2 dataset.
// ---------------------------------------------------------------------------
const realReport = validateV2Dataset();

const expectedFieldBlockedGateIds = new Set(
  realReport.warnings.filter((issue) => issue.code === 'FIELD_DATA_BLOCKED_GATE').map((issue) => issue.entityId),
);

console.log('\n=== V2 DATA VALIDATION REPORT ===');
console.log(
  `Entities: ${realReport.summary.gates} gates, ${realReport.summary.blocks} blocks, ${realReport.summary.rastas} rastas ` +
    `(${realReport.summary.rastaPoints} points), ${realReport.summary.specialRoutes} special routes ` +
    `(${realReport.summary.specialRoutePoints} points), ${realReport.summary.centralPoints} central points.`,
);
console.log(`Errors: ${realReport.summary.errorCount}, Warnings: ${realReport.summary.warningCount}, Info: ${realReport.summary.infoCount}`);
if (realReport.errors.length > 0) {
  console.log('\nERRORS:');
  realReport.errors.forEach((issue) => console.log(`  [${issue.code}] ${issue.entityType} ${issue.entityId}: ${issue.message}`));
}
if (realReport.warnings.length > 0) {
  console.log('\nWARNINGS:');
  realReport.warnings.forEach((issue) => console.log(`  [${issue.code}] ${issue.entityType} ${issue.entityId}: ${issue.message}`));
}
console.log(`\nAcknowledged field-data-blocked gates: ${[...expectedFieldBlockedGateIds].join(', ') || '(none)'}`);
console.log('==================================\n');

assert.equal(
  realReport.errors.length,
  0,
  `Real v2 production dataset has ${realReport.errors.length} unexpected structural error(s) — see report above.`,
);

// Only Gate 18/19 are currently known, acknowledged field-data blockers. Any other
// warning code, or a field-blocked gate outside this set, means either new real data
// changed without updating this expectation, or a genuine new gap was introduced.
const allowedFieldBlockedGateIds = new Set(['GATE_18', 'GATE_19']);
for (const gateId of expectedFieldBlockedGateIds) {
  assert(
    allowedFieldBlockedGateIds.has(gateId),
    `Unexpected new field-data-blocked gate '${gateId}' — update allowedFieldBlockedGateIds if this is a real, reviewed field blocker.`,
  );
}
const unexpectedWarningCodes = realReport.warnings.filter((issue) => issue.code !== 'FIELD_DATA_BLOCKED_GATE');
assert.equal(
  unexpectedWarningCodes.length,
  0,
  `Unexpected warning code(s) on real data:\n${unexpectedWarningCodes.map((issue) => `${issue.code}: ${issue.message}`).join('\n')}`,
);

console.log('Real v2 production dataset structural validation passed.');
