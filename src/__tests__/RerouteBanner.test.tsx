/**
 * B4c-3: the Ijtema reroute status banner is a binding over the SDK banner. Copy, warning colours,
 * the polite live region, Urdu wrapping and the chrome's status-slot priority must survive the extraction.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';
import { staticColors } from '../theme';
import { RerouteBanner } from '../views/components/navigation/RerouteBanner';
import { RerouteBanner as SdkBanner } from '../../packages/offline-navigation/src/ui/RerouteBanner';

jest.mock('../../packages/offline-navigation/src/ui/RerouteBanner', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/RerouteBanner');
  return { ...actual, RerouteBanner: jest.fn(actual.RerouteBanner) };
});

const flat = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

test('binding delegates the message and app warning colours; banner announces politely', async () => {
  await render(<RerouteBanner message="Keep following this route." />);
  const props = (SdkBanner as jest.Mock).mock.calls.at(-1)[0];
  expect(props.theme.colors).toEqual({ fill: staticColors.warningBackground, border: staticColors.warning, text: staticColors.warningText });
  expect(flat('Keep following this route.')).toMatchObject({ color: staticColors.warningText, fontSize: 16, fontWeight: '700', textAlign: 'center' });
  const banner = screen.getByText('Keep following this route.').parent!;
  expect(StyleSheet.flatten(banner.props.style)).toMatchObject({ backgroundColor: staticColors.warningBackground, borderColor: staticColors.warning });
  expect(banner.props.accessibilityLiveRegion).toBe('polite');
});

test('Urdu copy wraps rather than truncating', async () => {
  const long = 'راستہ تبدیل ہو گیا ہے، نئے راستے پر چلتے رہیں اور نقشہ دیکھیں';
  await render(<RerouteBanner message={long} />);
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('SDK banner renders host copy and colours with no app dependencies', async () => {
  const { RerouteBanner: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/RerouteBanner');
  await render(<Actual message="M" theme={{ colors: { fill: '#fff', border: '#f00', text: '#123' } }} />);
  expect(flat('M').color).toBe('#123');
});
