// Shared fixture for the SDK navigation tests: the synthetic headless venue with five named places.
import type { VenueDataSource } from '@muslim-ummah/offline-navigation';
import { createSyntheticVenue } from '../../scripts/sdk-headless/syntheticVenue';

const base = createSyntheticVenue();
const PLACES = new Map<string, readonly string[]>([
  ['lobby', ['n/1']],
  ['annex', ['n/5', 'n/3']],
  ['hall', ['n/4']],
  ['lobby2', ['n/1']], // a different place on the same graph node
  ['isle', ['island']], // unreachable
]);

export const testVenue: VenueDataSource = {
  ...base,
  placeIds: () => [...PLACES.keys()],
  getPlace: (id) => (PLACES.has(id) ? { id, kind: 'hall', nodeIds: PLACES.get(id)! } : undefined),
};
