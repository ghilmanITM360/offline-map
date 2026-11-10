/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Gates 18/19 are known but have no verified connector; pending places have no location. Neither may ever get a route, a Guide or Live.
import {
  createNavigationController, createPlaceCatalog, parsePackPlaceCatalog, type NavigationControllerOptions, type PlaceCatalog,
} from '@muslim-ummah/offline-navigation';
import { buildKarachiPlaceCatalog } from '../data/ijtema/packResources';
import { IJTEMA_VENUE_SOURCE } from '../data/ijtema/venueAdapter';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const parsed = parsePackPlaceCatalog(JSON.stringify(buildKarachiPlaceCatalog()), { venueId: 'karachi-ijtema', languages: ['en', 'ur', 'ur-Latn'] });
if (!parsed.ok) throw new Error(parsed.error.message);
const catalog: PlaceCatalog = createPlaceCatalog(parsed.catalog);
const make = (extra: Partial<NavigationControllerOptions> = {}) => createNavigationController({ venue: IJTEMA_VENUE_SOURCE, availability: catalog.availability, ...extra });

describe('unreachable gates', () => {
  for (const id of ['GATE_18', 'GATE_19']) {
    it(`${id}: selecting it explains why and never searches or draws a route`, async () => {
      const finder = jest.fn();
      const c = make({ findRoute: finder });
      c.selectDestination(id);
      c.selectOrigin('GATE_12');
      await flush();
      expect(c.getState()).toMatchObject({ phase: 'preview', destinationId: id, loadState: 'error', error: 'destination_unreachable', route: null, canStartGuide: false });
      expect(finder).not.toHaveBeenCalled();
      expect(c.startGuide()).toBe(false);
      await c.requestLive();
      expect(c.getState().phase).not.toBe('live');
      expect(c.getState().route).toBeNull();
    });
  }
  it('the same gate as an ORIGIN gets no route either (the search finds no way out of it)', async () => {
    const c = make();
    c.selectDestination('B5');
    c.selectOrigin('GATE_18');
    await flush();
    expect(c.getState().route).toBeNull();
    expect(c.getState().canStartGuide).toBe(false);
  });
  it('a connected gate and a block still route exactly as before', async () => {
    const c = make();
    c.selectDestination('B5');
    c.selectOrigin('GATE_12');
    await flush();
    expect(c.getState()).toMatchObject({ loadState: 'ready', error: null, canStartGuide: true });
    expect(c.getState().route!.nodeIds.length).toBeGreaterThan(2);
  });
  it('without an availability source nothing changes: the old behaviour for a venue that supplies none', async () => {
    const c = createNavigationController({ venue: IJTEMA_VENUE_SOURCE });
    c.selectDestination('GATE_18');
    c.selectOrigin('GATE_12');
    await flush();
    expect(c.getState().error).toBe('no_route');
  });
});

describe('pending places', () => {
  const pending = createPlaceCatalog({
    venueId: 'v', byId: new Map(), places: [],
  });
  it('a catalog place with no location says so; it is not "unknown" and never routed', async () => {
    const parsedPending = parsePackPlaceCatalog(JSON.stringify({
      schemaVersion: 1, venueId: 'karachi-ijtema',
      places: [{ id: 'ILAQA_9', category: 'ilaqa', names: { en: 'Ilaqa Nine' }, location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', nodeIds: [], provenance: { source: 'test' }, flags: ['NEEDS_REVIEW'] }],
    }));
    if (!parsedPending.ok) throw new Error(parsedPending.error.message);
    const cat = createPlaceCatalog(parsedPending.catalog);
    const finder = jest.fn();
    const c = createNavigationController({ venue: IJTEMA_VENUE_SOURCE, availability: cat.availability, findRoute: finder });
    c.selectDestination('ILAQA_9');
    await flush();
    expect(c.getState()).toMatchObject({ phase: 'preview', destinationId: 'ILAQA_9', loadState: 'error', error: 'destination_not_located', route: null, canStartGuide: false });
    expect(finder).not.toHaveBeenCalled();
    c.selectDestination('not-in-anything');
    expect(c.getState().error).toBe('unknown_place');
    expect(pending.list()).toEqual([]);
  });
});
