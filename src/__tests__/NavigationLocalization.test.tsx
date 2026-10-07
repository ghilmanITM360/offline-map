/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, render, renderHook, screen } from './test-utils';

import { useLocaleStore } from '../i18n';
import { InstructionService } from '../services/InstructionService';
import { generateStreetInstructions } from '../services/StreetInstructionService';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { resolveStartAction, evaluateNavigationLocationCapability } from '../services/LocationNavigationCapability';
import { formatLastKnownAge } from '../utils/formatLastKnownAge';
import { NavigationChromeV2 } from '../views/components/navigation/NavigationChromeV2';
import { NavigationChromeV1 } from '../views/components/navigation/NavigationChromeV1';
import { OutsideRouteStatusCard } from '../views/components/navigation/OutsideRouteStatusCard';
import { useNavigationExitConfirmation } from '../viewmodels/useNavigationExitConfirmation';
import type { NavigationOverlayV2 } from '../viewmodels/useNavigationOverlayV2';
import type { NavigationOverlayV1 } from '../viewmodels/useNavigationOverlayV1';
import type { V2ActiveRoute } from '../models/types';
import type { NormalizedOutsideCandidate } from '../models/outsideRouting';

jest.useFakeTimers();
jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));

const BIDI = /[⁨⁩]/g;
const ARABIC = /[؀-ۿ]/;
const noBidi = (s: string) => s.replace(BIDI, '');

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  jest.restoreAllMocks();
});

const setLocale = (locale: 'en' | 'ur-Latn' | 'ur') => useLocaleStore.setState({ locale });

/** Every string a rendered tree shows or announces. */
function visibleCopy(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(noBidi(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => visibleCopy(child, out));
    return out;
  }
  const label = node.props?.accessibilityLabel;
  if (typeof label === 'string') out.push(noBidi(label));
  visibleCopy(node.children, out);
  return out;
}

describe('distance, duration and age wording follows the language', () => {
  test.each([
    ['en', '120 m', '1.2 km', '2 min', '1 hr 5 min', '2 hr', '394 ft'],
    ['ur-Latn', '120 meter', '1.2 kilometer', '2 minute', '1 ghanta 5 minute', '2 ghante', '394 feet'],
    ['ur', '120 میٹر', '1.2 کلومیٹر', '2 منٹ', '1 گھنٹہ 5 منٹ', '2 گھنٹے', '394 فٹ'],
  ] as const)('%s', (locale, meters, km, minutes, hourMinutes, hours, feet) => {
    setLocale(locale);
    expect(noBidi(InstructionService.formatDistance(120))).toBe(meters);
    expect(noBidi(InstructionService.formatDistance(1234))).toBe(km);
    expect(noBidi(InstructionService.formatDistance(120, 'feet'))).toBe(feet);
    expect(noBidi(InstructionService.formatDuration(2))).toBe(minutes);
    expect(noBidi(InstructionService.formatDuration(65))).toBe(hourMinutes);
    expect(noBidi(InstructionService.formatDuration(120))).toBe(hours);
  });

  test('numbers are Western digits in every language', () => {
    setLocale('ur');
    expect(InstructionService.formatDistance(120)).not.toMatch(/[٠-٩۰-۹]/);
    expect(InstructionService.formatDuration(2)).toMatch(/2/);
  });

  test.each([
    ['en', 'from 2 minutes ago', 'from 1 minute ago', 'from 3 hours ago', 'from an earlier session'],
    ['ur-Latn', '2 minute pehle ki', '1 minute pehle ki', '3 ghante pehle ki', 'pichli baar ki'],
    ['ur', '2 منٹ پہلے کی', '1 منٹ پہلے کی', '3 گھنٹے پہلے کی', 'پچھلی بار کی'],
  ] as const)('last-known age, %s', (locale, twoMin, oneMin, threeHours, unknown) => {
    setLocale(locale);
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    expect(noBidi(formatLastKnownAge(ago(2)))).toBe(twoMin);
    expect(noBidi(formatLastKnownAge(ago(1)))).toBe(oneMin);
    expect(noBidi(formatLastKnownAge(ago(180)))).toBe(threeHours);
    expect(formatLastKnownAge(null)).toBe(unknown);
  });
});

