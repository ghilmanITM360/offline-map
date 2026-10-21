/**
 * B4c-8: the Ijtema direct-guide gate chooser is a binding over the SDK chooser. Order, selection
 * styling, copy, colours and the app Button must survive the extraction; the chrome still owns
 * eligibility, open/close and what selecting a gate starts.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from './test-utils';
import { staticColors } from '../theme';
import { Button } from '../views/components/common/Button';
import { GateChooser } from '../views/components/navigation/GateChooser';
import { GateChooser as SdkChooser } from '../../packages/offline-navigation/src/ui/GateChooser';

jest.mock('../../packages/offline-navigation/src/ui/GateChooser', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/GateChooser');
  return { ...actual, GateChooser: jest.fn(actual.GateChooser) };
});

const gates = [{ id: 'GATE_12', label: 'Gate 12' }, { id: 'GATE_03', label: 'Gate 3' }, { id: 'GATE_07', label: 'Gate 7' }];

test('binding delegates copy, the app Button and colours; layout matches the old directGateOptions', async () => {
  await render(<GateChooser gates={gates} selectedId={null} onSelect={jest.fn()} />);
  const props = (SdkChooser as jest.Mock).mock.calls.at(-1)[0];
  expect(props).toMatchObject({
    title: 'Choose a gate',
    selectedId: null,
    options: [
      { id: 'GATE_12', label: 'Gate 12', accessibilityLabel: 'Use Gate 12' },
      { id: 'GATE_03', label: 'Gate 3', accessibilityLabel: 'Use Gate 3' },
      { id: 'GATE_07', label: 'Gate 7', accessibilityLabel: 'Use Gate 7' },
    ],
    theme: { Button, colors: { fill: staticColors.warningBackground, border: staticColors.warning, title: staticColors.warningText } },
  });
  const title = screen.getByText('Choose a gate');
  expect(StyleSheet.flatten(title.props.style)).toEqual({ color: staticColors.warningText, fontSize: 16, fontWeight: '700' });
  expect(StyleSheet.flatten(title.parent!.props.style)).toEqual({
    marginHorizontal: 12, padding: 12, gap: 8, borderRadius: 10, borderWidth: 1,
    borderColor: staticColors.warning, backgroundColor: staticColors.warningBackground, zIndex: 12,
  });
});

test('keeps host order, marks only the selected gate, and reports the pressed id', async () => {
  const onSelect = jest.fn();
  const user = userEvent.setup();
  await render(<GateChooser gates={gates} selectedId="GATE_03" onSelect={onSelect} />);
  expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Use Gate 12', 'Use Gate 3', 'Use Gate 7']);
  const fills = screen.getAllByRole('button').map((b) => StyleSheet.flatten(b.props.style).backgroundColor);
  expect(fills).toEqual(['transparent', staticColors.infoBackground, 'transparent']);
  await user.press(screen.getByRole('button', { name: 'Use Gate 7' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith('GATE_07');
});

test('large 52dp touch targets and no truncation of long Urdu names', async () => {
  const long = 'گیٹ نمبر 12 — مرکزی داخلی راستہ';
  await render(<GateChooser gates={[{ id: 'GATE_12', label: long }]} selectedId={null} onSelect={jest.fn()} />);
  expect(StyleSheet.flatten(screen.getByRole('button').props.style).minHeight).toBe(52);
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
});

test('SDK chooser: host Button and copy, disabled options do not fire, no app dependencies', async () => {
  const { GateChooser: Actual } = jest.requireActual('../../packages/offline-navigation/src/ui/GateChooser');
  const onSelect = jest.fn();
  const user = userEvent.setup();
  await render(<Actual title="T" selectedId={null} onSelect={onSelect}
    options={[{ id: 'a', label: 'A', accessibilityLabel: 'Use A', disabled: true }, { id: 'b', label: 'B', accessibilityLabel: 'Use B' }]}
    theme={{ Button, colors: { fill: '#fff', border: '#000', title: '#123' } }} />);
  expect(StyleSheet.flatten(screen.getByText('T').props.style).color).toBe('#123');
  expect(screen.getByRole('button', { name: 'Use A' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Use A' }));
  await user.press(screen.getByRole('button', { name: 'Use B' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith('b');
});

test('empty gate list renders only the heading', async () => {
  await render(<GateChooser gates={[]} selectedId={null} onSelect={jest.fn()} />);
  expect(screen.getByText('Choose a gate')).toBeTruthy();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
