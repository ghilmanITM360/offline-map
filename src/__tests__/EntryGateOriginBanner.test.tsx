/**
 * B4c-7: the Ijtema entry-gate origin banner is a binding over the SDK banner. Copy, colours, layout
 * and Urdu wrapping must survive the extraction; the chrome still decides when it shows.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';
import { staticColors } from '../theme';
import { EntryGateOriginBanner } from '../views/components/navigation/EntryGateOriginBanner';
import { EntryGateOriginBanner as SdkBanner } from '../../packages/offline-navigation/src/ui/EntryGateOriginBanner';

jest.mock('../../packages/offline-navigation/src/ui/EntryGateOriginBanner', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/EntryGateOriginBanner');
  return { ...actual, EntryGateOriginBanner: jest.fn(actual.EntryGateOriginBanner) };
});

test('binding delegates copy and app colours; layout matches the old v2EntryGateBanner', async () => {
  await render(<EntryGateOriginBanner message="Route starts from Gate 5." />);
  const props = (SdkBanner as jest.Mock).mock.calls.at(-1)[0];
  expect(props).toMatchObject({
    message: 'Route starts from Gate 5.',
    theme: { colors: { fill: staticColors.entryGateBackground, border: staticColors.entryGateBorder, text: staticColors.focusedBlock } },
  });
  const text = screen.getByText('Route starts from Gate 5.');
  expect(StyleSheet.flatten(text.props.style)).toEqual({ color: staticColors.focusedBlock, fontSize: 12, fontWeight: '700', textAlign: 'center' });
  expect(StyleSheet.flatten(text.parent!.props.style)).toEqual({
    marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: staticColors.entryGateBackground, borderWidth: 1, borderColor: staticColors.entryGateBorder,
  });
});

test('reads once as plain text, not a live region', async () => {
  await render(<EntryGateOriginBanner message="O" />);
  expect(screen.getAllByText('O')).toHaveLength(1);
  expect(screen.getByText('O').parent!.props.accessibilityLiveRegion).toBeUndefined();
});

test('Urdu copy wraps rather than truncating', async () => {
  const long = 'راستہ گیٹ نمبر 5 سے شروع ہوتا ہے۔';
  await render(<EntryGateOriginBanner message={long} />);
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('SDK banner renders host copy and colours with no app dependencies', async () => {
  const { EntryGateOriginBanner: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/EntryGateOriginBanner');
  await render(<Actual message="O" theme={{ colors: { fill: '#fff', border: '#000', text: '#123' } }} />);
  expect(StyleSheet.flatten(screen.getByText('O').props.style).color).toBe('#123');
});
