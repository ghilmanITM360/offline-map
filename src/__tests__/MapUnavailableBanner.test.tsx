/**
 * B4c-6: the Ijtema basemap-unavailable banner is a binding over the SDK banner. Copy, colours, the
 * polite live region, Urdu wrapping and the chrome's status-slot priority must survive the extraction.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';
import { staticColors } from '../theme';
import { MapUnavailableBanner } from '../views/components/navigation/MapUnavailableBanner';
import { MapUnavailableBanner as SdkBanner } from '../../packages/offline-navigation/src/ui/MapUnavailableBanner';

jest.mock('../../packages/offline-navigation/src/ui/MapUnavailableBanner', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/MapUnavailableBanner');
  return { ...actual, MapUnavailableBanner: jest.fn(actual.MapUnavailableBanner) };
});

test('binding delegates copy and app colours; layout matches the old mapUnavailableBanner', async () => {
  await render(<MapUnavailableBanner message="No map." />);
  const props = (SdkBanner as jest.Mock).mock.calls.at(-1)[0];
  expect(props).toMatchObject({
    message: 'No map.',
    theme: { colors: { fill: staticColors.bannerTranslucentWhite, border: staticColors.border, text: staticColors.iconMuted } },
  });
  const text = screen.getByText('No map.');
  expect(StyleSheet.flatten(text.props.style)).toEqual({ color: staticColors.iconMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 });
  expect(StyleSheet.flatten(text.parent!.props.style)).toEqual({
    marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: staticColors.bannerTranslucentWhite, borderWidth: 1, borderColor: staticColors.border,
  });
});

test('announces once as a polite live region', async () => {
  await render(<MapUnavailableBanner message="M" />);
  expect(screen.getAllByText('M')).toHaveLength(1);
  expect(screen.getByText('M').parent!.props.accessibilityLiveRegion).toBe('polite');
});

test('Urdu copy wraps rather than truncating', async () => {
  const long = 'نقشہ نہیں دکھایا جا سکتا۔ ہدایات پھر بھی کام کرتی ہیں۔';
  await render(<MapUnavailableBanner message={long} />);
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('SDK banner renders host copy and colours with no app dependencies', async () => {
  const { MapUnavailableBanner: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/MapUnavailableBanner');
  await render(<Actual message="M" theme={{ colors: { fill: '#fff', border: '#000', text: '#123' } }} />);
  expect(StyleSheet.flatten(screen.getByText('M').props.style).color).toBe('#123');
});