describe('route instructions are written in the chosen language', () => {
  const c = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });
  const gate = { en: 'Gate 05', ur: 'گیٹ 05' };

  test('outside street steps', () => {
    const steps = () => generateStreetInstructions([c(24.97, 67.0), c(24.971, 67.0), c(24.971, 67.001)], [100, 90], [undefined, 'Main Road'], gate);
    expect(steps()[1].text).toBe('Turn right on Main Road, then continue 90m. Arrive at Gate 05.');

    setLocale('ur-Latn');
    expect(steps()[0].text).toBe('Gate 05 ki taraf 100 meter chalein.');
    expect(steps()[1].text).toContain('Daayein mudein');
    expect(steps()[1].text).not.toMatch(/Turn|Arrive|continue/);

    setLocale('ur');
    const ur = steps();
    expect(noBidi(ur[1].text)).toBe('Main Road پر دائیں مڑیں، پھر 90 میٹر جاری رکھیں۔ گیٹ 05 پہنچیں۔');
    expect(noBidi(ur[1].text)).not.toMatch(/Turn|Arrive|continue/);
    // The Urdu copy is always kept, whatever the app language.
    expect(ur[1].urduText).toBe(ur[1].text);
  });

  test('venue route steps keep the Urdu copy and drop English sentences outside English', () => {
    const preview = RoutingServiceV2.calculateRoute({ start: { type: 'gate', gateId: 'GATE_13' }, destination: { type: 'block', blockId: 'B1' } })!;
    const sentences = (locale: 'en' | 'ur-Latn' | 'ur') => {
      setLocale(locale);
      const route = RoutingServiceV2.calculateRoute({ start: { type: 'gate', gateId: 'GATE_13' }, destination: { type: 'block', blockId: 'B1' } })!;
      return route.instructions;
    };
    expect(preview.instructions[0].text).toMatch(/^Start from /);

    const english = /Start from|You have reached|Continue (on|to|from|through)|Keep walking/;
    expect(sentences('en').some((step) => english.test(step.text))).toBe(true);
    for (const locale of ['ur-Latn', 'ur'] as const) {
      const steps = sentences(locale);
      expect(steps.some((step) => english.test(step.text))).toBe(false);
      expect(steps.every((step) => ARABIC.test(step.urduText ?? ''))).toBe(true);
    }
    expect(sentences('ur-Latn')[0].text).toMatch(/se shuru karein\.$/);
    expect(ARABIC.test(sentences('ur')[0].text)).toBe(true);
  });

  test('spoken text hides raw ids in every language', () => {
    for (const locale of ['en', 'ur-Latn', 'ur'] as const) {
      setLocale(locale);
      const place = V2PlaceAdapter.getPlaceById('B1')!;
      const preview = RoutingServiceV2.calculateRoute({ start: { type: 'gate', gateId: 'GATE_13' }, destination: { type: 'block', blockId: 'B1' } })!;
      const active = V2NavigationAdapter.fromPreview({ previewRoute: preview, destination: place });
      expect(active.instructions.every((step) => !/\bP\d+\b|\bC\d+\b/.test(step.spokenText ?? ''))).toBe(true);
    }
  });
});

describe('start button states', () => {
  test.each([
    ['ur-Latn', 'Rehnumai shuru karein', 'Chalne ke liye tayyar', 'Meri location istemal karein aur shuru karein'],
    ['ur', 'رہنمائی شروع کریں', 'چلنے کے لیے تیار', 'میری لوکیشن استعمال کریں اور شروع کریں'],
  ] as const)('%s', (locale, start, ready, useLocation) => {
    setLocale(locale);
    const live = { startSource: 'live_gps', liveFix: { latitude: 24.96, longitude: 67.0, accuracy: 8, observedAtMs: Date.now() } as any, permission: { granted: true, precision: 'fine' as const } };
    expect(resolveStartAction(live)).toMatchObject({ kind: 'start', primaryLabel: start, title: ready });
    expect(resolveStartAction({ ...live, liveFix: null }).primaryLabel).toBe(useLocation);
    expect(resolveStartAction({ ...live, startSource: 'manual_place' }).primaryLabel).not.toBe('Start route');
    expect(evaluateNavigationLocationCapability({ startSource: 'manual_place', coordinate: null }).message).not.toMatch(/live directions/);
  });
});

