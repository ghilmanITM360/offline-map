import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { resolveTapCandidate, TapCandidate } from '../src/services/TapDisambiguationService';

// Production stabilization pass — P0 touch-target fix. The map used to be react-native-maps (removed, #140),
// which dispatched one onPress per native shape a tap actually hit, independently per layer (no shared
// dispatcher); the resolver is still the one place that picks a winner when MapLibre features overlap. Widening touch targets to 44dp (see test-gate-touch-target-v2.ts,
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

// --- Wiring: every tappable map object kind routes through the shared collector ---
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const canvas = readFileSync('src/views/components/mapgl/OfflineMapCanvas.tsx', 'utf8');
const overlaySpec = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');

assert(homeScreen.includes('resolveTapCandidate') && homeScreen.includes('TapDisambiguationService'), 'HomeScreen must import and use TapDisambiguationService.');
assert(homeScreen.includes('const collectTapCandidate = useCallback('), 'HomeScreen must define a single shared collectTapCandidate entry point.');
assert(
  (homeScreen.match(/collectTapCandidate\(\{ id, kind, coordinate, payload: place \}\)/g) ?? []).length === 1,
  'All tappable map object kinds must route through the one collectTapCandidate call in handleFeaturePress.',
);
assert(
  /export type FeatureKind = 'block' \| 'gate' \| 'rasta' \| 'route' \| 'facility'/.test(overlaySpec),
  'The five tappable v2 map object kinds (rasta, route, block, gate, facility) must all be feature kinds.',
);
assert(homeScreen.includes("requestAnimationFrame(() => {"), 'collectTapCandidate must batch same-gesture candidates within one animation frame before resolving a winner.');
assert(
  canvas.includes('onFeaturePress?.({ id: String(f.properties!.id), kind: f.properties!.kind as FeatureKind, coordinate })') && canvas.includes('queryRenderedFeatures'),
  'The canvas must report one press per distinct feature under the tap, with the tap coordinate, for disambiguation.',
);

console.log('Tap disambiguation v2 checks passed.');
