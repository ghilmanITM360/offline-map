import React from 'react';
import { Text } from 'react-native';
import { act, render, renderHook, screen, waitFor } from './test-utils';
import { useLocaleStore } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { V2DirectionsService } from '../services/V2DirectionsService';
const initial = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B28');
beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  useAppStore.setState(initial, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: false,
    locationPermissionState: 'denied', locationPermissionPrecision: 'none' });
});
afterEach(() => { useLocaleStore.setState({ locale: 'en' }); jest.restoreAllMocks(); });
test('locale updates origin context and existing error without recalculating geometry', async () => {
  const calculate = jest.spyOn(V2DirectionsService, 'calculatePreview');
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(() => hook.result.current.chooseRememberedLocation());
  expect(hook.result.current.errorMessage).toContain("We don't have a saved location.");
  const calls = calculate.mock.calls.length;
  await act(() => useLocaleStore.setState({ locale: 'ur' }));
  expect(hook.result.current.startSourceLabel).toBe('شروع کی جگہ چنیں');
  expect(hook.result.current.errorMessage).toContain('محفوظ لوکیشن نہیں');
  expect(calculate).toHaveBeenCalledTimes(calls);
  await act(() => useLocaleStore.setState({ locale: 'ur-Latn' }));
  expect(hook.result.current.startSourceLabel).toBe('Shuru ki jagah chunein');
  expect(hook.result.current.errorMessage).toContain('Mehfooz location nahi');
  expect(calculate).toHaveBeenCalledTimes(calls);
});

const parameterizedErrorCopy = {
  en: "Directions to Block 28 aren't ready yet.",
  'ur-Latn': 'Block 28 ki hidayaat abhi tayyar nahi hain.',
  ur: 'بلاک 28 کی ہدایات ابھی تیار نہیں ہیں۔',
} as const;
const readable = (text: string) => text.replace(/[\u2066-\u2069]/g, '');

test.each(['en', 'ur', 'ur-Latn'] as const)(
  'a parameterized route error created in %s renders every locale without repeating routing',
  async initialLocale => {
    const unsupportedPlace = {...destination!, category: 'CustomPoint' as const};
    useLocaleStore.setState({locale: initialLocale});
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
    useAppStore.setState({
      currentLocation: {...destination!.coordinate, accuracy: 5, observedAtMs: Date.now()},
      currentLocationSource: 'live', hasLocationPermission: true,
      locationPermissionState: 'granted', locationPermissionPrecision: 'fine',
      locationServicesState: 'enabled',
    });
    function ErrorProbe() {
      const vm = useDirectionsViewModel(destination);
      return <Text testID="route-error">{vm.errorMessage}</Text>;
    }
    const unavailable = V2DirectionsService.calculatePreview({startPlace: null, destination: unsupportedPlace, currentLocation: destination!.coordinate});
    const calculate = jest.spyOn(V2DirectionsService, 'calculatePreview').mockReturnValue(unavailable);
    await render(<ErrorProbe />);
    await waitFor(() => expect(readable(screen.getByTestId('route-error').props.children)).toBe(parameterizedErrorCopy[initialLocale]));
    const calls = calculate.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(calculate.mock.results[calls - 1].value.messageDescriptor).toEqual({
      key: 'navigation.placeDirectionsNotReady', params: {name: 'Block 28'},
    });
    for (const locale of ['en', 'ur', 'ur-Latn'] as const) {
      await act(() => useLocaleStore.setState({locale}));
      expect(readable(screen.getByTestId('route-error').props.children)).toBe(parameterizedErrorCopy[locale]);
      expect(calculate).toHaveBeenCalledTimes(calls);
      expect(useAppStore.getState().isNavigating).toBe(false);
      expect(useAppStore.getState().routeGuide).toBeNull();
    }
  },
);
