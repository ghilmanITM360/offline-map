/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from './test-utils';

import { useLocaleStore } from '../i18n';
import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { DestinationRow } from '../views/components/directory/DestinationRow';
import { DestinationBlockGrid } from '../views/components/directory/DestinationBlockGrid';
import { SearchBarField } from '../views/components/common/SearchBarField';
import { useAppStore } from '../store/useAppStore';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { unavailableReasonCopy } from '../utils/unavailableReasonCopy';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: jest.fn() };
});
const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };

const initialStoreState = useAppStore.getState();
const FSI = '⁨';
const PDI = '⁩';
// A name placed inside a message is isolated again by translate().
const iso = (text: string) => `${FSI}${text}${PDI}`;

// English copy from this screen, row and tile that must never show in another language.
const ENGLISH_SENTINELS = [
  'Find your way', 'Search destinations', 'View map', 'Not available yet', 'Clear search',
  'Take', 'Details for', 'Remove from recent', 'Recent', 'No matches',
];

const gate12 = V2PlaceAdapter.getPlaceById('GATE_12')!;
const gate18 = V2PlaceAdapter.getPlaceById('GATE_18')!;
const block14 = V2PlaceAdapter.getPlaceById('B14')!;

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useNavigation.mockReturnValue({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) });
});
afterEach(() => useLocaleStore.setState({ locale: 'en' }));

describe('Directory screen in Urdu and Roman Urdu', () => {
  test('Urdu: title, search, chips and sections are Urdu, and no English leaks', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<LocationsDirectoryScreen />);

    expect(await screen.findByText('اپنا راستہ تلاش کریں')).toBeOnTheScreen();
    expect(screen.getByLabelText('منزل تلاش کریں')).toBeOnTheScreen();
    expect(screen.getByLabelText('نقشہ دیکھیں')).toBeOnTheScreen();
    expect(screen.getAllByText('بلاکس').length).toBeGreaterThan(0);
    expect(screen.getByText(/^گیٹس \(\d+\)$/)).toBeOnTheScreen();
    expect(screen.getByText(/^شہرِ پنڈال \(\d+\)$/)).toBeOnTheScreen();
    for (const english of ENGLISH_SENTINELS) expect(screen.queryByText(new RegExp(english))).toBeNull();
  });

  test('Roman Urdu: copy is Roman Urdu and stays left-to-right', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    await render(<LocationsDirectoryScreen />);

    expect(await screen.findByText('Apna raasta talash karein')).toBeOnTheScreen();
    expect(screen.getByLabelText('Manzil talash karein')).toBeOnTheScreen();
    expect(screen.getByText(/^Rastay \(\d+\)$/)).toBeOnTheScreen();
    expect(screen.queryByText('Find your way')).toBeNull();
  });

  test('typing a place by its Urdu name finds it, and a miss is explained in Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<LocationsDirectoryScreen />);

    fireEvent.changeText(screen.getByLabelText('منزل تلاش کریں'), 'گیٹ 12');
    expect(await screen.findByLabelText(`${iso(`گیٹ ${FSI}12${PDI}`)}، ${iso('گیٹ')}`)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('منزل تلاش کریں'), 'zzzz');
    expect(await screen.findByText(/کے لیے کوئی نتیجہ نہیں ملا/)).toBeOnTheScreen();
    expect(screen.getByText(/جیسے 24 یا گیٹ 15/)).toBeOnTheScreen();
  });

  test('the search icon and clear button sit on the start and end edges, so they mirror in RTL', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<LocationsDirectoryScreen />);
    fireEvent.changeText(screen.getByLabelText('منزل تلاش کریں'), '1');
    await screen.findByLabelText('تلاش صاف کریں');

    const field = screen.getByLabelText('منزل تلاش کریں');
    const style = StyleSheet.flatten(field.props.style);
    expect(style.paddingStart).toBe(44);
    expect(style.paddingEnd).toBe(44);
    expect(style.paddingLeft).toBeUndefined();
    expect(style.paddingRight).toBeUndefined();
  });
});

describe('Destination row and block tile', () => {
  test('English is unchanged: name, Urdu name under it, category, and its labels', async () => {
    await render(<DestinationRow place={gate12} onPress={jest.fn()} onDetails={jest.fn()} />);
    expect(screen.getByText('Gate 12')).toBeOnTheScreen();
    expect(screen.getByText('گیٹ 12')).toBeOnTheScreen();
    expect(screen.getByLabelText('Gate 12, Gate')).toBeOnTheScreen();
    expect(screen.getByLabelText('Details for Gate 12')).toBeOnTheScreen();
  });

  test('Urdu: the name, category, hint and actions are Urdu; the English name is the line under', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<DestinationRow place={gate12} onPress={jest.fn()} onDetails={jest.fn()} />);
    expect(screen.getByText(`گیٹ ${FSI}12${PDI}`)).toBeOnTheScreen();
    expect(screen.getByText('Gate 12')).toBeOnTheScreen();
    expect(screen.getByLabelText(`${iso(`گیٹ ${FSI}12${PDI}`)}، ${iso('گیٹ')}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${iso(`گیٹ ${FSI}12${PDI}`)} کی تفصیل`)).toBeOnTheScreen();
    expect(screen.queryByText(/Details|Takes you/)).toBeNull();
  });

  test('Roman Urdu: unavailable places say so in Roman Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    await render(<DestinationRow place={gate18} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Gate 18, Gate, abhi dastyab nahi')).toBeOnTheScreen();
    expect(screen.getByText('Gate · Abhi dastyab nahi')).toBeOnTheScreen();
  });

  test('a recent row offers a named remove control in the chosen language', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<DestinationRow place={block14} onPress={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByLabelText(`حالیہ سے ہٹائیں: ${iso(`بلاک ${FSI}14${PDI}`)}`)).toBeOnTheScreen();
  });

  test('block tiles name the block in the chosen language', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<DestinationBlockGrid places={[block14]} onPress={jest.fn()} onDetails={jest.fn()} />);
    expect(screen.getByLabelText(`${iso(`بلاک ${FSI}14${PDI}`)}، ${iso('بلاک')}`)).toBeOnTheScreen();
    expect(screen.getByText('بلاک')).toBeOnTheScreen();
    expect(screen.queryByText('Block')).toBeNull();
  });
});

describe('Search field and reasons', () => {
  test('the hint is placed by start and end padding, never physical left and right', async () => {
    await render(<SearchBarField testID="field" value="" placeholder="Search" style={{ paddingStart: 40, paddingEnd: 12 }} />);
    const hint = screen.getByText('Search', { includeHiddenElements: true });
    const style = StyleSheet.flatten(hint.props.style);
    expect(style.start).toBe(41);
    expect(style.end).toBe(13);
    expect(style.left).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  test('an unavailable place gives its reason in the chosen language, and the older data wording is reworded', () => {
    expect(unavailableReasonCopy('Gate 18 needs connector verification before routing.')).toBe(
      "Gate 18 isn't ready for directions yet. Choose another place.",
    );
    useLocaleStore.setState({ locale: 'ur' });
    const urdu = unavailableReasonCopy('Gate 18 needs connector verification before routing.') ?? '';
    expect(urdu).toContain('ابھی رہنمائی کے لیے تیار نہیں');
    expect(urdu).toContain('گیٹ');
    expect(urdu).not.toMatch(/isn't ready/);
    expect(unavailableReasonCopy(undefined)).toBeUndefined();
  });
});
