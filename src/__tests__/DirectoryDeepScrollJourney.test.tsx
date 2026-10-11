/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from './test-utils';
import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { HomeScreen } from '../views/screens/HomeScreen';
import { useAppStore } from '../store/useAppStore';
import { useLocaleStore } from '../i18n';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: jest.fn(),
  useIsFocused: jest.fn(() => true),
}));
const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const initial = useAppStore.getState();
beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  useAppStore.setState(initial, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: false,
    locationPermissionState: 'denied', locationPermissionPrecision: 'none' });
});

test('measured deep-scroll Block 28 selection follows real Directory and Home handoff into visible destination setup', async () => {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false),
    getParent: jest.fn(), addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
  function Journey() {
    const [map, setMap] = React.useState(false);
    navigation.replace.mockImplementation(() => setMap(true));
    useNavigation.mockReturnValue(navigation);
    return map ? <HomeScreen /> : <LocationsDirectoryScreen />;
  }
  await render(<Journey />);
  const list = screen.getByTestId('directory-list');
  const row = screen.getByRole('button', { name: 'Block 28, Block' });
  await act(() => fireEvent(list, 'layout', { nativeEvent: { layout: { height: 500 } } }));
  await act(() => fireEvent(list, 'contentSizeChange', 320, 6000));
  await act(() => fireEvent(row, 'layout', { nativeEvent: { layout: { y: 2600, height: 72 } } }));
  await fireEvent(list, 'scrollBeginDrag');
  await fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 2600 } } });
  await fireEvent(list, 'scrollEndDrag');
  expect(useAppStore.getState().directoryBrowsing.anchor).toMatchObject({ id: 'place:B28' });
  await act(() => fireEvent.press(screen.getByRole('button', { name: 'Block 28, Block' })));
  await waitFor(() => expect(screen.getByTestId('directions-body')).toBeOnTheScreen());
  expect(screen.getByText('Block 28')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Choose start' })).toBeEnabled();
  expect(navigation.replace).toHaveBeenCalledWith('Main');
  expect(useAppStore.getState().pendingJourney).toBeNull();
  expect(useAppStore.getState().routePlannerDest?.id).toBe('B28');
  expect(useAppStore.getState().isNavigating).toBe(false);
  expect(useAppStore.getState().directoryBrowsing.selectedId).toBe('B28');
});
