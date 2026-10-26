import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ENGLISH_NAVIGATION_SCREEN_COPY as copy } from '@muslim-ummah/offline-navigation/ui';
import App from './App';
import { installKarachiBasemap } from './basemapExpo';

// Every flow runs the PACKED SDK (node_modules/@muslim-ummah/offline-navigation/dist) through the host's own venue,
// basemap installer and simulated GPS. It proves the artifact installs, bundles and renders; it is not a device test:
// the native MapLibre view and the file system are replaced by recorders, so no tile is read here.
jest.mock('./basemapExpo', () => ({ installKarachiBasemap: jest.fn() }));
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
const install = installKarachiBasemap as jest.Mock;
const ARCHIVE = 'file:///documents/map/basemap-d5e6883d55d5.pmtiles';
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
  install.mockReset().mockResolvedValue(ARCHIVE);
});
afterEach(() => jest.useRealTimers());

it('resolves the SDK from the installed tarball, never from repository source', () => {
  for (const entry of ['', '/ui', '/maplibre']) {
    expect(resolveModule(`@muslim-ummah/offline-navigation${entry}`)).toMatch(new RegExp(`node_modules/@muslim-ummah/offline-navigation/dist/${entry ? `${entry.slice(1)}/` : ''}index\\.js$`));
  }
});

it('opens on the offline directory and gives the packed map the verified local archive, nothing remote', async () => {
  await render(<App />);
  expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  for (const name of ['Entrance', 'Courtyard', 'Hall', 'Annex']) expect(screen.getByRole('button', { name: `${name}. Synthetic demo venue` })).toBeOnTheScreen();
  const style = screen.getByTestId('map').props.mapStyle;
  expect(style.sources['sdk-basemap']).toMatchObject({ url: `pmtiles://${ARCHIVE}` });
  expect(JSON.stringify(style)).not.toMatch(/https?:\/\/(?!www\.openstreetmap)/);
  expect(style.glyphs).toBeUndefined();
});

it('plans a route and walks the Manual Guide to the last step, with the map drawing and recentering it', async () => {
  await render(<App />);
  await press('Annex. Synthetic demo venue');
  await press(copy.trip.chooseStart);
  await press('Entrance. Synthetic demo venue');
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
  await press('Annex. Synthetic demo venue');
  await press(copy.trip.chooseStart);
  await press('Entrance. Synthetic demo venue');
  expect(screen.queryByRole('button', { name: 'Demo GPS: walk to the next point' })).toBeNull(); // nothing is live yet
  await press(liveOption);
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

it('shows a plain canvas and says directions still work when the basemap cannot be installed, then heals on retry', async () => {
  install.mockRejectedValueOnce(new Error('Basemap checksum mismatch'));
  await render(<App />);
  expect(screen.getByTestId('map').props.mapStyle.sources).toEqual({});
  expect(await screen.findByText(copy.mapUnavailable)).toBeOnTheScreen();
  await press('Annex. Synthetic demo venue');
  expect(screen.getByRole('button', { name: copy.trip.chooseStart })).toBeOnTheScreen(); // routing does not need the map
  await press('Retry offline map');
  await waitFor(() => expect(screen.getByTestId('map').props.mapStyle.sources['sdk-basemap']).toMatchObject({ url: `pmtiles://${ARCHIVE}` }));
  expect(screen.queryByRole('button', { name: 'Retry offline map' })).toBeNull();
  expect(screen.getByRole('button', { name: copy.trip.chooseStart })).toBeOnTheScreen(); // the trip survived the retry
});
