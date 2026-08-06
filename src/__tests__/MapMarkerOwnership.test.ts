import { resolveMapMarkerOwnership } from '../views/components/map/MapMarkerOwnership';

describe('resolveMapMarkerOwnership', () => {
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

  test('explore owns browse location and selection only', () => {
    expect(resolveMapMarkerOwnership('EXPLORE', false)).toEqual({
      showBrowseUser: true,
      showBrowseSelection: true,
      showNavigationStart: false,
      showNavigationDestination: false,
      showNavigationUser: false,
    });
  });
});
