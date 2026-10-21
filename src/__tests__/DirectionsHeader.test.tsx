/**
 * B4b-3: the Ijtema header in DirectionsSheetParts is a binding over the single SDK header. Copy, Back, RTL,
 * the spoken destination context, focus and title wrapping must survive the extraction.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { act, render, screen, waitFor } from './test-utils';
import { useLocaleStore } from '../i18n';
import { DirectionsHeader } from '../views/components/map/DirectionsSheetParts';
import { DirectionsHeader as SdkHeader, type DirectionsHeaderTheme } from '../../packages/offline-navigation/src/ui/DirectionsHeader';

jest.mock('../../packages/offline-navigation/src/ui/DirectionsHeader', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/DirectionsHeader');
  return { ...actual, DirectionsHeader: jest.fn(actual.DirectionsHeader) };
});

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));

test('old path delegates to the SDK header with Ijtema copy; Back fires once', async () => {
  const onBack = jest.fn();
  await render(<DirectionsHeader title="Get directions" subtitle="Pick a start" onBack={onBack} />);
  expect(SdkHeader).toHaveBeenCalled();
  expect(screen.getByRole('header')).toHaveTextContent('Get directions');
  expect(screen.getByText('Pick a start')).toBeTruthy();
  expect(screen.getByTestId('directions-header')).toHaveStyle({ direction: 'ltr' });
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('title + destination context are spoken together; no context leaves the visible title', async () => {
  const view = await render(<DirectionsHeader title="Route guide" subtitle="s" onBack={jest.fn()} accessibilityContext="Block 28. Step 1" />);
  expect(screen.getByRole('header', { name: 'Route guide. Block 28. Step 1' })).toBeTruthy();
  await view.rerender(<DirectionsHeader title="Route guide" subtitle="s" onBack={jest.fn()} />);
  expect(screen.getByRole('header').props.accessibilityLabel).toBeUndefined();
});

test('Urdu is RTL with a localized Back and a 48dp target; title wraps, never truncates', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  await render(<DirectionsHeader title="ایک بہت لمبا عنوان" subtitle="s" onBack={jest.fn()} />);
  expect(screen.getByTestId('directions-header')).toHaveStyle({ direction: 'rtl' });
  const back = screen.getByRole('button', { name: 'واپس' });
  expect(StyleSheet.flatten(back.props.style)).toMatchObject({ width: 48, height: 48 });
  expect(screen.getByRole('header').props.numberOfLines).toBeUndefined();
});

test('focus moves when the key changes, not on a locale change or with a null key', async () => {
  const nextFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  await nextFrame();
  focus.mockClear();
  const view = await render(<DirectionsHeader title="t" subtitle="s" onBack={jest.fn()} focusKey="a" />);
  await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
  await act(() => useLocaleStore.setState({ locale: 'ur' }));
  await view.rerender(<DirectionsHeader title="t" subtitle="s" onBack={jest.fn()} focusKey={null} />);
  await nextFrame();
  expect(focus).toHaveBeenCalledTimes(1);
  await view.rerender(<DirectionsHeader title="t" subtitle="s" onBack={jest.fn()} focusKey="b" />);
  await waitFor(() => expect(focus).toHaveBeenCalledTimes(2));
  focus.mockRestore();
});

test('SDK header renders host labels, icon and colours without Ijtema content', async () => {
  const theme: DirectionsHeaderTheme = {
    BackIcon: ({ color }) => <Text testID="host-back">{color}</Text>,
    colors: { headingText: 'red', secondaryText: 'gray', backButtonFill: 'blue' },
  };
  const onBack = jest.fn();
  await render(<SdkHeader title="T" subtitle="S" onBack={onBack} backLabel="Retour" isRTL theme={theme} />);
  expect(screen.getByTestId('host-back')).toHaveTextContent('red');
  expect(screen.getByTestId('directions-header')).toHaveStyle({ direction: 'rtl' });
  expect(screen.getByRole('header')).toHaveStyle({ color: 'red' });
  await fireEvent.press(screen.getByRole('button', { name: 'Retour' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
