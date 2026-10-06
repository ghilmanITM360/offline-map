import React from 'react';
import { screen, userEvent } from '@testing-library/react-native';

import type { NormalizedOutsideCandidate } from '../models/outsideRouting';
import { OutsideRouteStatusCard } from '../views/components/navigation/OutsideRouteStatusCard';
import { render } from './test-utils';

function route(overrides: Partial<NormalizedOutsideCandidate> = {}): NormalizedOutsideCandidate {
  return {
    schemaVersion: 1,
    candidateId: 'ui-1:google:GATE_05:0',
    requestId: 'ui-1',
    requestVersion: 1,
    provider: 'google',
    gateId: 'GATE_05',
    distanceM: 250,
    durationSeconds: 180,
    coordinates: [
      { latitude: 24.96, longitude: 67.01 },
      { latitude: 24.961, longitude: 67.011 },
    ],
    steps: [],
    roadFollowing: true,
    distanceKind: 'walking-route',
    warnings: [],
    fallbackReason: null,
    fallbackHistory: [],
    ...overrides,
  };
}

describe('OutsideRouteStatusCard', () => {
  test.each([
    ['google', 'Walking route'],
    ['offline-osm', 'Walking route'],
  ] as const)('shows accurate %s provider identity', async (provider, label) => {
    await render(<OutsideRouteStatusCard route={route({ provider })} gateLabel="Gate 05" />);
    expect(screen.getByText(label)).toBeOnTheScreen();
    expect(screen.queryByText(/not a road route/i)).not.toBeOnTheScreen();
  });

  test('shows Google-to-OSM fallback reason without relabelling OSM as Google', async () => {
    await render(<OutsideRouteStatusCard
      route={route({
        provider: 'offline-osm',
        fallbackReason: 'timed-out',
        fallbackHistory: [{ provider: 'google', code: 'timed-out', retryable: true }],
      })}
      gateLabel="Gate 05"
    />);
    expect(screen.getByText('Walking route')).toBeOnTheScreen();
    expect(screen.getByText('Using a simpler route. It may be less exact.')).toBeOnTheScreen();
  });

  test('renders direct guide as bilingual alert with retry and manual-gate actions', async () => {
    const onRetry = jest.fn();
    const onChooseGate = jest.fn();
    const user = userEvent.setup();
    await render(<OutsideRouteStatusCard
      route={route({
        provider: 'direct-guide',
        roadFollowing: false,
        distanceKind: 'direct-distance',
        durationSeconds: null,
        steps: [],
        warnings: [{ code: 'direct-guide-not-road-route' }],
        fallbackReason: 'outside-coverage',
      })}
      gateLabel="Gate 05"
      onRetry={onRetry}
      onChooseGate={onChooseGate}
    />);

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText('Straight-line guide, not a road route')).toBeOnTheScreen();
    expect(screen.getByText("We can't find a road route. The arrow points straight to the gate and may not follow walkable roads. Look around as you walk.")).toBeOnTheScreen();
    expect(screen.getByText('سڑک کا راستہ نہیں مل سکا۔ تیر سیدھا گیٹ کی طرف اشارہ کرتا ہے اور ضروری نہیں کہ پیدل چلنے کے راستوں پر ہو۔ چلتے وقت اردگرد دیکھ لیں۔')).toBeOnTheScreen();
    expect(screen.queryByText(/turn (left|right)/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/continue ahead/i)).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await user.press(screen.getByRole('button', { name: 'Choose another gate' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onChooseGate).toHaveBeenCalledTimes(1);
  });

  test('disables duplicate retry while a request is active', async () => {
    await render(<OutsideRouteStatusCard
      route={route({
        provider: 'direct-guide',
        roadFollowing: false,
        distanceKind: 'direct-distance',
        durationSeconds: null,
        warnings: [{ code: 'direct-guide-not-road-route' }],
      })}
      gateLabel="Gate 05"
      retrying
      onRetry={jest.fn()}
    />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    expect(screen.getByText('Looking for a better route…')).toBeOnTheScreen();
  });
});
