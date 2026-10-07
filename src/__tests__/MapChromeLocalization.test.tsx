/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, render, renderHook, screen } from './test-utils';
import { useLocaleStore, translate } from '../i18n';
import { MapControls } from '../views/components/map/MapControls';
import { MapTopBar } from '../views/components/map/MapTopBar';
import { LayersSheet } from '../views/components/map/LayersSheet';
import { LocationTutorialTooltip } from '../views/components/map/LocationTutorialTooltip';
import { OsmAttribution, OSM_ATTRIBUTION_TEXT } from '../views/components/map/OsmAttribution';
import { MapLabelOverlay } from '../views/components/map/MapLabelOverlay';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { LocationAccessService } from '../services/LocationAccessService';
import { useAppStore } from '../store/useAppStore';
import type { Place } from '../models/types';

jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../services/LocationAccessService', () => ({
  LocationAccessService: { resolveCurrentLocation: jest.fn(), openAppSettings: jest.fn() },
}));

const resolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.MockedFunction<typeof LocationAccessService.resolveCurrentLocation>;
const initialStoreState = useAppStore.getState();
const ARABIC = /[؀-ۿ]/;

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  useAppStore.setState(initialStoreState, true);
  jest.restoreAllMocks();
});

const controlProps = {
  variant: 'browse' as const,
  compassMode: 'NORTH_UP' as const,
  onLayers: jest.fn(),
  onCompassToggle: jest.fn(),
  onZoomIn: jest.fn(),
  onZoomOut: jest.fn(),
  recenter: { state: 'idle' as const, onPress: jest.fn() },
};

describe.each([
  ['ur', 'نقشے کے مزید کنٹرولز', 'مقامات', 'مینو کھولیں'],
  ['ur-Latn', 'Naqshay ke mazeed controls', 'Maqamaat', 'Menu kholein'],
] as const)('map chrome in %s', (locale, moreControls, places, openMenu) => {
  beforeEach(() => useLocaleStore.setState({ locale }));

  test('floating controls are named in the chosen language, with no English leaking', async () => {
    await render(<MapControls {...controlProps} />);
    expect(screen.getByLabelText(moreControls)).toBeOnTheScreen();
    expect(screen.queryByLabelText('More map controls')).toBeNull();
    expect(screen.queryByLabelText(/Follow direction/)).toBeNull();
    expect(screen.queryByLabelText('Center map on my current location')).toBeNull();
    expect(screen.getByLabelText(translate(locale, 'map.followOff'))).toBeOnTheScreen();
    expect(screen.getByLabelText(translate(locale, 'map.recenter'))).toBeOnTheScreen();
  });

  test('top bar names Places and the menu in the chosen language', async () => {
    await render(<MapTopBar title={null} onPlaces={jest.fn()} onMore={jest.fn()} />);
    expect(screen.getByRole('button', { name: places })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: openMenu })).toBeOnTheScreen();
    expect(screen.queryByText('Places')).toBeNull();
  });

  test('layers sheet has no English headings or layer names', async () => {
    await render(
      <LayersSheet
        visible
        onClose={jest.fn()}
        showBlockPolygons
        onToggleBlocks={jest.fn()}
        showGatesLayer
        onToggleGates={jest.fn()}
        showRastasLayer
        onToggleRastas={jest.fn()}
        showSpecialRoutesLayer
        onToggleSpecialRoutes={jest.fn()}
      />,
    );
    expect(screen.getByText(translate(locale, 'map.layersTitle'))).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: translate(locale, 'map.layerGates') })).toBeOnTheScreen();
    // "Blocks" and "Gates" are kept as Roman Urdu words, so only the words that change are checked.
    for (const english of ['Map Layers', 'Show on Map', 'Rastas']) {
      expect(screen.queryByText(english)).toBeNull();
    }
  });

  test('first-location tooltip is localized', async () => {
    await render(<LocationTutorialTooltip onDismiss={jest.fn()} bottomOffset={100} />);
    expect(screen.getByText(translate(locale, 'map.hereTitle'))).toBeOnTheScreen();
    expect(screen.queryByText("You're here")).toBeNull();
  });

  test('the OpenStreetMap credit stays exactly as the licence requires, only its screen-reader name is translated', async () => {
    await render(<OsmAttribution visible top={10} />);
    expect(screen.getByText(OSM_ATTRIBUTION_TEXT)).toBeOnTheScreen();
    expect(OSM_ATTRIBUTION_TEXT).toBe('© OpenStreetMap contributors · ODbL');
    expect(screen.getByLabelText(translate(locale, 'map.osmLabel'))).toBeOnTheScreen();
    expect(screen.queryByLabelText(/licence information$/)).toBeNull();
  });
});

