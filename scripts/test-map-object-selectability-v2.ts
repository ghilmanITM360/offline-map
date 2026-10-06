import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Google Maps Stage 3 parity fix — "anything visible on the map should be selectable".
// Rasta and SpecialRoute (Pindal) polylines previously had no onPress/tappable at all,
// so the only tap surface was their small MapLabelOverlay text pill (hidden below
// MEDIUM_ZOOM for rastas, and hidden entirely unless already-selected for special routes
// below MEDIUM_ZOOM). This script verifies the line geometry itself is now a real tap
// target, the camera compensates for the LocationSheet covering the bottom half of the
// screen on selection, gate info is richer, and re-selecting a different object preserves
// the sheet's current snap height instead of collapsing it.

const overlaySpec = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const cameraManager = readFileSync('src/viewmodels/useCameraManager.ts', 'utf8');
const placeAdapter = readFileSync('src/services/V2PlaceAdapter.ts', 'utf8');
const locationSheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const homeViewModel = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const gateMeta = readFileSync('src/data/ijtema/gateMeta.ts', 'utf8');
const mapRenderingService = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');

// --- P0 Fix 1+2: Rasta and Shahr-e-Pindal polylines are tappable ---------------
// (MapLibre: a wide, near-invisible hit line over each polyline is the touch target; the tap is resolved through
// queryRenderedFeatures in OfflineMapCanvas and forwarded per feature with its id/kind.)

assert(
  /id: 'hit-rastas', type: 'line'/.test(overlaySpec) && /id: 'hit-special', type: 'line'/.test(overlaySpec),
  'Rasta and special-route polylines must each have a widened hit layer so the visible line is the touch target.',
);
assert(
  /id: r\.sourceId \?\? r\.id, kind: 'rasta'/.test(overlaySpec),
  'Rasta features must carry the logical Rasta family id (every branched segment is a touch target without exposing a segment-only ID).',
);
assert(
  /id: r\.id, kind: 'route'/.test(overlaySpec),
  'Special-route features must carry their route id and kind.',
);
assert(
  /const handleFeaturePress = useCallback\(\(\{ id, kind, coordinate \}: MapFeaturePress\) => \{[\s\S]*?V2PlaceAdapter\.getPlaceById\(id\)[\s\S]*?collectTapCandidate\(\{ id, kind, coordinate, payload: place \}\);/.test(homeScreen),
  'HomeScreen must resolve a pressed feature through V2PlaceAdapter.getPlaceById into the shared tap-disambiguation collector, matching the Block/Gate selection chain — not call handlePlaceSelect directly (a tap can hit overlapping shapes).',
);

// --- P0 Fix 3: camera compensates for the LocationSheet on selection --------
// (superseded by the dynamic, sheet-coverage-aware version — see
// scripts/test-map-stage3-finalization-v2.ts for the current camera assertions)

assert(
  // Phase 0D-A: the camera-readiness gate hoists `place.coordinate` into a local `coordinate`
  // const (captured once, before the queued/deferred runWhenReady callback runs) — same
  // marker-shift math, just no longer re-reading `place.coordinate` from inside the closure.
  /latitude: coordinate\.latitude \+ PLACE_ZOOM_DELTA \* \(markerScreenFraction - 0\.5\)/.test(cameraManager),
  'animateToPlace must shift the region center based on the computed marker screen fraction so the marker renders above the LocationSheet, not centered behind it.',
);
assert(
  cameraManager.includes("mapRef.current?.fitToCoordinates(coordinates, { edgePadding, animated: true });") &&
    cameraManager.includes("mapRef.current?.fitToCoordinates(boundary, { edgePadding, animated: true });"),
  'fitRoute/fitVenueBounds edge-padding behavior must be untouched by the animateToPlace fix.',
);

// --- P1 Fix 4: gate info surfaces number/type/entry information ------------

assert(gateMeta.includes('MAJOR_GATE_IDS'), 'gateMeta.ts must define the shared MAJOR_GATE_IDS set.');
assert(
  mapRenderingService.includes("MAJOR_GATE_IDS,") && !mapRenderingService.includes("const MAJOR_GATE_IDS = new Set"),
  'V2MapRenderingService must import MAJOR_GATE_IDS from data/ijtema instead of defining its own copy (single source of truth).',
);
assert(placeAdapter.includes('gateNumber: gate.number'), 'V2PlaceAdapter.gateToPlace must surface the gate number from source data.');
assert(placeAdapter.includes('isMajorGate: MAJOR_GATE_IDS.has(gate.id)'), 'V2PlaceAdapter.gateToPlace must surface whether this is a major/recommended gate, data-driven from MAJOR_GATE_IDS.');
assert(
  locationSheet.includes("place.category === 'Gate'") && locationSheet.includes('Official entry / exit gate'),
  'LocationSheet must show gate role information (entry/exit + recommended-entry-point hint) beyond just name/category.',
);
assert(
  locationSheet.includes('Official entry / exit gate · Recommended entry point'),
  'LocationSheet must distinguish major/recommended gates from regular gates using real data, not hardcoded per-gate text.',
);

// --- P2 Fix 5: re-selecting another object preserves the sheet's snap state -

assert(homeViewModel.includes('lastSheetIndexRef'), 'HomeViewModel must track the earlier sheet snap index.');
assert(homeViewModel.includes('handleSheetIndexChange'), 'HomeViewModel must expose a handler to record sheet snap index changes.');
assert(
  homeViewModel.includes('isSheetOpenForReselection') && homeViewModel.includes('const nextSnapIndex = isSheetOpenForReselection ? lastSheetIndexRef.current : 1;'),
  'handlePlaceSelect must preserve the current snap index when switching selection while the sheet is already open, defaulting to 1 only on a fresh open.',
);
assert(
  homeScreen.includes('handleSheetIndexChange(index);'),
  "HomeScreen's BottomSheetModal onChange must forward the live snap index into HomeViewModel's tracking ref.",
);

console.log('Map object selectability v2 checks passed.');