const route: V2ActiveRoute = {
  id: 'r', routeId: 'r', sourceVersion: 'v2',
  coordinates: [{ latitude: 24.9, longitude: 67.1 }, { latitude: 24.903, longitude: 67.103 }],
  nodes: ['A', 'B'], totalDistance: 300, estimatedTimeMin: 5, segments: [],
  origin: { coordinate: { latitude: 24.9, longitude: 67.1 }, label: 'Current location', type: 'inside_snap' },
  destination: { coordinate: { latitude: 24.903, longitude: 67.103 }, label: 'Gate 8', type: 'gate', gateId: 'GATE_08' },
  instructions: [
    { id: 'i1', text: 'x', distance: 300, distanceM: 300, routeIndex: 0, type: 'left', roadName: 'Rasta 05', coordinate: { latitude: 24.9, longitude: 67.1 } },
    { id: 'i2', text: 'y', distance: 0, distanceM: 0, routeIndex: 1, type: 'arrival', coordinate: { latitude: 24.903, longitude: 67.103 } },
  ],
  metadata: { startedOutside: false, usesOfficialGateEntry: false, graphVersion: 't' },
} as unknown as V2ActiveRoute;

function overlay(overrides: Partial<NavigationOverlayV2> = {}): NavigationOverlayV2 {
  return {
    route, instructions: route.instructions, currentStepIndex: 0, isMuted: false, setIsMuted: jest.fn(),
    remainingDistance: 300, maneuverDistance: 120, etaMinutes: 5, arrived: false, reroutePending: false,
    isWeakGps: false, rerouteStatusMessage: null, snappedLocation: { latitude: 24.9, longitude: 67.1 },
    settings: { distanceUnit: 'meters', keepNorthFixed: false, voiceInstructions: true, walkingSpeed: 1.4, autoReroute: true },
    requestNavigationExit: jest.fn(), completeArrivalNavigation: jest.fn(), setIsAutoFollowing: jest.fn(),
    ...overrides,
  } as unknown as NavigationOverlayV2;
}

// lucide arrows are fixed glyphs; a left turn must stay a left arrow even when the layout is right-to-left.
const ARROW_LEFT_HEAD = 'm12 19-7-7 7-7';
const ARROW_RIGHT_HEAD = 'm12 5 7 7-7 7';
function svgPaths(node: any, out: string[] = []): string[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) { node.forEach((child) => svgPaths(child, out)); return out; }
  if (node.type === 'RNSVGPath') out.push(node.props.d);
  svgPaths(node.children, out);
  return out;
}

