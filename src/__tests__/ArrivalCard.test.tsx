/**
 * B4c-2: the Ijtema arrival card is a binding over the SDK card. Copy, destination, Recenter/Done/back,
 * the #301 bottom inset, Urdu copy and arrival focus must survive the extraction.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { render, screen } from './test-utils';
import { useLocaleStore } from '../i18n';
import { staticColors } from '../theme';
import { ArrivalCard } from '../views/components/navigation/ArrivalCard';
import { ArrivalCard as SdkCard, type ArrivalCardTheme } from '../../packages/offline-navigation/src/ui/ArrivalCard';

jest.mock('../../packages/offline-navigation/src/ui/ArrivalCard', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/ArrivalCard');
  return { ...actual, ArrivalCard: jest.fn(actual.ArrivalCard) };
});

const lastProps = () => (SdkCard as jest.Mock).mock.calls.at(-1)[0];

beforeEach(() => { useLocaleStore.setState({ locale: 'en' }); (SdkCard as jest.Mock).mockClear(); });

test('binding delegates copy, destination, icons and colours; Recenter, Done and back fire their own callbacks once', async () => {
  const onRecenter = jest.fn();
  const onDone = jest.fn();
  await render(<ArrivalCard visible destination="Gate 5" onRecenter={onRecenter} onDone={onDone} />);
  const props = lastProps();
  expect(props.theme.PinIcon).toBe(MapPin);
  expect(props.theme.RecenterIcon).toBe(LocateFixed);
  expect(props.theme.colors.accent).toBe(staticColors.arrivalGreen);
  expect(screen.getByRole('header', { name: "You've Arrived!" })).toBeTruthy();
  expect(screen.getByText('Gate 5')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: props.labels.recenterA11y }));
  expect(onRecenter).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: props.labels.doneA11y }));
  screen.getByTestId('nav-arrival-modal').props.onRequestClose();
  expect(onDone).toHaveBeenCalledTimes(2);
  expect(onRecenter).toHaveBeenCalledTimes(1);
});

test('hidden card renders nothing; #301 bottom padding clears the inset', async () => {
  const { rerender } = await render(<ArrivalCard visible={false} destination="d" onRecenter={jest.fn()} onDone={jest.fn()} />);
  expect(screen.queryByTestId('nav-arrived-card')).toBeNull();
  await rerender(<ArrivalCard visible destination="d" onRecenter={jest.fn()} onDone={jest.fn()} />);
  expect(StyleSheet.flatten(screen.getByTestId('nav-arrived-card').props.style).paddingBottom).toBe(Math.max(36, lastProps().bottomInset + 24));
});

test('Urdu: translated copy, long destination wraps rather than truncating', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  const long = 'گیٹ نمبر پانچ کے قریب مرکزی پنڈال کا شمالی دروازہ';
  await render(<ArrivalCard visible destination={long} onRecenter={jest.fn()} onDone={jest.fn()} />);
  expect(lastProps().labels.title).not.toBe("You've Arrived!");
  expect(screen.getByRole('header', { name: lastProps().labels.title })).toBeTruthy();
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('becoming visible moves screen-reader focus to the arrival title', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined);
  await render(<ArrivalCard visible destination="d" onRecenter={jest.fn()} onDone={jest.fn()} />);
  await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus'));
  focus.mockRestore();
});

test('SDK card renders host copy, icons and colours with no app dependencies', async () => {
  const Icon = jest.fn(() => null);
  const theme: ArrivalCardTheme = {
    PinIcon: Icon, RecenterIcon: Icon, hitSlop: { top: 1, bottom: 1, left: 1, right: 1 },
    colors: { scrim: '#0008', cardFill: '#fff', title: '#111', accent: '#0a0', onAccent: '#fff', muted: '#888', secondaryFill: '#eee', secondaryText: '#00f' },
  };
  const { ArrivalCard: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/ArrivalCard');
  await render(<Actual visible destination="X" bottomInset={0} onRecenter={jest.fn()} onDone={jest.fn()} theme={theme}
    labels={{ title: 'T', subtitle: 'S', recenter: 'R', recenterA11y: 'RA', done: 'D', doneA11y: 'DA' }} />);
  expect(Icon).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('header', { name: 'T' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'DA' })).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByText('S').props.style).color).toBe('#0a0');
});
