/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PublicDestinationsService } from '../services/PublicDestinationsService';
import { IJTEMA_GATES } from '../data/ijtema';

describe('PublicDestinationsService', () => {
  it('exposes every genuinely public v2 category and nothing else', () => {
    const categories = PublicDestinationsService.getCategories().map((c) => c.id);
    expect(categories).toEqual(expect.arrayContaining(['blocks', 'gates', 'rastas', 'special_routes']));
    expect(categories).toHaveLength(4);
  });

  it('never returns a category chip with zero destinations', () => {
    PublicDestinationsService.getCategories().forEach((category) => {
      expect(PublicDestinationsService.getByCategory(category.id).length).toBeGreaterThan(0);
    });
  });

  it('only ever returns v2 places — hidden/internal graph-only entities cannot appear', () => {
    const all = PublicDestinationsService.getAll();
    expect(all.length).toBeGreaterThan(0);
    all.forEach((place) => {
      expect(place.sourceVersion).toBe('v2');
      expect(['block', 'gate', 'rasta', 'special_route']).toContain(place.sourceKind);
      // Graph-only ids (central points "P1".."P12", perimeter connectors "NPC-01"/"NPC-02")
      // are never produced by V2PlaceAdapter and so can never leak in here.
      expect(place.id).not.toMatch(/^P\d+$/);
      expect(place.id).not.toMatch(/^NPC-/);
    });
  });

  it('#146: browse shows every gate with a real coordinate, same as search, marked unavailable rather than hidden', () => {
    // Product decision (#146): a gate blocked on ground-truth connector verification
    // (e.g. Gate 18/19) still has a real, non-fabricated coordinate — it must appear
    // consistently in both directory browse and search, disabled with a reason, not
    // vanish from browse while still surfacing in search. Only a gate genuinely missing
    // a coordinate (routingStatus === 'missing_coordinate') has nothing to show and stays
    // excluded from both — none exist in the current dataset, but this still guards that
    // exclusion the moment one is added.
    const expectedIds = new Set(
      IJTEMA_GATES.filter((gate) => gate.routingStatus !== 'missing_coordinate').map((gate) => gate.id),
    );
    const directoryGateIds = PublicDestinationsService.getByCategory('gates').map((g) => g.id);
    expect(directoryGateIds).toHaveLength(expectedIds.size);
    directoryGateIds.forEach((id) => expect(expectedIds.has(id)).toBe(true));

    const unavailableGates = IJTEMA_GATES.filter((gate) => gate.userFacingBehavior.normalSearch !== 'searchable');
    expect(unavailableGates.length).toBeGreaterThan(0); // sanity: this dataset actually has a case to test
    unavailableGates.forEach((gate) => {
      const directoryPlace = PublicDestinationsService.getByCategory('gates').find((g) => g.id === gate.id);
      const searchPlace = PublicDestinationsService.search(gate.name.en).find((p) => p.id === gate.id);
      expect(directoryPlace).toBeDefined();
      expect(searchPlace).toBeDefined();
      // Never routable, never silently presented as a normal navigable destination.
      expect(directoryPlace!.isRoutable).toBe(false);
      expect(directoryPlace!.unavailableReason).toBeTruthy();
      expect(searchPlace!.isRoutable).toBe(false);
      expect(searchPlace!.unavailableReason).toBe(directoryPlace!.unavailableReason);
    });
  });

  it('sorts blocks in natural numeric order, not lexicographic order', () => {
    const blockNames = PublicDestinationsService.getByCategory('blocks').map((b) => b.name);
    const index2 = blockNames.findIndex((n) => n === 'Block 2');
    const index10 = blockNames.findIndex((n) => n === 'Block 10');
    expect(index2).toBeGreaterThanOrEqual(0);
    expect(index10).toBeGreaterThanOrEqual(0);
    expect(index2).toBeLessThan(index10);
  });

  it('search finds a block by plain number, exactly like the main map search', () => {
    const results = PublicDestinationsService.search('24');
    expect(results.some((p) => p.name === 'Block 24')).toBe(true);
  });

  it('search finds a gate by "Gate <n>"', () => {
    const results = PublicDestinationsService.search('Gate 15');
    expect(results.some((p) => p.id === 'GATE_15')).toBe(true);
  });

  it('search never returns a legacy v1 place, even in principle', () => {
    const results = PublicDestinationsService.search('masjid');
    results.forEach((place) => expect(place.sourceVersion).toBe('v2'));
  });

  it('categoryIdForPlace maps every v2 sourceKind to its directory category', () => {
    const block = PublicDestinationsService.getByCategory('blocks')[0];
    const gate = PublicDestinationsService.getByCategory('gates')[0];
    const rasta = PublicDestinationsService.getByCategory('rastas')[0];
    const specialRoute = PublicDestinationsService.getByCategory('special_routes')[0];
    expect(PublicDestinationsService.categoryIdForPlace(block)).toBe('blocks');
    expect(PublicDestinationsService.categoryIdForPlace(gate)).toBe('gates');
    expect(PublicDestinationsService.categoryIdForPlace(rasta)).toBe('rastas');
    expect(PublicDestinationsService.categoryIdForPlace(specialRoute)).toBe('special_routes');
  });
});
