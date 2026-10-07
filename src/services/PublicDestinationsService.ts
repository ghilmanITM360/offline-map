/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { V2Place } from '../models/types';
import { t } from '../i18n';
import { SearchService } from './SearchService';
import { V2PlaceAdapter } from './V2PlaceAdapter';

export type DestinationCategoryId = 'blocks' | 'gates' | 'rastas' | 'special_routes';

export interface DestinationCategoryChip {
  id: DestinationCategoryId;
  label: string;
}

const DESTINATION_CATEGORIES: Array<{ id: DestinationCategoryId; label: () => string }> = [
  { id: 'blocks', label: () => t('directory.chipBlocks') },
  { id: 'gates', label: () => t('directory.chipGates') },
  { id: 'rastas', label: () => t('directory.chipRastas') },
  { id: 'special_routes', label: () => t('directory.chipShahrePindal') },
];

const SOURCE_KIND_TO_CATEGORY: Record<V2Place['sourceKind'], DestinationCategoryId> = {
  block: 'blocks',
  gate: 'gates',
  rasta: 'rastas',
  special_route: 'special_routes',
};

function naturalSort(places: V2Place[]): V2Place[] {
  return [...places].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * The single "what's a real, public, tappable destination" surface for the Locations
 * Directory — a thin, sorted wrapper over V2PlaceAdapter (the same source SearchService
 * already indexes from for the main map search). Deliberately never touches
 * src/data/ijtema's graph-only exports (central points, perimeter connectors) or legacy
 * v1 facility data — V2PlaceAdapter never converts those to a Place, so they can't leak
 * in here either.
 */
export class PublicDestinationsService {
  static categoryIdForPlace(place: V2Place): DestinationCategoryId {
    return SOURCE_KIND_TO_CATEGORY[place.sourceKind];
  }

  /** Only categories that actually have at least one destination — never renders an empty chip. */
  static getCategories(): DestinationCategoryChip[] {
    return DESTINATION_CATEGORIES.filter((category) => this.getByCategory(category.id).length > 0).map(
      ({ id, label }) => ({ id, label: label() }),
    );
  }

  // #146: matches SearchService.searchV2's own includeUnavailableGates:true — a gate that
  // has a real coordinate but still needs ground-truth connector verification (e.g.
  // Gate 18/19) must show up the same way in browse as it already does in search, muted
  // and marked isRoutable:false via DestinationRow/LocationSheet's existing #96 treatment,
  // not silently vanish from one surface only.
  static getAll(): V2Place[] {
    return naturalSort(V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true }));
  }

  static getByCategory(category: DestinationCategoryId): V2Place[] {
    return naturalSort(V2PlaceAdapter.getPlacesByCategory(category, { includeUnavailableGates: true }));
  }

  /**
   * Delegates to the app's one ranking/fuzzy/numeric-alias search engine, then keeps only
   * v2 public destinations — this stays v2-isolated even if MapFeatureFlagsService's v2 map
   * flag were ever off (in which case SearchService falls back to legacy v1 data entirely
   * and this correctly returns nothing, rather than silently mixing v1 facilities in).
   */
  static search(query: string, userLocation?: { latitude: number; longitude: number }): V2Place[] {
    return SearchService.search(query, userLocation).filter(
      (place): place is V2Place => place.sourceVersion === 'v2',
    );
  }
}
