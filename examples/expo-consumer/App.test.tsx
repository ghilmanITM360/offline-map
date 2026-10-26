import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ENGLISH_NAVIGATION_SCREEN_COPY as copy } from '@muslim-ummah/offline-navigation/ui';
import App from './App';
import { demoVenue, describeDemoPlace } from './demoVenue';
import { runDeviceSelfTest, startBundledPacks } from './packRuntimeExpo';

// Every flow runs the PACKED SDK (node_modules/@muslim-ummah/offline-navigation/dist) through the host's own pack runtime and
// simulated GPS. It proves the artifact installs, bundles and renders; it is not a device test: the native MapLibre view and the
// file system are replaced by recorders, so no tile is read here. (The pack runtime itself is tested in packRuntime.test.ts, the
// Expo file-system adapter in expoPackFileSystem.test.ts, and both run for real on devices through the pack self-test.)
jest.mock('./packRuntimeExpo', () => ({
  startBundledPacks: jest.fn(),
  runDeviceSelfTest: jest.fn(),
  packRootUri: () => 'file:///documents/ummah-packs',
}));
const mockSetStop = jest.fn((stop: unknown) => Promise.resolve(stop));
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Map: (p: any) => R.createElement(View, { testID: 'map', ...p }, p.children),
    Camera: (p: any) => {
      R.useImperativeHandle(p.ref, () => ({ setStop: mockSetStop }), []);
      return R.createElement(View, { testID: 'camera' });
    },
    GeoJSONSource: (p: any) => R.createElement(View, { testID: `source-${p.id}`, data: p.data }, p.children),
    Layer: (p: any) => R.createElement(View, { testID: `layer-${p.id}` }),
  };
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// The device source's platform module: permission is blocked, so no fix is ever read.
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied', canAskAgain: false })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied', canAskAgain: false })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
const ARCHIVE = 'file:///documents/ummah-packs/bundled/synthetic-demo-venue-1.0.0/map/ijtema-basemap.pmtiles';
const released = jest.fn();
const venueFor = (id: string) => ({
  source: id === 'synthetic-demo-venue' ? demoVenue : { ...demoVenue, venueId: id },
  manifest: { packId: `${id}@1.0.0`, venueId: id, bounds: { west: 66.976, south: 24.943, east: 67.037, north: 25 }, totalBytes: 1234 },
  origin: 'bundled' as const,
  archivePath: `bundled/${id}-1.0.0/map/ijtema-basemap.pmtiles`,
  names: new Map(demoVenue.placeIds().map((p) => [p, describeDemoPlace({ id: p }).title])),
  release: released,
});
const runtime = (open?: jest.Mock) => ({
  venueIds: () => ['synthetic-demo-venue', 'second-venue'],
  install: { bundled: [], report: [] },
  recovery: {},
  manager: {},
  open: open ?? jest.fn(async (id: string) => ({ ok: true, venue: venueFor(id) })),
});
const start = startBundledPacks as jest.Mock;
const room = (name: string) => `${name}. Room`;
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const guideOption = `${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`;
const liveOption = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;
// react-native's global `require` type has no resolve(); this is the real Node/Jest one.
const resolveModule = (id: string): string => (require as unknown as { resolve: (id: string) => string }).resolve(id);
const nextGps = () => act(async () => { jest.advanceTimersByTime(4_000); fireEvent.press(screen.getByRole('button', { name: 'Demo GPS: walk to the next point' })); });
const finishMapLoad = () => act(async () => screen.getByTestId('map').props.onDidFinishLoadingMap());
const sourceData = (id: string) => screen.getByTestId(`source-${id}`).props.data;

beforeEach(() => {
  jest.useFakeTimers();
  mockSetStop.mockClear();
  released.mockClear();
  start.mockReset().mockImplementation(async () => runtime());
});
afterEach(() => jest.useRealTimers());

it('resolves the SDK from the installed tarball, never from repository source', () => {
  for (const entry of ['', '/ui', '/maplibre']) {
    expect(resolveModule(`@muslim-ummah/offline-navigation${entry}`)).toMatch(new RegExp(`node_modules/@muslim-ummah/offline-navigation/dist/${entry ? `${entry.slice(1)}/` : ''}index\\.js$`));
  }
});

it('opens on the offline directory and gives the packed map the verified archive inside the open pack, nothing remote', async () => {
  await render(<App />);
  expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  for (const name of ['Entrance', 'Courtyard', 'Hall', 'Annex']) expect(screen.getByRole('button', { name: room(name) })).toBeOnTheScreen();
  const style = screen.getByTestId('map').props.mapStyle;
  expect(style.sources['sdk-basemap']).toMatchObject({ url: `pmtiles://${ARCHIVE}` });
  expect(JSON.stringify(style)).not.toMatch(/https?:\/\/(?!www\.openstreetmap)/);
  expect(style.glyphs).toBeUndefined();
});

