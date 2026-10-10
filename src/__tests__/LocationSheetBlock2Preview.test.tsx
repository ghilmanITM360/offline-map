import { useLocaleStore } from '../i18n/localeStore';
import { translate } from '../i18n/translate';
import React from 'react';
import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { useAppStore } from '../store/useAppStore';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import { act, render, screen, userEvent } from './test-utils';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
  };
});
const initial = useAppStore.getState();
const destination = PublicDestinationsService.getByCategory('blocks').find(place => place.id === 'B28')!;
beforeEach(() => { useAppStore.setState(initial, true); useLocaleStore.getState().setLocale('en'); });
afterEach(() => useLocaleStore.getState().setLocale('en'));
test('preview shows truthful notice and needs confirmation before manual guide', async () => {
  const open = jest.fn();
  await render(<><LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onOpenDirectory={open} />
    <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} /></>);
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Preview from Block 2' }));
  expect(await screen.findByText('Block 2 — Preview')).toBeOnTheScreen();
  expect(screen.getByText('This route starts at Block 2 for preview purposes. Your actual location is not being tracked.')).toBeOnTheScreen();
  expect(await screen.findByText(/\d+ min/)).toBeOnTheScreen();
  expect(screen.getByText(/\d+(?:\.\d+)? (?:m|km)$/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Start route' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Start Navigation' })).not.toBeOnTheScreen();
  await user.press(await screen.findByRole('button', { name: "I'm at Block 2" }));
  await user.press(await screen.findByRole('button', { name: 'Start route' }));
  expect(useAppStore.getState().routeGuide).not.toBeNull();
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(useAppStore.getState().isNavigating).toBe(false);
});
test('change starting point forwards to owned Directory chooser', async () => {
  const open = jest.fn();
  await render(<><LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onOpenDirectory={open} />
    <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} /></>);
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Preview from Block 2' }));
  await user.press(await screen.findByRole('button', { name: 'Change starting point' }));
  expect(open).toHaveBeenCalledWith('start');
  expect(useAppStore.getState().routeGuide).toBeNull();
});

test.each(['en', 'ur-Latn', 'ur'] as const)('hypothetical controls remain owned across language change to %s', async locale => {
  await render(<><LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} />
    <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} /></>);
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Preview from Block 2' }));
  await screen.findByRole('button', { name: "I'm at Block 2" });
  const route = useAppStore.getState().activeRoute;
  await act(() => useLocaleStore.getState().setLocale(locale));
  expect(screen.getByText(translate(locale, 'block2.notice'))).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: translate(locale, 'block2.confirm') }));
  expect(useAppStore.getState().routePlannerOrigin?.id).toBe('B2');
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(route?.coordinates[0]).toEqual(useAppStore.getState().activeRoute?.coordinates[0]);
  expect(useAppStore.getState().isNavigating).toBe(false);
});
