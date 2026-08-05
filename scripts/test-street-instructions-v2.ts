import { strict as assert } from 'node:assert';
import { generateStreetInstructions } from '../src/services/StreetInstructionService';

const c = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });
const gateLabel = { en: 'Gate 05', ur: 'گیٹ 05' };

// ─── Degenerate inputs ──────────────────────────────────────────────────
{
  assert.deepEqual(generateStreetInstructions([], [], [], gateLabel), []);
  assert.deepEqual(generateStreetInstructions([c(0, 0)], [], [], gateLabel), []);
  // Mismatched hop-distance length must also return empty rather than crash.
  assert.deepEqual(generateStreetInstructions([c(0, 0), c(0, 1)], [1, 2], [undefined, undefined], gateLabel), []);
}

// ─── Beeline (2 points, 1 hop): single combined "walk + arrive" instruction ──
{
  const instructions = generateStreetInstructions([c(24.97, 67.0), c(24.975, 67.005)], [650], [undefined], gateLabel);
  assert.equal(instructions.length, 1);
  assert.equal(instructions[0].maneuver, 'straight'); // first hop always starts straight (no prior bearing)
  assert.equal(instructions[0].distanceM, 650);
  assert.match(instructions[0].text, /Walk 650m toward Gate 05/);
  assert.match(instructions[0].text, /Arrive at Gate 05/);
  // urduText must use the authoritative Urdu gate name, never the Latin English label.
  assert.match(instructions[0].urduText!, /گیٹ 05/);
  assert.ok(!instructions[0].urduText!.includes('Gate 05'), 'urduText must not embed the Latin gate label');
}

// ─── Real right-angle right turn (A->B north, B->C east) ──────────────────
{
  const a = c(24.9700, 67.0000);
  const b = c(24.9710, 67.0000); // due north of A
  const cc = c(24.9710, 67.0010); // due east of B
  const instructions = generateStreetInstructions([a, b, cc], [100, 90], [undefined, undefined], gateLabel);
  assert.equal(instructions.length, 2);
  assert.equal(instructions[0].maneuver, 'straight', 'first hop has no prior bearing to compare against');
  assert.equal(instructions[1].maneuver, 'right', `expected a right turn for a ~90° bearing change, got ${instructions[1].maneuver}`);
  assert.equal(instructions[1].type, 'right');
  assert.match(instructions[1].text, /Turn right/);
  assert.match(instructions[1].text, /Arrive at Gate 05/, 'last hop must include arrival text');
  assert.match(instructions[1].urduText!, /گیٹ 05/, 'last hop urduText must use the authoritative Urdu gate name');
}

// ─── Slight turn (~20-30°) classifies as slight_left/slight_right, not a hard turn ──
{
  const a = c(24.9700, 67.0000);
  const b = c(24.9710, 67.0000); // due north
  // ~20° east of north from B
  const cc = c(24.9720, 67.00035);
  const instructions = generateStreetInstructions([a, b, cc], [100, 100], [undefined, undefined], gateLabel);
  assert.ok(
    instructions[1].maneuver === 'slight_right' || instructions[1].maneuver === 'straight',
    `expected a slight turn or straight for a small bearing change, got ${instructions[1].maneuver}`,
  );
}

// ─── Street name is appended when present, never required ─────────────────
{
  const a = c(24.9700, 67.0000);
  const b = c(24.9710, 67.0000);
  const withName = generateStreetInstructions([a, b], [50], ['Rashid Minhas Road'], gateLabel);
  assert.match(withName[0].text, /on Rashid Minhas Road/);

  const withoutName = generateStreetInstructions([a, b], [50], [undefined], gateLabel);
  assert.ok(!withoutName[0].text.includes('on undefined'), 'must never render a literal "undefined" street name');
  assert.match(withoutName[0].text, /Walk 50m toward Gate 05/);
}

// ─── routeIndex is sequential and coordinate matches the hop's endpoint ────
{
  const a = c(24.9700, 67.0000);
  const b = c(24.9710, 67.0000);
  const cc = c(24.9720, 67.0010);
  const instructions = generateStreetInstructions([a, b, cc], [100, 100], [undefined, undefined], gateLabel);
  assert.equal(instructions[0].routeIndex, 0);
  assert.equal(instructions[1].routeIndex, 1);
  assert.deepEqual(instructions[0].coordinate, b);
  assert.deepEqual(instructions[1].coordinate, cc);
}

console.log('test-street-instructions-v2.ts: all assertions passed');