describe('NavigationChromeV2 in Roman Urdu and Urdu', () => {
  const ENGLISH_LEAKS = /Left Turn|Right Turn|Straight|Weak signal|Exit|Recenter|Arrived|Unmute|Mute voice|Then:| min\b|Arrive /;

  test('the step card, trip bar and controls are localized with no English leaking', async () => {
    setLocale('ur');
    await render(<NavigationChromeV2 overlay={overlay({ isWeakGps: true })} hasBaseMap />);
    const copy = visibleCopy(screen.toJSON()).join(' | ');
    expect(copy).toContain('بائیں مڑیں');
    expect(copy).toContain('120 میٹر');
    expect(copy).toContain('5 منٹ');
    expect(copy).toContain('سگنل کمزور ہے');
    expect(copy).toContain('رہنمائی سے نکلیں');
    expect(copy).toMatch(/پھر: .*پہنچ جائیں/);
    expect(copy).not.toMatch(ENGLISH_LEAKS);
  });

  test('Roman Urdu is Latin script and stays left-to-right', async () => {
    setLocale('ur-Latn');
    await render(<NavigationChromeV2 overlay={overlay({ isWeakGps: true })} hasBaseMap />);
    const copy = visibleCopy(screen.toJSON()).join(' | ');
    expect(copy).toContain('Baayein mudein');
    expect(copy).toContain('120 meter');
    expect(copy).toContain('5 minute');
    expect(copy).toContain('Signal kamzor hai');
    expect(copy).not.toMatch(ENGLISH_LEAKS);
    expect(ARABIC.test(copy)).toBe(false);
  });

  test.each(['en', 'ur-Latn', 'ur'] as const)('the left-turn arrow keeps pointing left in %s', async (locale) => {
    setLocale(locale);
    await render(<NavigationChromeV2 overlay={overlay()} hasBaseMap />);
    const paths = svgPaths(screen.toJSON());
    expect(paths).toContain(ARROW_LEFT_HEAD);
    expect(paths).not.toContain(ARROW_RIGHT_HEAD);
  });

  test('the signal-lost banner is localized', async () => {
    setLocale('ur');
    await render(<NavigationChromeV2 overlay={overlay({ gpsSignalState: 'GPS_LOST' } as any)} hasBaseMap />);
    expect(screen.getByText('آپ کا پتا نہیں چل رہا۔ کسی کھلی جگہ پر جائیں۔')).toBeOnTheScreen();
  });

  test('the map-unavailable banner is localized', async () => {
    setLocale('ur');
    await render(<NavigationChromeV2 overlay={overlay()} hasBaseMap={false} />);
    expect(screen.getByText('نقشہ نہیں دکھایا جا سکتا۔ رہنمائی پھر بھی کام کرتی ہے۔')).toBeOnTheScreen();
  });

  test('the recenter button sits at the layout end, so it mirrors with the language', async () => {
    setLocale('ur');
    await render(<NavigationChromeV2 overlay={overlay()} hasBaseMap />);
    const style = StyleSheet.flatten(screen.getByTestId('nav-recenter-button').props.style);
    expect(style.end).toBe(16);
    expect(style.right).toBeUndefined();
  });

  test('arrival card in Urdu has one Urdu title and no English', async () => {
    setLocale('ur');
    await render(<NavigationChromeV2 overlay={overlay({ arrived: true })} hasBaseMap />);
    expect(screen.getAllByText('آپ پہنچ گئے!')).toHaveLength(1);
    expect(screen.getByText('مکمل')).toBeOnTheScreen();
    expect(screen.queryByText("You've Arrived!")).toBeNull();
  });

  test('arrival card in Roman Urdu is Latin script', async () => {
    setLocale('ur-Latn');
    await render(<NavigationChromeV2 overlay={overlay({ arrived: true })} hasBaseMap />);
    expect(screen.getByText('Aap pohanch gaye!')).toBeOnTheScreen();
    expect(ARABIC.test(visibleCopy(screen.toJSON()).join(' '))).toBe(false);
  });

  test('arrival card in English keeps its Urdu line', async () => {
    await render(<NavigationChromeV2 overlay={overlay({ arrived: true })} hasBaseMap />);
    expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
    expect(screen.getByText('آپ پہنچ گئے!')).toBeOnTheScreen();
  });

  test('switching the language re-renders the open card', async () => {
    await render(<NavigationChromeV2 overlay={overlay()} hasBaseMap />);
    expect(screen.getByText('Left Turn')).toBeOnTheScreen();
    await act(async () => setLocale('ur-Latn'));
    expect(screen.getByText('Baayein mudein')).toBeOnTheScreen();
    expect(screen.queryByText('Left Turn')).toBeNull();
  });
});

