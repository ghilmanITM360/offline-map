import { deriveMapMode } from '../viewmodels/useMapMode';
import type { MapMode } from '../viewmodels/useMapMode';
import { resolveMapChromePolicy } from '../viewmodels/MapChromePolicy';

describe('map chrome ownership', () => {
  // Independent product matrix: stale lower-priority state must never add chrome.
  test.each<[MapMode, string[]]>([
    ['EXPLORE', ['chips', 'browseControls', 'browseStatus']],
    ['PLACE_SELECTED', ['placeSheet', 'recenter']],
    ['DETAILS', ['placeSheet']],
    ['ROUTE_PREVIEW', ['routeSheet', 'recenter']],
    ['NAVIGATION', ['navigation', 'compass']],
    ['ARRIVAL', ['arrival']],
  ])('%s exposes only its owning surfaces', (mode, visible) => {
    expect(Object.entries(resolveMapChromePolicy(mode))
      .filter(([, enabled]) => enabled)
      .map(([surface]) => surface).sort()).toEqual(visible.sort());
  });

  test('arrival suppresses navigation and discovery even when all lower states remain set', () => {
    const mode = deriveMapMode({
      arrived: true, showNavOverlay: true,
      detailsExpanded: true, directionsDestination: {}, activePreviewRoute: {}, selectedPlace: {},
    });
    expect(resolveMapChromePolicy(mode)).toMatchObject({
      arrival: true, navigation: false, chips: false,
      browseControls: false, recenter: false, compass: false,
      placeSheet: false, routeSheet: false, browseStatus: false,
    });
  });
});
