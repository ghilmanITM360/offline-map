import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { resolveTapCandidate, TapCandidate } from '../src/services/TapDisambiguationService';

// Production stabilization pass — P0 touch-target fix. react-native-maps dispatches one
// onPress per native shape a tap actually hits, independently per layer (no shared
// dispatcher). Widening touch targets to 44dp (see test-gate-touch-target-v2.ts,
// test-facility-touch-target-v2.ts) increases the odds a single tap fires onPress on more
// than one overlapping shape (e.g. a widened gate hit-area over a rasta hit-corridor).
// TapDisambiguationService.resolveTapCandidate resolves which object wins; this script
// covers its logic plus HomeScreen's wiring into it.

// --- Logic: single candidate is trivially the winner ------------------------
{
  const candidates: TapCandidate<string>[] = [{ id: 'gate1', kind: 'gate', payload: 'gate1' }];
  const winner = resolveTapCandidate(candidates, null);
  assert.equal(winner?.id, 'gate1', 'A single candidate must win outright with no ambiguity logic applied.');
}

// --- Logic: zero candidates resolves to null (a genuine miss, not an error) -
{
  const winner = resolveTapCandidate([], null);
  assert.equal(winner, null, 'No candidates must resolve to null, not throw or fabricate a winner.');
}

// --- Logic: the currently-selected object wins outright, even if it isn't nearest
{
  const candidates: TapCandidate<string>[] = [
    { id: 'gateA', kind: 'gate', coordinate: { latitude: 24.9000, longitude: 67.1200 }, payload: 'gateA' },
    { id: 'gateB', kind: 'gate', coordinate: { latitude: 24.9500, longitude: 67.1800 }, payload: 'gateB' },
  ];
  const winner = resolveTapCandidate(candidates, 'gateB');
  assert.equal(winner?.id, 'gateB', 'The already-selected object must win priority over any distance-based tiebreak.');
}

// --- Logic: with no selection and multiple candidates, nearest-to-centroid wins ---
{
  const candidates: TapCandidate<string>[] = [
    { id: 'near', kind: 'rasta', coordinate: { latitude: 24.9001, longitude: 67.1201 }, payload: 'near' },
    { id: 'far', kind: 'gate', coordinate: { latitude: 24.9050, longitude: 67.1500 }, payload: 'far' },
    { id: 'near2', kind: 'rasta', coordinate: { latitude: 24.9002, longitude: 67.1202 }, payload: 'near2' },
  ];
  const winner = resolveTapCandidate(candidates, null);
  assert(winner?.id === 'near' || winner?.id === 'near2', `Expected one of the two tightly-clustered candidates to win, got ${winner?.id}.`);
}

// --- Logic: candidates without a coordinate (iOS Polygon/Polyline press events don't
// report one) still resolve deterministically instead of throwing ------------
{
  const candidates: TapCandidate<string>[] = [
    { id: 'a', kind: 'block', payload: 'a' },
    { id: 'b', kind: 'block', payload: 'b' },
  ];
  const winner = resolveTapCandidate(candidates, null);
  assert(winner?.id === 'a' || winner?.id === 'b', 'Coordinate-less candidates must still resolve to a deterministic winner, not throw.');
}

// --- Wiring: every v2 tappable map layer routes through the shared collector ---
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const gateLayer = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const facilityLayer = readFileSync('src/views/components/map/FacilityLayer.tsx', 'utf8');
const blockLayer = readFileSync('src/views/components/map/BlockLayer.tsx', 'utf8');

assert(homeScreen.includes('resolveTapCandidate') && homeScreen.includes('TapDisambiguationService'), 'HomeScreen must import and use TapDisambiguationService.');
assert(homeScreen.includes('const collectTapCandidate = useCallback('), 'HomeScreen must define a single shared collectTapCandidate entry point.');
assert(
  (homeScreen.match(/collectTapCandidate\(\{ id: /g) ?? []).length >= 5,
  'All five tappable v2 map object kinds (rasta, route, block, gate, facility) must route through collectTapCandidate.',
);
assert(homeScreen.includes("requestAnimationFrame(() => {"), 'collectTapCandidate must batch same-gesture candidates within one animation frame before resolving a winner.');

assert(gateLayer.includes('onPress={(e) => onPressGate?.(gate.id, e.nativeEvent.coordinate)}'), 'GateLayer must forward the native press coordinate for disambiguation.');
assert(facilityLayer.includes('onPress={(e) => onPressFacility(place, e.nativeEvent.coordinate)}'), 'FacilityLayer must forward the native press coordinate for disambiguation.');
assert(blockLayer.includes('onPress={(e) => onPressBlock?.(block.id, e.nativeEvent.coordinate)}'), 'BlockLayer must forward the native press coordinate for disambiguation.');

console.log('Tap disambiguation v2 checks passed.');
