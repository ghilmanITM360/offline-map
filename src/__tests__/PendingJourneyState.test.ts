import type { Place } from '../models/types';
import { useAppStore } from '../store/useAppStore';

const initialStoreState = useAppStore.getState();
const place = (id: string) => ({ id, name: id, category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67 }, sourceVersion: 'v2' }) as Place;

beforeEach(() => useAppStore.setState(initialStoreState, true));

describe('pendingJourney (#307): the Directory hands Home a journey to start', () => {
  test('is empty by default and can be set and cleared', () => {
    expect(useAppStore.getState().pendingJourney).toBeNull();
    useAppStore.getState().setPendingJourney({ destination: place('B2'), start: place('B9'), mode: 'guide' });
    expect(useAppStore.getState().pendingJourney).toMatchObject({ mode: 'guide', start: { id: 'B9' } });
    useAppStore.getState().setPendingJourney(null);
    expect(useAppStore.getState().pendingJourney).toBeNull();
  });

  test('setting it starts nothing and writes no position', () => {
    useAppStore.getState().setPendingJourney({ destination: place('B2'), start: null, mode: 'live' });
    const s = useAppStore.getState();
    expect(s.isNavigating).toBe(false);
    expect(s.currentLocation).toBeNull();
    expect(s.unfinishedJourney).toBeNull();
    expect(s.routePlannerOrigin).toBeNull();
  });
});
