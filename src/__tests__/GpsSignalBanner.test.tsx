/**
 * B4c-5: the Ijtema weak/lost GPS banner is a binding over the SDK banner. Copy, colours, the
 * status-specific live region, Urdu wrapping and the chrome's status-slot priority must survive the extraction.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';
import { staticColors } from '../theme';
import { GpsSignalBanner } from '../views/components/navigation/GpsSignalBanner';
import { GpsSignalBanner as SdkBanner } from '../../packages/offline-navigation/src/ui/GpsSignalBanner';

jest.mock('../../packages/offline-navigation/src/ui/GpsSignalBanner', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/GpsSignalBanner');
  return { ...actual, GpsSignalBanner: jest.fn(actual.GpsSignalBanner) };
});

test('binding delegates status, copy and app colours; layout matches the old weakGpsBanner', async () => {
  await render(<GpsSignalBanner status="weak" message="Weak signal." />);
  const props = (SdkBanner as jest.Mock).mock.calls.at(-1)[0];
  expect(props).toMatchObject({ status: 'weak', message: 'Weak signal.', theme: { colors: { fill: staticColors.weakGpsBackground, text: staticColors.white } } });
  const text = screen.getByText('Weak signal.');
  expect(StyleSheet.flatten(text.props.style)).toEqual({ color: staticColors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' });
  expect(StyleSheet.flatten(text.parent!.props.style)).toEqual({
    marginHorizontal: 12, marginTop: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: staticColors.weakGpsBackground,
  });
});

test.each([['lost', 'assertive'], ['weak', 'polite']] as const)('%s announces as a %s live region', async (status, region) => {
  await render(<GpsSignalBanner status={status} message="M" />);
  expect(screen.getAllByText('M')).toHaveLength(1);
  expect(screen.getByText('M').parent!.props.accessibilityLiveRegion).toBe(region);
});

test('Urdu copy wraps rather than truncating', async () => {
  const long = 'ہم آپ کو نہیں ڈھونڈ پا رہے۔ کسی کھلی جگہ پر جائیں اور تھوڑا انتظار کریں';
  await render(<GpsSignalBanner status="lost" message={long} />);
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('SDK banner renders host copy and colours with no app dependencies', async () => {
  const { GpsSignalBanner: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/GpsSignalBanner');
  await render(<Actual status="lost" message="M" theme={{ colors: { fill: '#fff', text: '#123' } }} />);
  expect(StyleSheet.flatten(screen.getByText('M').props.style).color).toBe('#123');
});
