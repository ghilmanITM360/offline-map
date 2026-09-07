import { selectMapWarning } from '../viewmodels/MapWarningPolicy';

describe('selectMapWarning', () => {
  const allWarnings = {
    gpsSignalState: 'GPS_LOST' as const,
    isWeakGps: true,
    reroutePending: true,
    rerouteStatusMessage: 'Could not find a better route.',
    basemapDegraded: true,
    basemapMessage: 'Base map unavailable.',
    routeContextMessage: 'Route starts from Gate 12.',
    offline: true,
  };

  test.each([
    ['navigation safety outranks every lower priority', allWarnings, { kind: 'navigation_safety', message: 'Searching for GPS signal. Your position may be out of date.' }],
    ['active rerouting outranks basemap, route context, and offline', { ...allWarnings, gpsSignalState: 'GPS_GOOD', isWeakGps: false }, { kind: 'rerouting', message: 'Recalculating your route…' }],
    ['rerouting failure outranks basemap, route context, and offline', { ...allWarnings, gpsSignalState: 'GPS_GOOD', isWeakGps: false, reroutePending: false }, { kind: 'rerouting', message: 'Could not find a better route.' }],
    ['basemap degradation outranks route context and offline', { ...allWarnings, gpsSignalState: 'GPS_GOOD', isWeakGps: false, reroutePending: false, rerouteStatusMessage: null }, { kind: 'basemap_degradation', message: 'Base map unavailable.' }],
    ['route context outranks passive offline', { ...allWarnings, gpsSignalState: 'GPS_GOOD', isWeakGps: false, reroutePending: false, rerouteStatusMessage: null, basemapDegraded: false }, { kind: 'route_context', message: 'Route starts from Gate 12.' }],
    ['passive offline is lowest product priority', { offline: true }, { kind: 'offline', message: 'Offline' }],
    ['no active input returns no warning', {}, null],
  ] as const)('%s', (_name, input, expected) => {
    expect(selectMapWarning(input)).toEqual(expected);
  });

  test('weak GPS remains navigation safety and outranks active rerouting', () => {
    expect(selectMapWarning({ isWeakGps: true, reroutePending: true, basemapDegraded: true, basemapMessage: 'Base map unavailable.' })).toEqual({
      kind: 'navigation_safety',
      message: 'Weak GPS signal detected. Route updates may be slower.',
    });
  });
});
