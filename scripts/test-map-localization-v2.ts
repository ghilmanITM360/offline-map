import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { MapLocalizationService } from '../src/services/MapLocalizationService';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

// Phase 3+4 (map-experience redesign, task #31): the data layer was already bilingual
// end-to-end (LocalizedLabel) — the gap was the map-label rendering layer flattening
// everything to English only. See docs/MAP_EXPERIENCE_AUDIT.md section 3.

assert(
  MapLocalizationService.getLocalizedName({ en: 'Block 1', ur: 'بلاک 1' }, 'en') === 'Block 1',
  'getLocalizedName must return English by default',
);
assert(
  MapLocalizationService.getLocalizedName({ en: 'Block 1', ur: 'بلاک 1' }, 'ur') === 'بلاک 1',
  'getLocalizedName must return Urdu when requested and present',
);
assert(
  MapLocalizationService.getLocalizedName({ en: 'Block 1' }, 'ur') === 'Block 1',
  'getLocalizedName must fall back to English when Urdu is missing',
);
assert(
  MapLocalizationService.getSecondaryLabel({ en: 'Block 1', ur: 'بلاک 1' }) === 'بلاک 1',
  'getSecondaryLabel must return the Urdu name as the map badge secondary line',
);
assert(
  MapLocalizationService.getSecondaryLabel({ en: 'Block 1' }) === undefined,
  'getSecondaryLabel must return undefined when there is no distinct Urdu name',
);

const layers = V2MapRenderingService.getHomeLayers({ selectedPlaceId: 'B1', zoomLevel: 17 });

assert(
  layers.blocks.every((block) => typeof block.name?.en === 'string'),
  'Every V2BlockLayer must carry a bilingual LocalizedLabel name, not just the flattened English label',
);
assert(
  layers.blocks.some((block) => Boolean(block.name.ur)),
  'At least some blocks must carry a real Urdu name (data layer already has this)',
);
assert(
  layers.gates.every((gate) => typeof gate.name?.en === 'string' && Boolean(gate.name.ur)),
  'Every V2GateLayer must carry a bilingual LocalizedLabel name with a real Urdu value',
);
assert(
  layers.rastas.every((rasta) => typeof rasta.name?.en === 'string' && Boolean(rasta.name.ur)),
  'Every V2PolylineLayer (rasta) must carry a bilingual LocalizedLabel name with a real Urdu value',
);
assert(
  layers.specialRoutes.every((route) => typeof route.name?.en === 'string' && Boolean(route.name.ur)),
  'Every V2PolylineLayer (special route) must carry a bilingual LocalizedLabel name with a real Urdu value',
);

const blockLayerSource = readFileSync('src/views/components/map/BlockLayer.tsx', 'utf8');
const gateLayerSource = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const rastaLayerSource = readFileSync('src/views/components/map/RastaLayer.tsx', 'utf8');
const specialRouteLayerSource = readFileSync('src/views/components/map/SpecialRouteLayer.tsx', 'utf8');

assert(
  blockLayerSource.includes('MapLocalizationService.getSecondaryLabel'),
  'BlockLayer must render the Urdu secondary label via MapLocalizationService',
);
assert(
  gateLayerSource.includes('MapLocalizationService.getSecondaryLabel'),
  'GateLayer must render the Urdu secondary label via MapLocalizationService',
);
assert(
  rastaLayerSource.includes('MapLocalizationService.getSecondaryLabel'),
  'RastaLayer must render the Urdu secondary label via MapLocalizationService',
);
assert(
  specialRouteLayerSource.includes('MapLocalizationService.getSecondaryLabel'),
  'SpecialRouteLayer must render the Urdu secondary label via MapLocalizationService',
);

console.log('Map localization v2 checks passed.');
