/**
 * B4b-2: the Ijtema Route Guide card at the old path is a binding over the single SDK card. Step numbering,
 * instruction text, Previous/Next boundaries, RTL and a11y must survive the extraction.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { render, screen } from './test-utils';
import { useLocaleStore } from '../i18n';
import { RouteGuideCard } from '../views/components/map/RouteGuideCard';
import { RouteGuideCard as SdkCard, type RouteGuideCardProps } from '../../packages/offline-navigation/src/ui/RouteGuideCard';

jest.mock('../../packages/offline-navigation/src/ui/RouteGuideCard', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/ui/RouteGuideCard');
  return { ...actual, RouteGuideCard: jest.fn(actual.RouteGuideCard) };
});

const steps = [{ text: 'Walk along Rasta 1', distanceM: 120 }, { text: 'Turn at Gate 12', distanceM: 0 }, { text: 'Arrive at Block 28', distanceM: 40 }];
const cb = () => ({ onPrevious: jest.fn(), onNext: jest.fn(), onEnd: jest.fn(), onLive: jest.fn() });
const guideAt = (stepIndex: number) => ({ steps, stepIndex });

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));

test('old path delegates to the single SDK implementation', async () => {
  await render(<RouteGuideCard guide={guideAt(0)} {...cb()} />);
  expect(SdkCard).toHaveBeenCalled();
});

test('first step: numbering, instruction, distance; Previous disabled, Next enabled', async () => {
  const fns = cb();
  await render(<RouteGuideCard guide={guideAt(0)} {...fns} />);
  expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
  expect(screen.getByText('Walk along Rasta 1')).toBeOnTheScreen();
  expect(screen.getByText('120 m')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Next step' }));
  expect(fns.onNext).toHaveBeenCalledTimes(1);
  expect(fns.onPrevious).not.toHaveBeenCalled();
});

test('step changes update text; last step disables Next; zero distance hides distance', async () => {
  const fns = cb();
  const view = await render(<RouteGuideCard guide={guideAt(1)} {...fns} />);
  expect(screen.getByText('Turn at Gate 12')).toBeOnTheScreen();
  expect(screen.queryByText(/\d+ m$/)).toBeNull();
  await view.rerender(<RouteGuideCard guide={guideAt(2)} {...fns} />);
  expect(screen.getByText('Step 3 of 3')).toBeOnTheScreen();
  expect(screen.getByText('Arrive at Block 28')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Previous step' }));
  expect(fns.onPrevious).toHaveBeenCalledTimes(1);
  expect(fns.onNext).not.toHaveBeenCalled();
});

test('live and end are distinct; live omitted when the host cannot help', async () => {
  const fns = cb();
  const view = await render(<RouteGuideCard guide={guideAt(0)} {...fns} message="Location is off." />);
  expect(screen.getByText('Location is off.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Use my location to guide me' }));
  await fireEvent.press(screen.getByRole('button', { name: 'End route guide' }));
  expect(fns.onLive).toHaveBeenCalledTimes(1);
  expect(fns.onEnd).toHaveBeenCalledTimes(1);
  await view.rerender(<RouteGuideCard guide={guideAt(0)} {...fns} onLive={undefined} />);
  expect(screen.queryByRole('button', { name: 'Use my location to guide me' })).toBeNull();
});

test('Urdu: RTL direction and a localized spoken step summary', async () => {
  useLocaleStore.setState({ locale: 'ur' });
  await render(<RouteGuideCard guide={guideAt(1)} {...cb()} />);
  expect(screen.getByTestId('route-guide-card')).toHaveStyle({ direction: 'rtl' });
  expect(screen.getByLabelText(/قدم.*2.*3.*Turn at Gate 12/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'اگلا قدم' })).toBeEnabled();
});

test('SDK card renders host-supplied step, labels and theme without Ijtema content', async () => {
  const labels: RouteGuideCardProps['labels'] = {
    stepCount: (s, t) => `${s}/${t}`, stepSummary: (c, i, d) => `${c}:${i}:${d}`,
    previous: 'prev', previousStep: 'prev step', next: 'next', nextStep: 'next step',
    useLocation: 'live', acquiring: 'finding', end: 'stop',
  };
  const Icon = () => <Text>›</Text>;
  const theme: RouteGuideCardProps['theme'] = {
    Button: ({ label, accessibilityLabel, disabled, onPress }) => (
      <Pressable testID="host-button" accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>
    ),
    BackIcon: Icon, ForwardIcon: Icon, radius: 4,
    colors: { brand: 'red', brandText: 'white', headingText: 'black', secondaryText: 'gray', innerCardFill: 'pink', innerCardBorder: 'blue' },
  };
  const fns = cb();
  await render(<View><SdkCard step={{ instruction: 'go', distance: '5 ft' }} stepIndex={0} stepTotal={1}
    labels={labels} isRTL={false} theme={theme} liveBusy {...fns} /></View>);
  expect(screen.getAllByTestId('host-button')).toHaveLength(2);
  expect(screen.getByLabelText('1/1:go:5 ft')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'prev step' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'next step' })).toBeDisabled();
  expect(screen.getByText('finding')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'live' })).toBeDisabled();
  expect(screen.getByTestId('route-guide-card')).toHaveStyle({ direction: 'ltr' });
});
