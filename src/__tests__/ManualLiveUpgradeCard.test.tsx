/**
 * B4b-1: the Ijtema card at the old path is a binding over the single SDK card. Copy, RTL, a11y and the
 * distinct confirm/cancel/start/recover callbacks must survive the extraction.
 */
import React from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { act, render, screen, waitFor } from './test-utils';
import { useLocaleStore } from '../i18n';
import { ManualLiveUpgradeCard } from '../views/components/map/ManualLiveUpgradeCard';
import * as legacyFocus from '../views/hooks/useAccessibilityFocus';
import * as sdkFocus from '../../packages/offline-navigation/src/ui/useAccessibilityFocus';
import { ManualLiveUpgradeCard as SdkCard, type ManualLiveUpgradeCardProps } from '../../packages/offline-navigation/src/ui/ManualLiveUpgradeCard';
import type { ManualLiveUpgrade } from '../viewmodels/useManualLiveUpgrade';

jest.mock('../../packages/offline-navigation/src/ui/ManualLiveUpgradeCard', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/ManualLiveUpgradeCard');
  return { ...actual, ManualLiveUpgradeCard: jest.fn(actual.ManualLiveUpgradeCard) };
});

const preview: ManualLiveUpgrade = { phase: 'preview', token: 1, coordinate: { latitude: 0, longitude: 0 } as never, route: { estimatedTimeMin: 7, totalDistance: 420 } as never };
const cb = () => ({ onConfirm: jest.fn(), onCancel: jest.fn(), onStart: jest.fn(), onRecover: jest.fn() });
const show = async (upgrade: ManualLiveUpgrade, extra: Partial<React.ComponentProps<typeof ManualLiveUpgradeCard>> = {}) => {
  const fns = cb();
  await render(<ManualLiveUpgradeCard upgrade={upgrade} destination="Block 7" {...fns} {...extra} />);
  return fns;
};

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));

test('old paths delegate to the single SDK implementation', async () => {
  expect(legacyFocus.useAccessibilityFocus).toBe(sdkFocus.useAccessibilityFocus);
  await show({ phase: 'confirming' });
  expect(SdkCard).toHaveBeenCalled();
});

test('idle renders nothing', async () => {
  await show({ phase: 'idle' });
  expect(screen.queryByRole('header')).toBeNull();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

test('confirming: continue and cancel are distinct actions', async () => {
  const fns = await show({ phase: 'confirming' });
  expect(screen.getByRole('header')).toHaveTextContent('Switch to live navigation?');
  await fireEvent.press(screen.getByText('Continue with location'));
  expect(fns.onConfirm).toHaveBeenCalledTimes(1);
  expect(fns.onCancel).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Keep route guide'));
  expect(fns.onCancel).toHaveBeenCalledTimes(1);
  expect(fns.onConfirm).toHaveBeenCalledTimes(1);
});

test.each(['acquiring', 'routing'] as const)('%s is busy: spinner, no confirm, cancel still available', async (phase) => {
  const fns = await show({ phase });
  const title = phase === 'acquiring' ? 'Finding your location…' : 'Preparing live route…';
  expect(screen.getByLabelText(title)).toBeOnTheScreen();
  expect(screen.queryByText('Continue with location')).toBeNull();
  expect(screen.queryByText('Start live navigation')).toBeNull();
  await fireEvent.press(screen.getByText('Keep route guide'));
  expect(fns.onCancel).toHaveBeenCalledTimes(1);
  expect(fns.onConfirm).not.toHaveBeenCalled();
});

test('failed: retry confirms, optional recovery is its own action', async () => {
  const fns = await show({ phase: 'failed', message: 'x' }, { recoveryLabel: 'Pick start manually' });
  expect(screen.queryByLabelText(/./)).toBeNull();
  await fireEvent.press(screen.getByText('Try location again'));
  await fireEvent.press(screen.getByText('Pick start manually'));
  expect(fns.onConfirm).toHaveBeenCalledTimes(1);
  expect(fns.onRecover).toHaveBeenCalledTimes(1);
  expect(fns.onCancel).not.toHaveBeenCalled();
});

test('failed without recoveryLabel hides recovery', async () => {
  await show({ phase: 'failed', message: 'x' });
  expect(screen.getAllByRole('button')).toHaveLength(2);
});

test('preview: destination + summary; start is distinct from confirm', async () => {
  const fns = await show(preview);
  expect(screen.getByText('From your verified location to Block 7')).toBeTruthy();
  expect(screen.getByText('7 min · 420 m')).toBeTruthy();
  expect(screen.queryByText('Continue with location')).toBeNull();
  await fireEvent.press(screen.getByText('Start live navigation'));
  expect(fns.onStart).toHaveBeenCalledTimes(1);
  expect(fns.onConfirm).not.toHaveBeenCalled();
});

test('Urdu is RTL with header + live region preserved', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  await show({ phase: 'confirming' });
  const header = screen.getByRole('header');
  expect(header.props.accessibilityLiveRegion).toBe('polite');
  const style = StyleSheet.flatten(header.props.style);
  expect(style).toMatchObject({ textAlign: 'right', writingDirection: 'rtl', fontWeight: '700' });
  expect(header).not.toHaveTextContent('Switch to live navigation?');
});

test('SDK card renders host-supplied copy and design system without Ijtema content', async () => {
  const labels: ManualLiveUpgradeCardProps['labels'] = {
    confirm: 'C?', acquiring: 'A', routing: 'R', preview: 'P', failed: 'F', preserved: 'kept',
    start: 'go', continue: 'ok', retry: 'again', cancel: 'no',
    destination: (d) => `to ${d}`, summary: (m, d) => `${m}/${d}`,
  };
  const theme: ManualLiveUpgradeCardProps['theme'] = {
    Card: ({ children }) => <View testID="host-card">{children}</View>,
    Button: ({ label, onPress }) => <Pressable accessibilityRole="button" onPress={onPress}><Text>{label}</Text></Pressable>,
    text: { color: 'red' }, spinnerColor: 'blue', gap: 4,
  };
  const fns = cb();
  await render(<SdkCard upgrade={{ phase: 'preview', route: { estimatedTimeMin: 3, totalDistance: 9 } }} destination="X" labels={labels} isRTL={false} theme={theme} {...fns} />);
  expect(screen.getByTestId('host-card')).toBeTruthy();
  expect(screen.getByText('to X')).toBeTruthy();
  expect(screen.getByText('3/9')).toBeTruthy();
  await fireEvent.press(screen.getByText('go'));
  await fireEvent.press(screen.getByText('no'));
  expect(fns.onStart).toHaveBeenCalledTimes(1);
  expect(fns.onCancel).toHaveBeenCalledTimes(1);
});

test('focus moves once per phase, never on a locale change', async () => {
  const nextFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  await nextFrame(); // drain frames queued by earlier tests
  focus.mockClear();
  const fns = cb();
  const view = await render(<ManualLiveUpgradeCard upgrade={{ phase: 'confirming' }} destination="B" {...fns} />);
  await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
  await act(() => useLocaleStore.setState({ locale: 'ur' }));
  await nextFrame();
  expect(focus).toHaveBeenCalledTimes(1);
  await view.rerender(<ManualLiveUpgradeCard upgrade={{ phase: 'acquiring' }} destination="B" {...fns} />);
  await waitFor(() => expect(focus).toHaveBeenCalledTimes(2));
  focus.mockRestore();
});
