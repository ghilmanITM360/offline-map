import { readFileSync } from 'node:fs';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { V2MapRenderingService, HIGH_ZOOM } from '../src/services/V2MapRenderingService';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';
import { Place } from '../src/models/types';

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

// --- getNavigationCorridorLayers: synthetic route + synthetic markers, fully deterministic ---
const METERS_PER_DEG_LAT = 111320;
const north = (latitude: number, meters: number) => latitude + meters / METERS_PER_DEG_LAT;
const ORIGIN = { latitude: 24.9, longitude: 67.1 };
const FAR = { latitude: north(ORIGIN.latitude, 1000), longitude: ORIGIN.longitude };

const block = (id: string, center = ORIGIN, isSelected = false) => ({
  id, label: id, name: { en: id, ur: id }, center, polygon: [center], isSelected, pulse: false,
});
const gate = (id: string, coordinate = ORIGIN, isSelected = false) => ({
  id, label: id, name: { en: id, ur: id }, coordinate, isRoutable: true, isStartRoutable: true,
  needsConnectorVerification: false, isSelected,
});
const polylineLayer = (id: string, polyline: { latitude: number; longitude: number }[], isSelected = false) => ({
  id, label: id, name: { en: id, ur: id }, polyline, labelCoordinate: polyline[0], isSelected,
});

const routeCoordinates = [ORIGIN, { latitude: north(ORIGIN.latitude, 300), longitude: ORIGIN.longitude }];

const corridor = V2MapRenderingService.getNavigationCorridorLayers(
  {
    blocks: [block('B_ON'), block('B_FAR', FAR), block('B_SEL_FAR', FAR, true)],
    gates: [gate('GATE_99_ON'), gate('GATE_99_FAR', FAR), gate('GATE_05', FAR)], // GATE_05 is a real major gate id
    rastas: [polylineLayer('R_ON', [ORIGIN]), polylineLayer('R_FAR', [FAR])],
    specialRoutes: [],
  },
  routeCoordinates,
);

assert(corridor.blocks.some((b) => b.id === 'B_ON'), 'nav corridor: keeps a block on the route path');
assert(!corridor.blocks.some((b) => b.id === 'B_FAR'), 'nav corridor: drops a block far from the route path');
assert(corridor.blocks.some((b) => b.id === 'B_SEL_FAR'), 'nav corridor: keeps the selected destination even if far from the route');
assert(corridor.gates.some((g) => g.id === 'GATE_99_ON'), 'nav corridor: keeps a gate on the route path');
assert(!corridor.gates.some((g) => g.id === 'GATE_99_FAR'), 'nav corridor: drops a non-major gate far from the route path');
assert(corridor.gates.some((g) => g.id === 'GATE_05'), 'nav corridor: always keeps major gates regardless of distance');
assert(corridor.rastas.some((r) => r.id === 'R_ON'), 'nav corridor: keeps a rasta the route runs along');
assert(!corridor.rastas.some((r) => r.id === 'R_FAR'), 'nav corridor: drops a rasta far from the route path');

const degenerate = V2MapRenderingService.getNavigationCorridorLayers(
  { blocks: [block('B_FAR', FAR)], gates: [], rastas: [], specialRoutes: [] },
  [ORIGIN],
);
assert(degenerate.blocks.length === 1, 'nav corridor: no-ops on a degenerate (<2 point) route instead of hiding everything');

// --- PLACE_SELECTED competing-marker suppression: synthetic selection point ---
// Zoom pinned at/above HIGH_ZOOM so the pre-existing pixel-collision path (which itself
// skips at HIGH_ZOOM) can't be the thing suppressing the neighbor — isolates the new option.
//
// Previously this used real GATE_13/GATE_14 data, which happened to be
// ~5m apart (documented near-duplicate coordinates in the originally supplied
// dataset). The project owner has since supplied verified, distinct
// coordinates for both (see src/data/ijtema/gates.ts) — they are no longer
// close enough to exercise this suppression mechanism, so the fixture below
// uses a synthetic selection point placed deliberately near a real gate
// (GATE_01) instead of depending on two real gates coincidentally being
// close together.
const anchorGate = IJTEMA_GATES.find((gate) => gate.id === 'GATE_01')!;
assert(!!anchorGate?.coordinate, 'GATE_01 must have a coordinate for this fixture');
const anchorPlace = V2PlaceAdapter.gateToPlace(anchorGate);

const SYNTHETIC_SELECTED_ID = 'SYNTHETIC_COMPETING_TEST_SELECTION';
// ~40m north of GATE_01 — well within PLACE_SELECTED_COMPETING_RADIUS_M (70m).
const syntheticSelectedPlace: Place = {
  ...anchorPlace,
  id: SYNTHETIC_SELECTED_ID,
  coordinate: { latitude: anchorGate.coordinate!.lat + 0.00036, longitude: anchorGate.coordinate!.lng },
};

{
  const withoutSuppression = V2MapRenderingService.getHomeLayers({
    selectedPlaceId: SYNTHETIC_SELECTED_ID,
    selectedPlace: syntheticSelectedPlace,
    zoomLevel: HIGH_ZOOM,
  });
  const withSuppression = V2MapRenderingService.getHomeLayers({
    selectedPlaceId: SYNTHETIC_SELECTED_ID,
    selectedPlace: syntheticSelectedPlace,
    zoomLevel: HIGH_ZOOM,
    suppressCompetingMarkers: true,
  });

  const gate01Without = withoutSuppression.visibleGateMarkers.find((g) => g.id === 'GATE_01');
  const gate01With = withSuppression.visibleGateMarkers.find((g) => g.id === 'GATE_01');

  assert(!!gate01Without && !gate01Without.labelSuppressed, 'competing suppression off: GATE_01 label not suppressed at high zoom');
  assert(!!gate01With && gate01With.labelSuppressed === true, 'competing suppression on: GATE_01 (near the synthetic selection) label suppressed to a dot');
}

// --- wiring: HomeScreen mode-driven declutter + nav overlay corridor filter ---
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navOverlay = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');

assert(homeScreen.includes("suppressCompetingMarkers: mode === 'PLACE_SELECTED'"), 'HomeScreen wires PLACE_SELECTED into suppressCompetingMarkers');
assert(homeScreen.includes("routePreviewDeclutterActive = mode === 'ROUTE_PREVIEW'"), 'HomeScreen derives a ROUTE_PREVIEW declutter flag');
assert(
  homeScreen.includes('previewVisibleBlocks') &&
    homeScreen.includes('previewVisibleGateMarkers') &&
    homeScreen.includes('previewVisibleRastas') &&
    homeScreen.includes('previewVisibleSpecialRoutes'),
  'HomeScreen route-preview declutter arrays feed all four map layers',
);
assert(homeScreen.includes('blocks: showBlockPolygons ? previewVisibleBlocks : []'), 'HomeScreen block layer consumes route-preview-declutter-aware blocks');
assert(homeScreen.includes('gates: previewVisibleGateMarkers'), 'HomeScreen gate layer consumes route-preview-declutter-aware gates');
assert(navOverlay.includes('getNavigationCorridorLayers'), 'Active-navigation overlay applies the route-corridor declutter filter');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
