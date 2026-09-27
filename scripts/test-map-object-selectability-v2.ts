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

const rastaLayer = readFileSync('src/views/components/map/RastaLayer.tsx', 'utf8');
const specialRouteLayer = readFileSync('src/views/components/map/SpecialRouteLayer.tsx', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const cameraManager = readFileSync('src/viewmodels/useCameraManager.ts', 'utf8');
const placeAdapter = readFileSync('src/services/V2PlaceAdapter.ts', 'utf8');
const locationSheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const homeViewModel = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const gateMeta = readFileSync('src/data/ijtema/gateMeta.ts', 'utf8');
const mapRenderingService = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');

// --- P0 Fix 1: Rasta polylines are tappable ---------------------------------

assert(
  rastaLayer.includes('onPressRasta?: (rastaId: string, coordinate?: Coordinate) => void'),
  'RastaLayer must accept an onPressRasta callback (now also passing the press coordinate through for tap disambiguation).',
);
assert(
  /tappable\s*\n(?:\s*accessibilityLabel=\{[^}]*\}\s*\n)?\s*onPress=\{\(e\) => onPressRasta\(rasta\.sourceId \?\? rasta\.id, e\.nativeEvent\.coordinate\)\}/.test(rastaLayer),
  'RastaLayer must render a tappable Polyline wired to the logical Rasta family — every branched segment is a touch target without exposing a segment-only ID.',
);
assert(
  homeScreen.includes('onPressRasta={(rastaId, coordinate) => {') &&
    /onPressRasta=\{\(rastaId, coordinate\) => \{\s*\n\s*const place = V2PlaceAdapter\.getPlaceById\(rastaId\);/.test(homeScreen),
  'HomeScreen must wire RastaLayer onPressRasta through V2PlaceAdapter.getPlaceById into the shared tap-disambiguation collector, matching the Block/Gate selection chain.',
);
assert(
  /onPressRasta=\{\(rastaId, coordinate\) => \{[\s\S]*?collectTapCandidate\(\{ id: rastaId, kind: 'rasta', coordinate, payload: place \}\);/.test(homeScreen),
  'RastaLayer selection must flow through collectTapCandidate (TapDisambiguationService), not call handlePlaceSelect directly — a tap can fire onPress on more than one overlapping shape.',
);

// --- P0 Fix 2: SpecialRoute (Pindal) polylines are tappable -----------------

assert(
  specialRouteLayer.includes('onPressRoute?: (routeId: string, coordinate?: Coordinate) => void'),
  'SpecialRouteLayer must accept an onPressRoute callback (now also passing the press coordinate through for tap disambiguation).',
);
assert(
  /tappable\s*\n(?:\s*accessibilityLabel=\{[^}]*\}\s*\n)?\s*onPress=\{\(e\) => onPressRoute\(route\.id, e\.nativeEvent\.coordinate\)\}/.test(specialRouteLayer),
  'SpecialRouteLayer must render a tappable Polyline wired to onPressRoute.',
);
assert(
  homeScreen.includes('onPressRoute={(routeId, coordinate) => {') &&
    /onPressRoute=\{\(routeId, coordinate\) => \{\s*\n\s*const place = V2PlaceAdapter\.getPlaceById\(routeId\);/.test(homeScreen),
  'HomeScreen must wire SpecialRouteLayer onPressRoute through V2PlaceAdapter.getPlaceById into the shared tap-disambiguation collector.',
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

assert(homeViewModel.includes('lastSheetIndexRef'), 'HomeViewModel must track the last known sheet snap index.');
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