describe('NavigationChromeV1 in Urdu', () => {
  test('banner, trip bar and exit are localized', async () => {
    setLocale('ur');
    const v1 = {
      route: { id: 'r', totalDistance: 300, estimatedTimeMin: 65, coordinates: [], nodes: [], segments: [] },
      destination: { id: 'd', name: 'Block 3', category: 'Block', coordinate: { latitude: 0, longitude: 0 } },
      instructions: [{ id: 'a', text: 'x', distance: 80, type: 'right', roadName: 'Rasta 02', coordinate: { latitude: 0, longitude: 0 } }],
      currentStepIndex: 0, isMuted: true, setIsMuted: jest.fn(), remainingDistance: 80, arrived: false, reroutePending: false,
      isWeakGps: false, rerouteStatusMessage: null, snappedLocation: null,
      settings: { distanceUnit: 'meters' }, requestNavigationExit: jest.fn(), completeArrivalNavigation: jest.fn(),
      setIsAutoFollowing: jest.fn(), bottomBarHeight: 0, setBottomBarHeight: jest.fn(),
    } as unknown as NavigationOverlayV1;
    await render(<NavigationChromeV1 overlay={v1} hasBaseMap />);
    const copy = visibleCopy(screen.toJSON()).join(' | ');
    expect(copy).toContain('دائیں مڑیں');
    expect(copy).toContain('80 میٹر');
    expect(copy).toContain('1 گھنٹہ 5 منٹ');
    expect(copy).toContain('آواز کی رہنمائی چالو کریں');
    expect(copy).not.toMatch(/Right Turn|ETA|Exit|Unmute|hr|min\b/);
    const paths = svgPaths(screen.toJSON());
    expect(paths).toContain(ARROW_RIGHT_HEAD);
  });
});

describe('OutsideRouteStatusCard', () => {
  const direct = (): NormalizedOutsideCandidate => ({
    schemaVersion: 1, candidateId: 'c', requestId: 'r', requestVersion: 1, provider: 'direct-guide', gateId: 'GATE_05',
    distanceM: 250, durationSeconds: null, coordinates: [], steps: [], roadFollowing: false, distanceKind: 'direct-distance',
    warnings: [{ code: 'direct-guide-not-road-route' }], fallbackReason: 'outside-coverage', fallbackHistory: [],
  } as unknown as NormalizedOutsideCandidate);

  test('Urdu shows one Urdu warning, not a second copy', async () => {
    setLocale('ur');
    await render(<OutsideRouteStatusCard route={direct()} gateLabel="Gate 05" onRetry={jest.fn()} onChooseGate={jest.fn()} />);
    expect(screen.getAllByText(/سڑک کا راستہ نہیں مل سکا/)).toHaveLength(1);
    expect(screen.getByText('دوبارہ کوشش کریں')).toBeOnTheScreen();
    expect(screen.getByText('دوسرا گیٹ منتخب کریں')).toBeOnTheScreen();
    expect(visibleCopy(screen.toJSON()).join(' ')).not.toMatch(/Try again|Choose another|Selected gate|road route/);
  });

  test('Roman Urdu has no Urdu script', async () => {
    setLocale('ur-Latn');
    await render(<OutsideRouteStatusCard route={direct()} gateLabel="Gate 05" onRetry={jest.fn()} />);
    expect(screen.getByText('Dobara koshish karein')).toBeOnTheScreen();
    expect(ARABIC.test(visibleCopy(screen.toJSON()).join(' '))).toBe(false);
  });

  test('English keeps the bilingual warning', async () => {
    await render(<OutsideRouteStatusCard route={direct()} gateLabel="Gate 05" />);
    expect(screen.getByText(/We can't find a road route/)).toBeOnTheScreen();
    expect(screen.getByText(/سڑک کا راستہ نہیں مل سکا/)).toBeOnTheScreen();
  });
});

describe('stop-directions confirmation', () => {
  test('is asked in the chosen language', async () => {
    setLocale('ur-Latn');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = await renderHook(() => useNavigationExitConfirmation({ active: true, arrived: false, onExit: jest.fn() }));
    await act(async () => result.current.requestNavigationExit());
    const [title, body, buttons] = alertSpy.mock.calls[0] as [string, string, Array<{ text: string }>];
    expect(title).toBe('Rehnumai band karein?');
    expect(body).toBe('Aap naqshe par wapas chale jayenge.');
    expect(buttons.map((b) => b.text)).toEqual(['Jari rakhein', 'Band karein']);
  });
});
