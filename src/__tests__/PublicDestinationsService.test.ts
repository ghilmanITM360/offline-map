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

  it('excludes any gate the map itself marks as not normally searchable', () => {
    // Data-driven against the real source (rather than a hardcoded id list) — there are no
    // unavailable gates in the current dataset, but this still guards the exclusion logic
    // (see V2PlaceAdapter.getAllPlaces' userFacingBehavior.normalSearch filter) the moment
    // one is ever added.
    const expectedSearchableIds = new Set(
      IJTEMA_GATES.filter((gate) => gate.userFacingBehavior.normalSearch === 'searchable').map((gate) => gate.id),
    );
    const directoryGateIds = PublicDestinationsService.getByCategory('gates').map((g) => g.id);
    expect(directoryGateIds).toHaveLength(expectedSearchableIds.size);
    directoryGateIds.forEach((id) => expect(expectedSearchableIds.has(id)).toBe(true));
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
