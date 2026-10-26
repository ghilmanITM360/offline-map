/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C4.1 characterization: the host's live progress/step math and the SDK controller are fed the SAME seeded walk along the SAME
// Ijtema route. This measures where they agree and where they differ; it asserts the safety-relevant agreements only.
import { createNavigationController, type LiveFixCoordinate } from '@muslim-ummah/offline-navigation';
import { IJTEMA_VENUE_SOURCE } from '../data/ijtema/venueAdapter';
import { SearchService } from '../services/SearchService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { calculateLiveManeuverDistanceV2, calculateNavigationProgressV2 } from '../services/V2NavigationRuntimeService';
import { ARRIVAL_THRESHOLD_METERS } from '../constants/navigation';
import { getDistance } from 'geolib';
import type { Place } from '../models/types';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const SPEED = 1.4;
const T0 = 1_700_000_000_000;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

interface Pair { from: Place; to: Place }
const gates = IJTEMA_VENUE_SOURCE.placeIds().filter((id) => IJTEMA_VENUE_SOURCE.getPlace(id)?.kind === 'gate');
const blocks = IJTEMA_VENUE_SOURCE.placeIds().filter((id) => IJTEMA_VENUE_SOURCE.getPlace(id)?.kind === 'block');
const placeById = (id: string): Place | undefined => SearchService.search(id.replace(/[-_]/g, ' '))?.find((p) => p.id === id);

const pairs: Pair[] = [];
{
  const next = rng(7);
  for (let guard = 0; pairs.length < 40 && guard < 400; guard += 1) {
    const from = placeById(gates[Math.floor(next() * gates.length)]);
    const to = placeById(blocks[Math.floor(next() * blocks.length)]);
    if (from && to) pairs.push({ from, to });
  }
}

/** Points along the polyline every `stepM`, with seeded lateral noise. */
function walk(coords: readonly { latitude: number; longitude: number }[], stepM: number, noiseM: number, next: () => number) {
  const out: { latitude: number; longitude: number }[] = [];
  let carry = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    const len = getDistance(a, b);
    for (let d = carry; d <= len; d += stepM) {
      const t = len === 0 ? 0 : d / len;
      const jitterLat = ((next() - 0.5) * 2 * noiseM) / 111_320;
      const jitterLng = ((next() - 0.5) * 2 * noiseM) / (111_320 * Math.cos((a.latitude * Math.PI) / 180));
      out.push({ latitude: a.latitude + (b.latitude - a.latitude) * t + jitterLat, longitude: a.longitude + (b.longitude - a.longitude) * t + jitterLng });
      carry = d + stepM - len;
    }
  }
  const last = coords[coords.length - 1];
  out.push({ latitude: last.latitude, longitude: last.longitude });
  return out;
}

