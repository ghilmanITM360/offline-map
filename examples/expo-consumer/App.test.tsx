import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ENGLISH_NAVIGATION_SCREEN_COPY as copy } from '@muslim-ummah/offline-navigation/ui';
import App from './App';

// Every flow runs the PACKED SDK (node_modules/@muslim-ummah/offline-navigation/dist) through the host's own map,
// venue and simulated GPS. It proves the artifact installs, bundles and renders; it is not a device test.

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const guideOption = `${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`;
const liveOption = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;
// react-native's global `require` type has no resolve(); this is the real Node/Jest one.
const resolveModule = (id: string): string => (require as unknown as { resolve: (id: string) => string }).resolve(id);
const nextGps = () => act(async () => { jest.advanceTimersByTime(4_000); fireEvent.press(screen.getByRole('button', { name: 'Demo GPS: walk to the next point' })); });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('resolves the SDK from the installed tarball, never from repository source', () => {
  expect(resolveModule('@muslim-ummah/offline-navigation/ui')).toMatch(/node_modules\/@muslim-ummah\/offline-navigation\/dist\/ui\/index\.js$/);
  expect(resolveModule('@muslim-ummah/offline-navigation')).toMatch(/node_modules\/@muslim-ummah\/offline-navigation\/dist\/index\.js$/);
});

it('opens on the offline directory with the host\'s place names', async () => {
  await render(<App />);
  expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  for (const name of ['Entrance', 'Courtyard', 'Hall', 'Annex']) expect(screen.getByRole('button', { name: `${name}. Synthetic demo venue` })).toBeOnTheScreen();
});

it('plans a route and walks the Manual Guide to the last step, with the map drawing it', async () => {
  await render(<App />);
  await press('Annex. Synthetic demo venue');
  await press(copy.trip.chooseStart);
  await press('Entrance. Synthetic demo venue');
  expect(await screen.findByText(copy.trip.summary('200 m'))).toBeOnTheScreen();
  expect(screen.getByTestId('sketch-map', { includeHiddenElements: true })).toBeOnTheScreen();
  await press(guideOption);
  await press(copy.guide.nextStep);
  await press(copy.guide.nextStep);
  expect(screen.getByRole('button', { name: copy.guide.nextStep })).toBeDisabled();
  await press(copy.live.recenterA11y);
  expect(screen.getByTestId('sketch-map', { includeHiddenElements: true }).props.accessibilityValue.text).toBe('recentered 1 time');
});

it('goes Live only on the explicit request, follows the simulated GPS to arrival and ends cleanly', async () => {
  await render(<App />);
  await press('Annex. Synthetic demo venue');
  await press(copy.trip.chooseStart);
  await press('Entrance. Synthetic demo venue');
  expect(screen.queryByRole('button', { name: 'Demo GPS: walk to the next point' })).toBeNull(); // nothing is live yet
  await press(liveOption);
  expect(await screen.findByText(copy.live.exit)).toBeOnTheScreen();
  await nextGps();
  await nextGps();
  await nextGps();
  expect(await screen.findByText(copy.arrival.title)).toBeOnTheScreen();
  await press(copy.arrival.doneA11y);
  expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
});
