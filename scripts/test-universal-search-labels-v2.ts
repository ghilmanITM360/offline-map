import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { MapLocalizationService } from '../src/services/MapLocalizationService';
import { SearchService } from '../src/services/SearchService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

// Phase 10 (task #37): search coverage across blocks/gates/rastas/pindals (special routes)
// already worked — V2PlaceAdapter.getAllPlaces() has always unioned all four. The real gap
// was display: search result rows only ever showed the flattened English `name`, never the
// Urdu name that's been sitting on every Place as `urduName` since v2 existed — the on-map
// labels got EN/UR treatment in task #31, but the search dropdown never did.

const results = SearchService.search('Block 1');
assert(results.length > 0, 'Search must return results for a basic block query');

// Coverage: a broad, single-letter-ish query should surface more than one category.
const allCategories = new Set(SearchService.searchByCategory('all').map((p) => p.category));
assert(allCategories.has('Block'), 'Universal search must cover blocks');
assert(allCategories.has('Gate'), 'Universal search must cover gates');
assert(allCategories.has('Rasta'), 'Universal search must cover rastas');
assert(allCategories.has('SpecialRoute'), 'Universal search must cover Shahr-e-Pindal (special) routes');

// Every place carries a real bilingual pair usable by MapLocalizationService — this is what
// the search result row's secondary line reads from.
const allPlaces = SearchService.searchByCategory('all');
const bilingualPlaces = allPlaces.filter((p) => p.urduName && p.urduName !== p.name);
assert(bilingualPlaces.length > 0, 'At least some searchable places must carry a real, distinct Urdu name');
for (const place of bilingualPlaces.slice(0, 5)) {
  const secondary = MapLocalizationService.getSecondaryLabel({ en: place.name, ur: place.urduName });
  assert(secondary === place.urduName, `getSecondaryLabel must surface ${place.id}'s real Urdu name`);
}

// Search/browse now lives in LocationsDirectoryScreen (Home's own search UI was removed) —
// its DestinationRow renders the bilingual secondary line directly off Place.urduName.
const destinationRow = readFileSync('src/views/components/directory/DestinationRow.tsx', 'utf8');
assert(destinationRow.includes('place.urduName'), 'Directory destination rows must render a bilingual secondary label');

console.log('Universal search labels v2 checks passed.');