describe('host live engine vs SDK controller on identical Ijtema walks (C4.1 characterization)', () => {
  it('has a usable sample of routable pairs', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(20);
  });

  it('agree on route length, step order, arrival and bounded progress difference', async () => {
    const next = rng(99);
    const rows: { pair: string; routeDiffM: number; maxProgressDiffM: number; hostArrivedAt: number | null; sdkArrivedAt: number | null; stepOrderOk: boolean }[] = [];
    let compared = 0;
    const skipped: string[] = [];

    for (const { from, to } of pairs) {
      const preview = V2DirectionsService.calculatePreview({ startPlace: from, destination: to, currentLocation: null, walkingSpeedMs: SPEED });
      if (preview.status !== 'ready' || !preview.route) continue;
      const host = V2NavigationAdapter.fromPreview({ previewRoute: preview.route, destination: to, startPlace: from });
      if (host.coordinates.length < 2 || host.totalDistanceM < 30) continue;

      const fixes = walk(host.coordinates, SPEED, 2, next).map((c, i): LiveFixCoordinate => ({
        latitude: c.latitude, longitude: c.longitude, accuracy: 8, observedAtMs: T0 + i * 1000,
      }));
      let clock = T0;
      const sdk = createNavigationController({
        venue: IJTEMA_VENUE_SOURCE,
        now: () => clock,
        location: {
          getPermission: async () => ({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' }),
          requestPermission: async () => ({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' }),
          getCurrentFix: async () => fixes[0],
          watch: () => () => {},
        },
      });
      sdk.selectDestination(to.id);
      sdk.selectOrigin(from.id);
      const sdkPreviewRoute = sdk.getState().route;
      if (!sdkPreviewRoute) continue;

      // Host side: replay the walk through the exact functions NavigationViewModelV2 calls.
      let hostProgress = 0;
      let hostStep = 0;
      let hostPrevObserved: number | null = null;
      let hostEta: number | undefined;
      let hostArrivedAt: number | null = null;
      const hostProgressSeries: number[] = [];
      const hostSteps: number[] = [];
      const lastIndex = host.instructions.length - 1;
      const finalSegmentIndex = host.instructions[lastIndex].type === 'arrival' && lastIndex > 0 &&
        host.instructions[lastIndex - 1].routeIndex === host.instructions[lastIndex].routeIndex ? lastIndex - 1 : lastIndex;
      fixes.forEach((fix, i) => {
        const coordinate = { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, observedAtMs: fix.observedAtMs };
        const p = calculateNavigationProgressV2({ route: host, coordinate, previousProgressMeters: hostProgress, previousEtaMinutes: hostEta, walkingSpeedMs: SPEED, previousObservedAtMs: hostPrevObserved });
        hostProgress = p.progressMeters; hostEta = p.etaMinutes; hostPrevObserved = fix.observedAtMs ?? null;
        hostStep = calculateLiveManeuverDistanceV2({ route: host, currentStepIndex: hostStep, progressMeters: hostProgress }).stepIndex;
        hostProgressSeries.push(hostProgress);
        hostSteps.push(hostStep);
        if (hostArrivedAt === null && hostStep >= finalSegmentIndex && getDistance(coordinate, host.destination.coordinate) <= ARRIVAL_THRESHOLD_METERS) hostArrivedAt = i;
      });

      // SDK side: explicit Live from the first fix, then the same fixes through ingestFix with the clock on each fix.
      clock = T0;
      const started = await sdk.requestLive();
      if (!started) { skipped.push(`${from.id}->${to.id}: live did not start (${sdk.getState().liveAttempt.blocker})`); continue; }
      const sdkProgressSeries: number[] = [];
      const sdkSteps: number[] = [];
      let sdkArrivedAt: number | null = null;
      fixes.forEach((fix, i) => {
        clock = T0 + i * 1000;
        sdk.ingestFix(fix);
        const s = sdk.getState();
        sdkProgressSeries.push(s.live?.progressM ?? 0);
        sdkSteps.push(s.stepIndex);
        if (sdkArrivedAt === null && s.phase === 'arrived') sdkArrivedAt = i;
      });
      sdk.dispose();
      // The SDK freezes progress at arrival (the engine's authority boundary); the host keeps projecting. Compare up to arrival only.
      const n = Math.min(hostProgressSeries.length, sdkProgressSeries.length, hostArrivedAt ?? Infinity, sdkArrivedAt ?? Infinity);
      let maxProgressDiffM = 0;
      for (let i = 0; i < n; i += 1) maxProgressDiffM = Math.max(maxProgressDiffM, Math.abs(hostProgressSeries[i] - sdkProgressSeries[i]));
      rows.push({
        pair: `${from.id}->${to.id}`, routeDiffM: Math.abs(host.totalDistanceM - sdkPreviewRoute.distanceM), maxProgressDiffM, hostArrivedAt, sdkArrivedAt,
        stepOrderOk: hostSteps.every((s, i) => i === 0 || s >= hostSteps[i - 1]) && sdkSteps.every((s, i) => i === 0 || s >= sdkSteps[i - 1]),
      });
      compared += 1;
    }
    expect(skipped).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(30);
    // Same graph, same A*: identical route length. Both engines finish every walk and never move a step backwards.
    expect(Math.max(...rows.map((r) => r.routeDiffM))).toBe(0);
    expect(rows.filter((r) => r.hostArrivedAt === null || r.sdkArrivedAt === null)).toEqual([]);
    expect(rows.filter((r) => !r.stepOrderOk)).toEqual([]);
    // Measured at C4.1 (36 walks, seeded 2 m lateral noise, 1.4 m/s): progress differs by at most 8.5 m (median 1.5 m) before arrival and
    // arrival lands within 6 one-second fixes. The causes are the projection method (planar degrees vs local tangent) and the arrival point
    // (the host's destination coordinate vs the route's final node). These bounds pin today's behaviour; they are not an equivalence claim.
    expect(Math.max(...rows.map((r) => r.maxProgressDiffM))).toBeLessThanOrEqual(10);
    expect(Math.max(...rows.map((r) => Math.abs((r.hostArrivedAt as number) - (r.sdkArrivedAt as number))))).toBeLessThanOrEqual(8);
  });
});
