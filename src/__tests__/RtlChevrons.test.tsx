/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { I18nManager } from 'react-native';
import { render, screen } from './test-utils';

import { AboutScreen } from '../views/screens/AboutScreen';
import { AppGuideScreen } from '../views/screens/AppGuideScreen';
import { HelpScreen } from '../views/screens/HelpScreen';
import { SettingsScreen } from '../views/screens/SettingsScreen';
import { DestinationRow } from '../views/components/directory/DestinationRow';
import { PublicDestinationsService } from '../services/PublicDestinationsService';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
}));

// lucide's chevron glyphs do not mirror under RTL, so the screen has to pick the opposite one.
const CHEVRON_LEFT = 'm15 18-6-6 6-6';
const CHEVRON_RIGHT = 'm9 18 6-6-6-6';

function svgPaths(node: any, out: string[] = []): string[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => svgPaths(child, out));
    return out;
  }
  if (node.type === 'RNSVGPath') out.push(node.props.d);
  svgPaths(node.children, out);
  return out;
}

async function renderUnderRtl(ui: React.ReactElement, isRtl: boolean) {
  const original = I18nManager.isRTL;
  Object.defineProperty(I18nManager, 'isRTL', { value: isRtl, configurable: true });
  try {
    await render(ui);
    return svgPaths(screen.toJSON());
  } finally {
    Object.defineProperty(I18nManager, 'isRTL', { value: original, configurable: true });
  }
}

describe('#128: back and forward chevrons follow the layout direction', () => {
  const backScreens: [string, React.ReactElement][] = [
    ['HelpScreen', <HelpScreen />],
    ['AboutScreen', <AboutScreen />],
    ['AppGuideScreen', <AppGuideScreen />],
    ['SettingsScreen', <SettingsScreen />],
  ];

  test.each(backScreens)('%s back chevron points left in LTR and right in RTL', async (_name, ui) => {
    const ltr = await renderUnderRtl(ui, false);
    expect(ltr).toContain(CHEVRON_LEFT);
    expect(ltr).not.toContain(CHEVRON_RIGHT);
  });

  test.each(backScreens)('%s back chevron is mirrored under RTL', async (_name, ui) => {
    const rtl = await renderUnderRtl(ui, true);
    expect(rtl).toContain(CHEVRON_RIGHT);
    expect(rtl).not.toContain(CHEVRON_LEFT);
  });

  test('DestinationRow forward chevron points right in LTR and left in RTL', async () => {
    const place = PublicDestinationsService.getByCategory('blocks')[0];
    const ui = <DestinationRow place={place} onPress={jest.fn()} />;

    expect(await renderUnderRtl(ui, false)).toContain(CHEVRON_RIGHT);
    expect(await renderUnderRtl(ui, true)).toContain(CHEVRON_LEFT);
  });
});
