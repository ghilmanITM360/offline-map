/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Place details, Directions sheet, Route Guide card, peek handle and share speak the chosen language (en, ur-Latn,
// ur) and leak none of their English. Venue names stay inside {placeholders} so they remain readable in Urdu.

import React from 'react';
import { render, screen, within } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { DirectionsPeekHandle, publishDirectionsPeek } from '../views/components/map/DirectionsPeekHandle';
import { SheetHeader } from '../views/components/common/SheetHeader';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import { useLocaleStore } from '../i18n';
import { buildPlaceShareMessage } from '../utils/placeShare';
import { LIGHT_THEME } from '../theme';
import type { Place } from '../models/types';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, { testID: 'sheet-scroll' }, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
  };
});
jest.mock('../viewmodels/DirectionsViewModel', () => ({ useDirectionsViewModel: jest.fn() }));
jest.mock('../services/SearchService', () => ({ SearchService: { search: jest.fn(() => []) } }));

const mockedVm = useDirectionsViewModel as jest.Mock;
const initialStoreState = useAppStore.getState();
const FSI = '⁨';
const PDI = '⁩';

const destination = { id: 'B2', name: 'Block 2', category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67.1 }, sourceVersion: 'v2' } as Place;
const route = { sourceVersion: 'v2', nodes: ['A', 'B'], coordinates: [], totalDistance: 121, estimatedTimeMin: 2 };
const steps = [
  { text: 'Walk along Rasta 1', distanceM: 60 },
  { text: 'Turn right onto Rasta 4', distanceM: 40 },
];
const guideAction = { kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' };

function vm(overrides: Record<string, unknown> = {}) {
  return {
    route, loadState: 'ready', startSource: 'manual_place', startSourceLabel: 'Block 9', startSourceSupportingCopy: '',
    manualStart: { id: 'B9', name: 'Block 9' }, errorMessage: null, manualGateId: null, manualGateOptions: [],
    routeRefreshing: false, currentRouteOriginInsideVenue: true, isOutsideStart: false,
    setManualStartPlace: jest.fn(), chooseCurrentLocation: jest.fn(), chooseRememberedLocation: jest.fn(),
    calculateRoute: jest.fn(), retryOutsideRoute: jest.fn(), selectManualGate: jest.fn(), clearManualGateSelection: jest.fn(),
    handleStartNavigation: jest.fn(), canStartNavigation: false, startNavigationDisabledReason: '',
    startAction: guideAction, startAttempt: 'idle', runStartAction: jest.fn(), startRouteGuide: jest.fn(), ...overrides,
  };
}

const renderRoutePreview = () =>
  render(
    <>
      <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={jest.fn()}
        onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} onCancelRoute={jest.fn()} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      <DirectionsPeekHandle />
    </>,
  );

const placeProps = (overrides: Record<string, unknown> = {}) => ({
  mode: 'preview' as const,
  place: { ...destination, id: 'G12', name: 'Gate 12', category: 'Gate', isMajorGate: true } as Place,
  theme: LIGHT_THEME,
  entryPoints: [{ nodeId: 'n1', friendlyName: 'Rasta 7', urduName: '' }],
  blockGates: [],
  selectedEntryIdx: 0,
  onSelectEntryIdx: jest.fn(),
  walkingTimeMin: 5,
  isFav: false,
  onToggleFavorite: jest.fn(),
  onSelectGate: jest.fn(),
  onOpenDirections: jest.fn(),
  onClose: jest.fn(),
  onShowDetails: jest.fn(),
  onCloseDetails: jest.fn(),
  developerModeEnabled: false,
  ...overrides,
});

const setLocale = (locale: 'en' | 'ur-Latn' | 'ur') => useLocaleStore.setState({ locale });
const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  mockedVm.mockReturnValue(vm());
});
afterEach(() => {
  publishDirectionsPeek(null);
  setLocale('en');
});

