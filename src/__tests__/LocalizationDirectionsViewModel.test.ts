/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The Directions view model words its own start labels and route problems in the chosen language.

import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useLocaleStore } from '../i18n';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('B27')!;

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: true, locationPermissionPrecision: 'fine' });
});
afterEach(() => useLocaleStore.setState({ locale: 'en' }));

test.each([
  ['en', 'Choose where to start'],
  ['ur-Latn', 'Chunein kahan se shuru karna hai'],
  ['ur', 'منتخب کریں کہاں سے شروع کرنا ہے'],
] as const)('%s: with no start chosen the From label asks where to start', async (locale, label) => {
  useLocaleStore.setState({ locale });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.loadState).toBe('needs_origin'));
  expect(hook.result.current.startSourceLabel).toBe(label);
});

test('ur: a chosen start is named in its own words ("Starting from {name}.")', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(async () => hook.result.current.setManualStartPlace(start));
  await waitFor(() => expect(hook.result.current.startSourceSupportingCopy).toBe(`⁨${start.name}⁩ سے آغاز ہو رہا ہے۔`));
  expect(hook.result.current.startSourceLabel).toBe(start.name);
});

test('ur-Latn: a saved earlier location is worded with its age in Roman Urdu', async () => {
  useLocaleStore.setState({ locale: 'ur-Latn' });
  useAppStore.setState({
    lastKnownLocation: { latitude: 24.9636, longitude: 67.0063, accuracy: 8 },
    lastKnownLocationUpdatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(async () => {
    hook.result.current.chooseRememberedLocation();
  });
  await waitFor(() => expect(hook.result.current.startSourceLabel).toBe('Pehle ki location (5 minute pehle)'));
  expect(hook.result.current.startSourceSupportingCopy).toBe('Aap ki 5 minute pehle wali location istemal ho rahi hai.');
});
