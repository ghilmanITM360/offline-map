import { useAppStore } from '../store/useAppStore';

const good = { latitude: 24.9762, longitude: 67.011, accuracy: 5 };

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.getState().setCurrentLocation(good, 'live');
});

describe('useAppStore.setCurrentLocation malformed fixes (#147)', () => {
  test.each([
    ['NaN latitude', { latitude: NaN, longitude: 67.01 }],
    ['Infinity longitude', { latitude: 24.97, longitude: Infinity }],
    ['latitude > 90', { latitude: 91, longitude: 67.01 }],
    ['longitude < -180', { latitude: 24.97, longitude: -181 }],
  ])('ignores %s and keeps the previous fix', (_name, bad) => {
    useAppStore.getState().setCurrentLocation(bad, 'live');
    const state = useAppStore.getState();
    expect(state.currentLocation).toEqual(good);
    expect(state.lastKnownLocation).toEqual(good);
  });

  test('still accepts a valid fix, including 0,0 bounds and clearing with null', () => {
    useAppStore.getState().setCurrentLocation({ latitude: 0, longitude: 0 }, 'live');
    expect(useAppStore.getState().currentLocation).toEqual({ latitude: 0, longitude: 0 });
    useAppStore.getState().setCurrentLocation(null);
    expect(useAppStore.getState().currentLocation).toBeNull();
  });
});