describe('Directions sheet', () => {
  test('Urdu: header, From/To rows, actions and peek are Urdu; the place names stay in their own Text', async () => {
    setLocale('ur');
    await renderRoutePreview();
    expect(screen.getByText('راستے کی رہنمائی')).toBeOnTheScreen();
    expect(screen.getByText('اجتماع کے اندر اپنا پیدل راستہ طے کریں')).toBeOnTheScreen();
    // "From"/"To" are their own elements; the name is not concatenated into the label (it must stay readable in RTL).
    expect(screen.getByText('کہاں سے')).toBeOnTheScreen();
    expect(screen.getByText('کہاں تک')).toBeOnTheScreen();
    expect(screen.getByText('Block 9')).toBeOnTheScreen();
    expect(screen.getByText('Block 2')).toBeOnTheScreen();
    expect(button(`${FSI}Block 9${PDI} سے۔ آغاز تبدیل کریں۔`)).toBeOnTheScreen();
    expect(button('راستہ شروع کریں')).toBeEnabled();
    expect(button('میری لوکیشن سے میری رہنمائی کریں')).toBeEnabled();
    expect(button('واپس')).toBeOnTheScreen();
    for (const english of ['Get Directions', 'Plan your walking route', 'Start route', 'Use my location to guide me', 'Route ready', 'Back']) {
      expect(screen.queryByText(new RegExp(english))).not.toBeOnTheScreen();
    }
  });

  test('Urdu: the peek reads right-to-left (arrow points to the end) and its button names the action in Urdu', async () => {
    setLocale('ur');
    mockedVm.mockReturnValue(vm({ loadState: 'idle', startAction: null }));
    await renderRoutePreview();
    expect(screen.getByText(`راستے کی رہنمائی · ${FSI}Block 9${PDI} ← ${FSI}Block 2${PDI}`)).toBeOnTheScreen();
    expect(button(/راستے کی تفصیل (دکھائیں|چھپائیں)/)).toBeOnTheScreen();
  });

  test('Roman Urdu: copy is Latin-script Roman Urdu and the English is gone', async () => {
    setLocale('ur-Latn');
    await renderRoutePreview();
    expect(screen.getByText('Raaste ki rehnumai')).toBeOnTheScreen();
    expect(screen.getByText('Kahan se')).toBeOnTheScreen();
    expect(screen.getByText('Kahan tak')).toBeOnTheScreen();
    expect(button('Raasta shuru karein')).toBeEnabled();
    expect(button('Meri location se meri rehnumai karein')).toBeEnabled();
    expect(button('Raasta mansookh karein')).toBeOnTheScreen();
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
    expect(screen.queryByText('Cancel Route')).not.toBeOnTheScreen();
  });

  test('a failed route says its actions in the chosen language', async () => {
    setLocale('ur');
    mockedVm.mockReturnValue(vm({ loadState: 'error', route: null, errorMessage: null, startAction: null }));
    await renderRoutePreview();
    expect(screen.getByText('ہمیں پیدل راستہ نہیں ملا۔')).toBeOnTheScreen();
    expect(button('دوبارہ کوشش کریں')).toBeOnTheScreen();
    expect(button('آغاز تبدیل کریں')).toBeOnTheScreen();
    expect(screen.queryByText('Try again')).not.toBeOnTheScreen();
  });

  test('a live start action reads in Urdu whatever label the service carried', async () => {
    setLocale('ur');
    mockedVm.mockReturnValue(vm({
      startSource: 'live_gps',
      startAction: { kind: 'use_location', primaryLabel: 'Use my location & start', secondaryLabel: 'View route' },
    }));
    await renderRoutePreview();
    expect(button('میری لوکیشن استعمال کریں اور شروع کریں')).toBeOnTheScreen();
    expect(button('راستہ دیکھیں')).toBeOnTheScreen();
  });

  test('English is unchanged', async () => {
    await renderRoutePreview();
    expect(screen.getByText('Get Directions')).toBeOnTheScreen();
    expect(screen.getByText('From')).toBeOnTheScreen();
    expect(button('From Block 9. Change start.')).toBeOnTheScreen();
  });
});

