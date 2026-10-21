/**
 * B4b-4: the Ijtema start option in DirectionsSheetParts is a binding over the single SDK card. Copy, press,
 * selected/disabled/busy states, the loading icon, RTL chevron and wrapping must survive the extraction.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { fireEvent } from '@testing-library/react-native';
import { render, screen } from './test-utils';
import { useLocaleStore } from '../i18n';
import { directionsSheetColors as c } from '../theme';
import { StartOptionCard } from '../views/components/map/DirectionsSheetParts';
import { StartOptionCard as SdkCard, type StartOptionCardTheme } from '../../packages/offline-navigation/src/ui/StartOptionCard';

jest.mock('../../packages/offline-navigation/src/ui/StartOptionCard', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/StartOptionCard');
  return { ...actual, StartOptionCard: jest.fn(actual.StartOptionCard) };
});

const icon = <Text testID="option-icon">i</Text>;

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));

test('old path delegates to the SDK card; one spoken name; press fires once', async () => {
  const onPress = jest.fn();
  await render(<StartOptionCard icon={icon} title="Use my location" subtitle="GPS" onPress={onPress} />);
  expect(SdkCard).toHaveBeenCalled();
  const card = screen.getByRole('button', { name: 'Use my location. GPS' });
  expect(card.props.accessibilityState).toMatchObject({ selected: false, disabled: false, busy: false });
  expect(screen.getByTestId('option-icon')).toBeTruthy();
  expect(StyleSheet.flatten(card.props.style)).toMatchObject({ minHeight: 72, backgroundColor: c.optionFill });
  expect((SdkCard as jest.Mock).mock.calls.at(-1)[0].theme.ForwardIcon).toBe(ChevronRight);
  await fireEvent.press(card);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('active + loading: selected/busy state, the busy icon replaces the option icon', async () => {
  await render(<StartOptionCard icon={icon} title="t" subtitle="s" active loading onPress={jest.fn()} />);
  const card = screen.getByRole('button');
  expect(card.props.accessibilityState).toMatchObject({ selected: true, busy: true });
  expect(StyleSheet.flatten(card.props.style)).toMatchObject({ backgroundColor: c.optionSelectedFill, borderColor: c.optionSelectedBorder });
  expect(screen.queryByTestId('option-icon')).toBeNull();
});

test('disabled: no press, dimmed, announced disabled', async () => {
  const onPress = jest.fn();
  await render(<StartOptionCard icon={icon} title="t" subtitle="s" disabled onPress={onPress} />);
  const card = screen.getByRole('button');
  expect(card.props.accessibilityState).toMatchObject({ disabled: true });
  expect(StyleSheet.flatten(card.props.style)).toMatchObject({ opacity: 0.6 });
  await fireEvent.press(card);
  expect(onPress).not.toHaveBeenCalled();
});

test('Urdu picks the end-edge chevron for RTL; text wraps, never truncates', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  await render(<StartOptionCard icon={icon} title="ایک بہت لمبا عنوان" subtitle="s" onPress={jest.fn()} />);
  expect((SdkCard as jest.Mock).mock.calls.at(-1)[0].theme.ForwardIcon).toBe(ChevronLeft);
  expect(screen.getByText('ایک بہت لمبا عنوان').props.numberOfLines).toBeUndefined();
});

test('SDK card renders host icons and colours without Ijtema content', async () => {
  const colors = Object.fromEntries(
    ['optionFill', 'optionBorder', 'optionSelectedFill', 'optionSelectedBorder', 'pressedFill', 'iconDisc', 'iconDiscSolid',
      'headingText', 'secondaryText', 'brand', 'brandText'].map((k) => [k, k]),
  ) as StartOptionCardTheme['colors'];
  const theme: StartOptionCardTheme = {
    ForwardIcon: ({ color }) => <Text testID="host-forward">{color}</Text>,
    LoadingIcon: ({ color }) => <Text testID="host-loading">{color}</Text>,
    colors,
  };
  const onPress = jest.fn();
  await render(<SdkCard icon={icon} title="Here" subtitle="Now" loading onPress={onPress} theme={theme} />);
  expect(screen.getByTestId('host-forward')).toHaveTextContent('secondaryText');
  expect(screen.getByTestId('host-loading')).toHaveTextContent('brand');
  expect(screen.getByText('Here')).toHaveStyle({ color: 'headingText' });
  await fireEvent.press(screen.getByRole('button', { name: 'Here. Now' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
