import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Google Maps Stage 3 finalization — closes the remaining risks called out after the
// first parity pass: a sheet-size-aware (not fixed-ratio) camera offset, tighter/tuned
// Rasta+Pindal hit targets so nearby objects don't steal each other's taps, a
// highlight -> camera -> sheet transition ordering instead of everything firing at once,
// and richer (but still data-driven) LocationSheet content for Rasta/Pindal/Facility.

const cameraManager = readFileSync('src/viewmodels/useCameraManager.ts', 'utf8');
const homeViewModel = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const rastaLayer = readFileSync('src/views/components/map/RastaLayer.tsx', 'utf8');
const specialRouteLayer = readFileSync('src/views/components/map/SpecialRouteLayer.tsx', 'utf8');
const locationSheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const placeAdapter = readFileSync('src/services/V2PlaceAdapter.ts', 'utf8');
const types = readFileSync('src/models/types.ts', 'utf8');
const cameraManagerTest = readFileSync('src/__tests__/CameraManager.test.tsx', 'utf8');

// --- FIX 1: dynamic, sheet-aware camera adjustment --------------------------

assert(
  cameraManager.includes('useSafeAreaFrame') && cameraManager.includes('useSafeAreaInsets'),
  'useCameraManager must read real safe-area/window frame data to compute the place-selection offset.',
);
assert(
  cameraManager.includes('MARKER_SCREEN_FRACTION_MIN') && cameraManager.includes('MARKER_SCREEN_FRACTION_MAX'),
  'useCameraManager must clamp the marker screen position between a min/max fraction, not use one fixed offset.',
);
assert(
  /const animateToPlace = useCallback\(\s*\n\s*\(\s*\n\s*place: \{ coordinate\?: Coordinate \| null \},\s*\n\s*sheetCoverageFraction = 0\.5,/.test(cameraManager),
  'animateToPlace must accept a sheetCoverageFraction parameter driven by the caller\'s current bottom-sheet snap state.',
)
assert(
  cameraManager.includes('const sheetHeightPx = clamp(sheetCoverageFraction, 0, 1) * windowHeight;'),
  'animateToPlace must convert the given sheet coverage fraction into a pixel height using the real window frame.',
);
assert(
  cameraManager.includes('const visibleTopPx = insets.top + OVERLAY_CONTROL_GAP;'),
  'animateToPlace must keep the marker clear of the safe area/top chrome, not just the bottom sheet.',
);
const durationMatch = cameraManager.match(/export const PLACE_SELECTION_CAMERA_DURATION_MS = (\d+);/);
assert(durationMatch, 'useCameraManager must export a place-selection camera duration constant.');
const durationMs = Number(durationMatch![1]);
assert(durationMs >= 150 && durationMs <= 300, `Place-selection camera duration must be 150-300ms (Google Maps style), got ${durationMs}.`);

assert(
  cameraManagerTest.includes('bottom edge > center > top'),
  'CameraManager tests must cover place-near-bottom-edge, place-near-center, and place-near-top scenarios.',
);

// fitRoute / fitVenueBounds edge-padding behavior must remain untouched.
assert(
  cameraManager.includes('mapRef.current?.fitToCoordinates(coordinates, { edgePadding, animated: true });') &&
    cameraManager.includes('mapRef.current?.fitToCoordinates(boundary, { edgePadding, animated: true });'),
  'fitRoute/fitVenueBounds edge-padding behavior must be untouched by the dynamic camera fix.',
);

// --- FIX 2: tuned Rasta/Pindal hit widths -----------------------------------

assert(rastaLayer.includes('strokeWidth={16}') && rastaLayer.includes('tappable'), 'RastaLayer hit target must be tuned to 16 (down from an untuned 20) to reduce adjacent-line crosstalk.');
assert(specialRouteLayer.includes('strokeWidth={18}') && specialRouteLayer.includes('tappable'), 'SpecialRouteLayer hit target must be explicitly tuned/documented.');
assert(
  rastaLayer.includes('onPressRasta(rasta.sourceId ?? rasta.id,') && specialRouteLayer.includes('onPressRoute(route.id,'),
  'Both hit targets must resolve to their logical object identity (Rasta family or special-route id) plus the press coordinate for overlap disambiguation.',
);

// --- FIX 3: highlight -> camera -> sheet transition ordering ---------------

const handlePlaceSelectBody = homeViewModel.slice(
  homeViewModel.indexOf('const handlePlaceSelect = (place: Place) => {'),
  homeViewModel.indexOf('\n  };', homeViewModel.indexOf('const handlePlaceSelect = (place: Place) => {')),
);
assert(handlePlaceSelectBody.length > 0, 'handlePlaceSelect must exist in HomeViewModel.');
const highlightIdx = handlePlaceSelectBody.indexOf('setSelectedPlace(place);');
const cameraIdx = handlePlaceSelectBody.indexOf('cameraManager.animateToPlace(');
const sheetTimerIdx = handlePlaceSelectBody.indexOf('sheetPresentTimerRef.current = setTimeout(openSheet');
assert(highlightIdx !== -1 && cameraIdx !== -1 && sheetTimerIdx !== -1, 'handlePlaceSelect must set the highlight, pan the camera, and schedule the sheet, in that order.');
assert(highlightIdx < cameraIdx && cameraIdx < sheetTimerIdx, 'Selection highlight must be set before the camera pans, which must start before the sheet is scheduled to open — not all in the same tick.');
assert(
  homeViewModel.includes('setTimeout(openSheet, PLACE_SELECTION_CAMERA_DURATION_MS)'),
  'The sheet must open after the camera\'s own (short, 150-300ms) pan duration, not race it.',
);
assert(
  homeViewModel.includes("import { useCameraManager, CompassMode, PLACE_SELECTION_CAMERA_DURATION_MS } from './useCameraManager';"),
  'HomeViewModel must reuse the camera hook\'s own duration constant rather than a second hardcoded number.',
);
assert(!handlePlaceSelectBody.includes('bottomSheetRef.current?.close()'), 'handlePlaceSelect must never close the sheet — closing-then-reopening on re-selection would flicker.');

// --- FIX 4: re-selection preserves snap state (still true after the FIX 3 rework) --

assert(homeViewModel.includes('isSheetOpenForReselection') && homeViewModel.includes('lastSheetIndexRef'), 'Re-selection snap-state preservation must survive the transition-ordering rework.');
assert(
  handlePlaceSelectBody.includes('cancelPendingSheetPresentation();') &&
    homeViewModel.includes('const cancelPendingSheetPresentation = useCallback(() => {') &&
    homeViewModel.includes('clearTimeout(sheetPresentTimerRef.current);') &&
    homeViewModel.includes('sheetPresentTimerRef.current = null;'),
  'Rapid re-selection must cancel a pending sheet-open timer instead of stacking multiple delayed opens (which would flicker/race).',
);

// --- FIX 5: richer, data-driven LocationSheet content -----------------------

assert(placeAdapter.includes('findConnectedBlockNames'), 'V2PlaceAdapter must derive connected blocks from real navigation-graph adjacency, not invented data.');
assert(
  placeAdapter.includes('connectedBlockNames: findConnectedBlockNames(rasta.points.map((point) => point.id))'),
  'rastaToPlace must attach graph-derived connected block names.',
);
assert(
  placeAdapter.includes('connectedBlockNames: findConnectedBlockNames(route.points.map((point) => point.id))'),
  'specialRouteToPlace must attach graph-derived connected block names.',
);
assert(types.includes('connectedBlockNames?: string[];'), 'PlaceCommon must declare the connectedBlockNames field.');
assert(
  locationSheet.includes("place.category === 'Rasta' ? 'Connected Blocks' : 'Connected Areas'"),
  'LocationSheet must show a Rasta\'s connected blocks and a Pindal/SpecialRoute\'s connected areas using the same real data.',
);
assert(locationSheet.includes('function facilityTypeLabel(place: Place)'), 'LocationSheet must derive a facility type label for Masjid/Landmark places.');
assert(
  locationSheet.includes("if (place.id.startsWith('LM_FOOD')) return 'Food & refreshments point';"),
  'Facility type label must reuse FacilityLayer\'s existing id-prefix categorization, not invent a new one.',
);

console.log('Map Stage 3 finalization checks passed.');