describe('map chrome in Urdu script', () => {
  test('uses Urdu script for every control name', () => {
    for (const key of ['map.places', 'map.zoomIn', 'map.layersTitle', 'map.outsideBannerTitle', 'map.cancelRouteTitle'] as const) {
      expect(ARABIC.test(translate('ur', key))).toBe(true);
    }
  });

  test('spoken map-label names join with the Arabic comma', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    const mapRef = { current: { pointForCoordinate: jest.fn().mockResolvedValue({ x: 100, y: 100 }) } };
    await render(
      <MapLabelOverlay
        mapRef={mapRef as never}
        items={[{ id: 'b', coordinate: { latitude: 1, longitude: 1 }, text: 'Block 2', secondaryText: 'بلاک 2', kind: 'block', zPriority: 1 }]}
      />,
    );
    expect(await screen.findByLabelText('Block 2، بلاک 2')).toBeOnTheScreen();
  });
});

describe('location dialogs from the Home view model', () => {
  const noCoordinatePlace = { id: 'x', name: 'Block 9', category: 'Block', description: '', sourceVersion: 'v2' } as unknown as Place;
  const permission = (overrides: Record<string, unknown>) => ({
    granted: true,
    canAskAgain: true,
    status: 'granted' as never,
    precision: 'precise' as const,
    servicesEnabled: true,
    servicesState: 'enabled' as const,
    ...overrides,
  });

  test.each([
    ['ur', 'ہم آپ کو تلاش نہیں کر پا رہے', 'ترتیبات کھولیں'],
    ['ur-Latn', 'Hum aap ko nahi dhoond sakay', 'Tarteebat kholein'],
  ] as const)('%s: "we can\'t find you" dialog and its actions are localized', async (locale, title, openSettings) => {
    useLocaleStore.setState({ locale });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: permission({ granted: false, canAskAgain: false, status: 'denied', precision: 'none' }) as never,
      message: 'Location is off for this app. Turn it on in Settings.',
    });
    const hook = await renderHook(() => useHomeViewModel());

    await act(async () => {
      await hook.result.current.handleRecenter();
    });

    expect(alert).toHaveBeenCalledTimes(1);
    const [shownTitle, shownBody, actions] = alert.mock.calls[0] as unknown as [string, string, Array<{ text: string }>];
    expect(shownTitle).toBe(title);
    expect(shownBody).toBe(translate(locale, 'map.locationOffForApp'));
    expect(actions.map((a) => a.text)).toContain(openSettings);
    expect([shownTitle, shownBody, ...actions.map((a) => a.text)].join(' ')).not.toMatch(/We can't find|Open Settings|Turn it on/);
  });

  test('the outside-Ijtema dialog is localized when a live fix lands outside the grounds', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    resolveCurrentLocation.mockResolvedValue({
      ok: true,
      coordinate: { latitude: 24.9022, longitude: 67.1024, accuracy: 6 },
      source: 'live',
      permissionState: permission({}) as never,
      message: null,
    });
    const hook = await renderHook(() => useHomeViewModel());
    await act(async () => {
      await hook.result.current.handleRecenter();
    });
    const titles = alert.mock.calls.map((call) => call[0]);
    expect(titles).toContain(translate('ur', 'map.outsideTitle'));
    expect(titles).not.toContain('You are outside Ijtema');
  });

  test('a place with no map position gets a localized unavailable alert that names the place', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const hook = await renderHook(() => useHomeViewModel());
    await act(async () => {
      hook.result.current.handlePlaceSelect(noCoordinatePlace);
    });
    expect(alert).toHaveBeenCalledWith('Maqam dastiyab nahi', 'Block 9 abhi naqshay par dastiyab nahi.');
  });
});
