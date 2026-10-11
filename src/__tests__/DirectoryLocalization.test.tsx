import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { useLocaleStore } from '../i18n/localeStore';
import { useAppStore } from '../store/useAppStore';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import { act, fireEvent, render, screen } from './test-utils';
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => false }) }));
const initial = useAppStore.getState();
const destination = PublicDestinationsService.getByCategory('blocks').find(p => p.id === 'B28')!;
beforeEach(() => { jest.spyOn(Alert, 'alert').mockImplementation(() => {}); useAppStore.setState(initial, true); useLocaleStore.getState().setLocale('en'); });
afterEach(() => { useLocaleStore.getState().setLocale('en'); jest.restoreAllMocks(); });
test('Urdu Directory has translated heading, category and place actions', async () => {
  useLocaleStore.getState().setLocale('ur');
  await render(<LocationsDirectoryScreen />);
  expect(screen.getByRole('header', { name: 'اپنا راستہ تلاش کریں' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'بلاکس' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /بلاک .*28.*, بلاک/ })).toBeOnTheScreen();
  expect(StyleSheet.flatten(screen.getByTestId('directory-screen').props.style).direction).toBe('rtl');
});
test('language switching retains chooser ownership and private search', async () => {
  useAppStore.getState().setPendingJourney({ destination });
  useAppStore.getState().setRoutePlannerDest(destination);
  useAppStore.getState().setDirectoryPurpose('start');
  const request = useAppStore.getState().directoryRequest;
  await render(<LocationsDirectoryScreen />);
  await act(() => fireEvent.changeText(screen.getByLabelText('Search destinations'), '28'));
  await act(() => useLocaleStore.getState().setLocale('ur'));
  expect(screen.getByRole('header', { name: 'آپ کہاں سے شروع کر رہے ہیں؟' })).toBeOnTheScreen();
  expect(screen.getByLabelText('جگہیں تلاش کریں').props.value).toBe('28');
  expect(useAppStore.getState().directoryRequest).toBe(request);
  await act(() => useLocaleStore.getState().setLocale('ur-Latn'));
  expect(screen.getByRole('header', { name: 'Aap kahan se shuru kar rahe hain?' })).toBeOnTheScreen();
  expect(StyleSheet.flatten(screen.getByTestId('directory-screen').props.style).direction).toBe('ltr');
});

test('Urdu row details, Recent removal and unavailable chooser recovery are translated', async () => {
  const gate = PublicDestinationsService.getByCategory('gates').find(p => p.isRoutable !== false)!;
  useAppStore.setState({ recentSearches: [gate] });
  useLocaleStore.getState().setLocale('ur');
  const view = await render(<LocationsDirectoryScreen />);
  expect(screen.getAllByRole('button', { name: /کی تفصیل/ }).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /حالیہ جگہوں سے ہٹائیں/ })).toBeOnTheScreen();
  await view.unmount();
  useAppStore.getState().setRoutePlannerDest(destination);
  useAppStore.getState().setDirectoryPurpose('start');
  await render(<LocationsDirectoryScreen />);
  await act(() => fireEvent.press(screen.getByRole('button', { name: /گیٹ .*18.*ابھی دستیاب نہیں/ })));
  expect(Alert.alert).toHaveBeenCalledWith('جگہ دستیاب نہیں', expect.stringContaining('دوسری جگہ منتخب کریں'));
  expect(useAppStore.getState().directoryChoice).toBeNull();
});

test('Roman Urdu displayed corridor name is searchable without changing canonical identity', async () => {
  useLocaleStore.getState().setLocale('ur-Latn');
  await render(<LocationsDirectoryScreen />);
  await act(() => fireEvent.changeText(screen.getByLabelText('Jaghein dhoondein'), 'Shumal'));
  expect(screen.getByText('Shahr-e-Pindal Shumal')).toBeOnTheScreen();
  const matches = PublicDestinationsService.search('Shumal');
  expect(matches.map(p => p.id)).toEqual(PublicDestinationsService.search('Shahr-e-Pindal North').map(p => p.id));
  expect(matches[0].name).toBe('Shahr-e-Pindal North');
});
