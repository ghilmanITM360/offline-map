/**
 * B4b-5: the Ijtema FROM/TO summary in DirectionsSheetParts is a binding over the single SDK rows. Order, copy,
 * per-row press, spoken names, RTL chevron, wrapping and the 56dp rows must survive the extraction.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { fireEvent } from '@testing-library/react-native';
import { render, screen } from './test-utils';
import { useLocaleStore } from '../i18n';
import { directionsSheetColors as c } from '../theme';
import { RouteEndpointRows, type EndpointRow } from '../views/components/map/DirectionsSheetParts';
import { RouteEndpointRows as SdkRows, type RouteEndpointRowsTheme } from '../../packages/offline-navigation/src/ui/RouteEndpointRows';

jest.mock('../../packages/offline-navigation/src/ui/RouteEndpointRows', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/RouteEndpointRows');
  return { ...actual, RouteEndpointRows: jest.fn(actual.RouteEndpointRows) };
});

const row = (label: string, name: string, detail?: string): EndpointRow => ({
  label,
  name,
  detail,
  icon: <Text testID={`${label}-icon`}>i</Text>,
  actionAccessibilityLabel: `${label} ${name}. Change`,
  onAction: jest.fn(),
});

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));

test('old path delegates to the SDK rows; FROM before TO; each row fires only its own action', async () => {
  const from = row('From', 'My location', 'GPS');
  const to = row('To', 'Block 28');
  await render(<RouteEndpointRows from={from} to={to}><Text>warning</Text></RouteEndpointRows>);
  expect(SdkRows).toHaveBeenCalled();
  expect((SdkRows as jest.Mock).mock.calls.at(-1)[0].theme.ForwardIcon).toBe(ChevronRight);
  const [first, second] = screen.getAllByRole('button');
  expect(first.props.accessibilityLabel).toBe('From My location. Change');
  expect(second.props.accessibilityLabel).toBe('To Block 28. Change');
  expect(StyleSheet.flatten(first.props.style)).toMatchObject({ minHeight: 56 });
  expect(StyleSheet.flatten(first.parent?.props.style)).toMatchObject({ backgroundColor: c.background, borderColor: c.cardBorder });
  expect(screen.getByText('GPS')).toBeTruthy();
  expect(screen.getByText('warning')).toBeTruthy();
  await fireEvent.press(second);
  expect(to.onAction).toHaveBeenCalledTimes(1);
  expect(from.onAction).not.toHaveBeenCalled();
});

test('the detail line is optional; names use the heading colour', async () => {
  const view = await render(<RouteEndpointRows from={row('From', 'A')} to={row('To', 'B', 'Hall')} />);
  expect(screen.getByText('Hall')).toBeTruthy();
  expect(screen.getByText('B')).toHaveStyle({ color: c.headingText });
  await view.rerender(<RouteEndpointRows from={row('From', 'A')} to={row('To', 'B')} />);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByText('Hall')).toBeNull();
});

test('Urdu picks the end-edge chevron for RTL; names wrap, never truncate', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  await render(<RouteEndpointRows from={row('From', 'ایک بہت لمبا نام')} to={row('To', 'B')} />);
  expect((SdkRows as jest.Mock).mock.calls.at(-1)[0].theme.ForwardIcon).toBe(ChevronLeft);
  expect(screen.getByText('ایک بہت لمبا نام').props.numberOfLines).toBeUndefined();
});

test('SDK rows render host copy, icons and colours without Ijtema content', async () => {
  const theme: RouteEndpointRowsTheme = {
    ForwardIcon: ({ color }) => <Text testID="host-forward">{color}</Text>,
    colors: { cardBorder: 'b', cardFill: 'f', iconDisc: 'd', headingText: 'h', secondaryText: 's', pressedFill: 'p' },
  };
  const from = row('Départ', 'Ici');
  await render(<SdkRows from={from} to={row('Arrivée', 'Là')} theme={theme} />);
  expect(screen.getAllByTestId('host-forward')[0]).toHaveTextContent('s');
  expect(screen.getByText('Ici')).toHaveStyle({ color: 'h' });
  await fireEvent.press(screen.getByRole('button', { name: 'Départ Ici. Change' }));
  expect(from.onAction).toHaveBeenCalledTimes(1);
});