describe('Route Guide card', () => {
  const open = () => useAppStore.setState({ routeGuide: { steps, stepIndex: 0 } });

  test.each([
    ['ur', 'قدم ⁨1⁩ (کل ⁨2⁩ میں سے)', 'اگلا قدم', 'پچھلا', 'راستے کی ہدایات ختم کریں'],
    ['ur-Latn', 'Qadam 1 (kul 2 mein se)', 'Agla qadam', 'Pichla', 'Raaste ki hidayat khatam karein'],
  ] as const)('%s: step counter and stepper', async (locale, count, next, previous, end) => {
    setLocale(locale);
    open();
    await renderRoutePreview();
    expect(screen.getByText(count)).toBeOnTheScreen();
    expect(button(next)).toBeOnTheScreen();
    expect(within(screen.getByTestId('guide-stepper')).getByText(previous)).toBeOnTheScreen();
    expect(button(end)).toBeOnTheScreen();
    expect(screen.queryByText('Step 1 of 2')).not.toBeOnTheScreen();
    expect(screen.queryByText('End route guide')).not.toBeOnTheScreen();
  });

  test('the folded peek speaks the next step in Urdu', async () => {
    setLocale('ur');
    open();
    await renderRoutePreview();
    expect(screen.getByText(`اگلا: ${FSI}Walk along Rasta 1${PDI} · ${FSI}60 m${PDI}`, { exact: false })).toBeOnTheScreen();
  });
});

describe('Place details sheet', () => {
  test.each([
    ['ur', ['راستے کی رہنمائی', 'محفوظ کریں', 'شیئر کریں', 'تفصیل', 'سرکاری داخلی / خارجی گیٹ · تجویز کردہ داخلہ', '⁨1⁩ داخلی راستہ']],
    ['ur-Latn', ['Raaste ki rehnumai', 'Mehfooz karein', 'Share karein', 'Tafseel', 'Sarkari dakhli / kharji gate · Tajweez kardah dakhla', '1 dakhli raasta']],
  ] as const)('%s: actions, gate note and counts are localized', async (locale, [directions, save, share, details, gateNote, entrances]) => {
    setLocale(locale);
    await render(<LocationSheet {...placeProps()} />);
    expect(screen.getByText(directions)).toBeOnTheScreen();
    expect(screen.getByText(save)).toBeOnTheScreen();
    expect(screen.getByText(share)).toBeOnTheScreen();
    expect(screen.getByText(details)).toBeOnTheScreen();
    expect(screen.getByText(gateNote)).toBeOnTheScreen();
    expect(screen.getByText(entrances)).toBeOnTheScreen();
    for (const english of ['Directions', 'Save', 'Share', 'Details']) expect(screen.queryByText(english)).not.toBeOnTheScreen();
    for (const english of ['Official entry', 'entrance', 'min walk']) expect(screen.queryByText(new RegExp(english))).not.toBeOnTheScreen();
    // The venue name is printed as data, untranslated by the catalog.
    expect(screen.getByText('Gate 12')).toBeOnTheScreen();
  });

  test('details mode: the section headings and back button are localized', async () => {
    setLocale('ur');
    await render(<LocationSheet {...placeProps({ mode: 'details', place: { ...destination, description: 'x' } })} />);
    expect(screen.getByText('جڑے ہوئے رستے')).toBeOnTheScreen();
    expect(button('واپس')).toBeOnTheScreen();
    expect(screen.queryByText('Connected Rastay')).not.toBeOnTheScreen();
  });
});

describe('share and sheet header', () => {
  test.each([
    ['en', 'Karachi Ijtema'],
    ['ur-Latn', 'Karachi Ijtema'],
    ['ur', 'کراچی اجتماع'],
  ] as const)('%s: the share heading', (locale, heading) => {
    setLocale(locale);
    const share = buildPlaceShareMessage(destination);
    expect(share!.message.split('\n')[0]).toBe(`📍 Block 2 — ${heading}`);
    expect(share!.message.split('\n')[1]).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    // An explicit heading still wins, which is how the sheet passes the translated one.
    expect(buildPlaceShareMessage(destination, 'X')!.message.split('\n')[0]).toBe('📍 Block 2 — X');
  });

  test('the sheet header close button names the sheet in the chosen language', async () => {
    setLocale('ur-Latn');
    await render(<SheetHeader title="Layers" onClose={jest.fn()} />);
    expect(button('Layers band karein')).toBeOnTheScreen();
  });
});
