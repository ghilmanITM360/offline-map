import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const renderServiceSource = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');
const overlaySpecSource = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');

assert(
  renderServiceSource.includes('zoomLevel'),
  'V2 map rendering service must support zoom-aware label visibility.',
);
assert(
  homeViewModelSource.includes('mapZoomLevel'),
  'Home viewmodel must track map zoom for label visibility.',
);
assert(
  homeScreenSource.includes('onRegionChangeComplete'),
  'Home map must forward region changes into zoom-aware label visibility.',
);
assert(
  !overlaySpecSource.includes('text-field') && !overlaySpecSource.includes("gate.label.replace('Gate ', 'G')"),
  'Map layers must not render label text themselves (labels are the shared MapLabelOverlay) — see HomeScreen.tsx mapLabelItems.',
);
assert(
  homeScreenSource.includes("kind: 'gate' as const") && homeScreenSource.includes("text: gate.label.replace('Gate ', 'G')"),
  'Gate labels must be built into HomeScreen mapLabelItems for the shared overlay.',
);

const lowZoomLayers = V2MapRenderingService.getHomeLayers({
  developerMode: false,
  graphOnlyFallback: true,
  zoomLevel: 11,
});
const highZoomLayers = V2MapRenderingService.getHomeLayers({
  selectedPlaceId: 'B1',
  developerMode: false,
  graphOnlyFallback: true,
  zoomLevel: 17,
});

assert(
  lowZoomLayers.visibleBlockLabels.length < highZoomLayers.visibleBlockLabels.length,
  'Low zoom must hide dense block labels.',
);
assert(
  lowZoomLayers.visibleGateMarkers.length <= highZoomLayers.visibleGateMarkers.length,
  'Low zoom must not render more gate labels than high zoom.',
);
assert(
  lowZoomLayers.visibleSpecialRouteLabels.length <= highZoomLayers.visibleSpecialRouteLabels.length,
  'Low zoom must reduce special-route label density when needed.',
);
assert(
  highZoomLayers.visibleBlockLabels.some((block) => block.id === 'B1' && block.isSelected),
  'Selected block must stay visible at high zoom.',
);
assert(
  highZoomLayers.visibleGateMarkers.every((gate) => !gate.label.includes('Gate Gate') && !gate.label.includes('Gatete')),
  'Gate labels must stay normalized and non-duplicated.',
);

console.log('Map labels v2 checks passed.');