it('plans a route and walks the Manual Guide to the last step, with the map drawing and recentering it', async () => {
  await render(<App />);
  await press('Annex. Room');
  await press(copy.trip.chooseStart);
  await press('Entrance. Room');
  expect(await screen.findByText(copy.trip.summary('200 m'))).toBeOnTheScreen();
  await finishMapLoad();
  expect(sourceData('sdk-route').features.length).toBeGreaterThan(0);
  expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ bounds: expect.anything() }));
  await press(guideOption);
  await press(copy.guide.nextStep);
  await press(copy.guide.nextStep);
  expect(screen.getByRole('button', { name: copy.guide.nextStep })).toBeDisabled();
  mockSetStop.mockClear();
  await press(copy.live.recenterA11y);
  expect(mockSetStop).toHaveBeenCalledTimes(1);
});

it('goes Live only on the explicit request, follows the simulated GPS to arrival and ends cleanly', async () => {
  await render(<App />);
  await press('Annex. Room');
  await press(copy.trip.chooseStart);
  await press('Entrance. Room');
  expect(screen.queryByRole('button', { name: 'Demo GPS: walk to the next point' })).toBeNull(); // nothing is live yet
  await press(liveOption);
  expect(await screen.findByText(copy.upgrade.preview)).toBeOnTheScreen(); // the live route is shown first
  expect(screen.queryByText(copy.live.exit)).toBeNull(); // and nothing is live until Start
  await press(copy.upgrade.start);
  expect(await screen.findByText(copy.live.exit)).toBeOnTheScreen();
  await finishMapLoad();
  await nextGps();
  expect(mockSetStop).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 17 })); // following the walker
  expect(sourceData('sdk-markers').features.some((f: any) => f.properties.role === 'position')).toBe(true);
  await nextGps();
  await nextGps();
  expect(await screen.findByText(copy.arrival.title)).toBeOnTheScreen();
  await press(copy.arrival.doneA11y);
  expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
});

it('does not use a venue whose pack cannot be opened, says so, and heals on retry', async () => {
  start.mockReset()
    .mockResolvedValueOnce(runtime(jest.fn(async () => ({ ok: false, error: { code: 'resource-hash-mismatch', message: 'SHA-256 mismatch' } }))))
    .mockResolvedValue(runtime());
  await render(<App />);
  expect(await screen.findByText(/cannot be used \(resource-hash-mismatch\)/)).toBeOnTheScreen();
  expect(screen.queryByTestId('map')).toBeNull(); // never a venue, or a map, from an unverified pack
  await press('Retry offline map');
  expect(await screen.findByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  expect(start).toHaveBeenCalledTimes(2);
});

it('says so when the packs cannot be started at all, and starts them again on retry', async () => {
  start.mockReset().mockRejectedValueOnce(new Error('disk is full')).mockResolvedValue(runtime());
  await render(<App />);
  expect(await screen.findByText('disk is full')).toBeOnTheScreen();
  await press('Retry offline map');
  expect(await screen.findByText(copy.directory.destinationTitle)).toBeOnTheScreen();
});

it('shows which verified pack is serving, switches to another venue, and drops the pack pin on the way out', async () => {
  await render(<App />);
  expect(screen.getByLabelText('Pack synthetic-demo-venue@1.0.0, bundled, digest pinned, 1234 bytes')).toBeOnTheScreen();
  expect(released).not.toHaveBeenCalled(); // pinned while the venue is open
  await press('Venue: synthetic-demo-venue. Switch.');
  expect(await screen.findByLabelText('Pack second-venue@1.0.0, bundled, digest pinned, 1234 bytes')).toBeOnTheScreen();
  expect(released).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('map').props.mapStyle.sources['sdk-basemap']).toMatchObject({ url: 'pmtiles://file:///documents/ummah-packs/bundled/second-venue-1.0.0/map/ijtema-basemap.pmtiles' });
});

it('runs the device self-test on request and reports every scenario', async () => {
  (runDeviceSelfTest as jest.Mock).mockResolvedValue([{ name: 'a', ok: true, detail: 'ok' }, { name: 'b', ok: false, detail: 'broken' }]);
  await render(<App />);
  await press('Run pack self-test');
  expect(await screen.findByText('Self-test: 1 of 2 passed')).toBeOnTheScreen();
  expect(screen.getByText('PASS a')).toBeOnTheScreen();
  expect(screen.getByText('FAIL b — broken')).toBeOnTheScreen();
});

it('keeps simulated and device locations apart: a blocked device permission refuses Live and the Manual Guide survives', async () => {
  const deviceLocation = jest.requireMock('expo-location');
  await render(<App />);
  await press('Location source: simulated. Switch.');
  expect(screen.queryByRole('button', { name: 'Demo GPS: walk to the next point' })).toBeNull();
  await press('Annex. Room');
  await press(copy.trip.chooseStart);
  await press('Entrance. Room');
  await press(liveOption);
  expect(await screen.findByText(copy.liveBlockers.permission_blocked)).toBeOnTheScreen();
  expect(screen.queryByText(copy.live.exit)).toBeNull(); // never live without the user's permission
  expect(deviceLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(deviceLocation.watchPositionAsync).not.toHaveBeenCalled();
  await press(guideOption);
  expect(screen.getByRole('button', { name: copy.guide.nextStep })).toBeOnTheScreen();
});
