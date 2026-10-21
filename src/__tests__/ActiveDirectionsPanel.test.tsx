/**
 * B4c-1: the Ijtema active-directions panel is a binding over the SDK step list. Order, the current step,
 * close, empty state, RTL, wrapping, spoken names and stable keys must survive the extraction.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fireEvent } from '@testing-library/react-native';
import { render, screen } from './test-utils';
import { useLocaleStore } from '../i18n';
import { localizeInstruction } from '../i18n/instructions';
import { staticColors } from '../theme';
import type { V2NavigationInstruction } from '../models/types';
import { ActiveDirectionsPanel } from '../views/components/navigation/ActiveDirectionsPanel';
import {
  ActiveDirectionsPanel as SdkPanel,
  type ActiveDirectionsPanelTheme,
} from '../../packages/offline-navigation/src/ui/ActiveDirectionsPanel';

jest.mock('../../packages/offline-navigation/src/ui/ActiveDirectionsPanel', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/ActiveDirectionsPanel');
  return { ...actual, ActiveDirectionsPanel: jest.fn(actual.ActiveDirectionsPanel) };
});

const step = (id: string, type: V2NavigationInstruction['type'], distanceMeters: number) =>
  ({ id, type, distanceM: distanceMeters, text: id }) as unknown as V2NavigationInstruction;
const instructions = [step('a', 'straight', 40), step('b', 'left', 20), step('c', 'arrival', 0)];
const lastProps = () => (SdkPanel as jest.Mock).mock.calls.at(-1)[0];

beforeEach(() => { useLocaleStore.setState({ locale: 'en' }); (SdkPanel as jest.Mock).mockClear(); });

test('binding delegates with localized steps in order, stable keys, app theme and copy; close fires once', async () => {
  const onClose = jest.fn();
  await render(<ActiveDirectionsPanel visible destination="Gate 5" instructions={instructions} currentStepIndex={1} onClose={onClose} />);
  const props = lastProps();
  expect(props.steps).toEqual(instructions.map((s, i) => ({ key: `${s.id}:${i}`, text: localizeInstruction(s) })));
  expect(props.theme.Container).toBe(SafeAreaView);
  expect(props.theme.colors.currentAccent).toBe(staticColors.routeInside);
  expect(props.isRTL).toBe(false);
  expect(screen.getByRole('header', { name: 'Directions' })).toBeTruthy();
  expect(screen.getByText('Gate 5')).toBeTruthy();
  const texts = instructions.map(s => localizeInstruction(s));
  const rendered = screen.getAllByText(/./).map(n => n.props.children).filter(c => texts.includes(c));
  expect(rendered).toEqual(texts);
  await fireEvent.press(screen.getByRole('button', { name: 'Close directions' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('only the current step is selected, labelled and accented; moving the index moves it', async () => {
  const props = { visible: true, destination: 'd', instructions, onClose: jest.fn() };
  const { rerender } = await render(<ActiveDirectionsPanel {...props} currentStepIndex={0} />);
  const rows = () => instructions.map(s => screen.getByText(localizeInstruction(s)).parent!);
  const selected = () => rows().filter(r => r.props.accessibilityState?.selected === true);
  expect(selected()).toHaveLength(1);
  expect(screen.getAllByText('Current step')).toHaveLength(1);
  expect(StyleSheet.flatten(selected()[0].props.style)).toMatchObject({ borderColor: staticColors.routeInside, borderWidth: 2 });
  await rerender(<ActiveDirectionsPanel {...props} currentStepIndex={2} />);
  expect(selected()).toHaveLength(1);
  expect(selected()[0]).toHaveTextContent(new RegExp(localizeInstruction(instructions[2])));
});

test('empty and single-step lists', async () => {
  const props = { visible: true, destination: 'd', currentStepIndex: 0, onClose: jest.fn() };
  const { rerender } = await render(<ActiveDirectionsPanel {...props} instructions={[]} />);
  expect(screen.getByText(/Step-by-step directions are unavailable/)).toBeTruthy();
  expect(screen.queryByText('Current step')).toBeNull();
  await rerender(<ActiveDirectionsPanel {...props} instructions={[instructions[0]]} />);
  expect(screen.getAllByText('Current step')).toHaveLength(1);
  expect(screen.getByText(localizeInstruction(instructions[0]))).toBeTruthy();
});

test('Urdu: RTL text direction, translated copy and spoken names, wrapping not truncated', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  await render(<ActiveDirectionsPanel visible destination="گیٹ" instructions={instructions} currentStepIndex={0} onClose={jest.fn()} />);
  expect(lastProps().isRTL).toBe(true);
  const close = screen.getByRole('button', { name: 'ہدایات بند کریں' });
  expect(close).toBeTruthy();
  const stepText = screen.getByText(localizeInstruction(instructions[0], 'ur'));
  expect(StyleSheet.flatten(stepText.props.style)).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
  expect(stepText.props.numberOfLines).toBeUndefined();
});

test('SDK panel renders host copy with a host container and no app dependencies', async () => {
  const Container = jest.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>);
  const theme: ActiveDirectionsPanelTheme = {
    Container,
    colors: { panelFill: '#fff', text: '#111', closeFill: '#eee', stepBorder: '#ccc', currentAccent: '#0a0' },
  };
  const { ActiveDirectionsPanel: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/ActiveDirectionsPanel');
  await render(<Actual visible destination="X" steps={[{ key: 'k', text: 'Go' }]} currentStepIndex={0} isRTL={false}
    labels={{ title: 'T', close: 'C', noSteps: 'N', currentStep: 'Now' }} onClose={jest.fn()} theme={theme} />);
  expect(Container).toHaveBeenCalled();
  expect(screen.getByRole('header', { name: 'T' })).toBeTruthy();
  expect(screen.getByText('Now')).toBeTruthy();
  expect(screen.getByText('Go')).toBeTruthy();
});
