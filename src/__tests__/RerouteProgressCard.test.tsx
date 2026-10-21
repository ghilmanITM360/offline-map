/**
 * B4c-4: the Ijtema "Finding a new way…" card is a binding over the SDK card. The shared turn-card
 * base style stays host-owned and is injected; copy, colours, icon, RTL wrapping and the chrome's
 * pending-outranks-turn-card priority must survive the extraction.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';
import { staticColors } from '../theme';
import { navOverlayStyles } from '../views/components/navigation/navOverlayStyles';
import { RerouteProgressCard } from '../views/components/navigation/RerouteProgressCard';
import { RerouteProgressCard as SdkCard } from '../../packages/offline-navigation/src/ui/RerouteProgressCard';

jest.mock('../../packages/offline-navigation/src/ui/RerouteProgressCard', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/RerouteProgressCard');
  return { ...actual, RerouteProgressCard: jest.fn(actual.RerouteProgressCard) };
});

const flat = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

test('binding injects the shared turn-card style, reroute colours and icon', async () => {
  await render(<RerouteProgressCard label="Finding a new way…" />);
  const props = (SdkCard as jest.Mock).mock.calls.at(-1)[0];
  expect(props.cardStyle).toBe(navOverlayStyles.instructionCard);
  expect(props.theme.colors).toEqual({ fill: staticColors.rerouteBackground, text: staticColors.white });
  expect(props.icon.props).toMatchObject({ size: 28, color: staticColors.white });
  expect(flat('Finding a new way…')).toMatchObject({ color: staticColors.white, fontSize: 18, fontWeight: 'bold' });
  const card = StyleSheet.flatten(screen.getByText('Finding a new way…').parent!.props.style);
  // Turn-card base survives (radius, padding, row, elevation); only fill, alignment and gap are overridden.
  expect(card).toMatchObject({
    ...StyleSheet.flatten(navOverlayStyles.instructionCard),
    backgroundColor: staticColors.rerouteBackground, justifyContent: 'center', gap: 12,
  });
});

test('extraction leaves the shared turn-card style untouched', () => {
  expect(StyleSheet.flatten(navOverlayStyles.instructionCard)).toMatchObject({
    backgroundColor: staticColors.infoStrong, paddingHorizontal: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center',
  });
});

test('Urdu copy wraps rather than truncating', async () => {
  const long = 'نیا راستہ تلاش کیا جا رہا ہے، براہ کرم انتظار کریں';
  await render(<RerouteProgressCard label={long} />);
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('SDK card renders host copy, icon and style with no app dependencies', async () => {
  const { RerouteProgressCard: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/RerouteProgressCard');
  const { Text } = jest.requireActual('react-native');
  await render(<Actual label="L" icon={<Text>i</Text>} cardStyle={{ paddingTop: 7 }} theme={{ colors: { fill: '#000', text: '#123' } }} />);
  expect(flat('L').color).toBe('#123');
  expect(screen.getByText('i')).toBeOnTheScreen();
  expect(StyleSheet.flatten(screen.getByText('L').parent!.props.style)).toMatchObject({ paddingTop: 7, backgroundColor: '#000' });
});
