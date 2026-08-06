import { resolveMapMarkerOwnership } from '../views/components/map/MapMarkerOwnership';

describe('resolveMapMarkerOwnership', () => {
  test.each([
    'EXPLORE',
    'SEARCH',
    'PLACE_SELECTED',
    'DETAILS',
    'ROUTE_PREVIEW',
  ] as const)('%s keeps browse ownership and hides navigation identities', (mode) => {
    expect(resolveMapMarkerOwnership(mode, true)).toEqual({
      showBrowseUser: true,
      showBrowseSelection: true,
      showNavigationStart: false,
      showNavigationDestination: false,
      showNavigationUser: false,
    });
  });

  test('active navigation owns start, destination, and snapped user markers', () => {
    expect(resolveMapMarkerOwnership('NAVIGATION', true)).toEqual({
      showBrowseUser: false,
      showBrowseSelection: false,
      showNavigationStart: true,
      showNavigationDestination: true,
      showNavigationUser: true,
    });
  });

  test('arrival owns one destination and snapped user marker without START or browse selection', () => {
    expect(resolveMapMarkerOwnership('ARRIVAL', true)).toEqual({
      showBrowseUser: false,
      showBrowseSelection: false,
      showNavigationStart: false,
      showNavigationDestination: true,
      showNavigationUser: true,
    });
  });

  test('arrival uses exactly one browse-location fallback when snapped location is unavailable', () => {
    expect(resolveMapMarkerOwnership('ARRIVAL', false)).toEqual({
      showBrowseUser: true,
      showBrowseSelection: false,
      showNavigationStart: false,
      showNavigationDestination: true,
      showNavigationUser: false,
    });
  });

});
