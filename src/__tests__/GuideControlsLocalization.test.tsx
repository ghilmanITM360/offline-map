import React from 'react';
import { RouteGuideCard } from '../views/components/map/RouteGuideCard';
import { DirectionsHeader } from '../views/components/map/DirectionsSheetParts';
import { useLocaleStore } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { act, render, screen, userEvent } from './test-utils';

const guide = { steps: [{ text: 'Block 28', distanceM: 0 }, { text: 'Gate 12', distanceM: 0 }], stepIndex: 1 };
const previous = jest.fn();
const end = jest.fn();
const back = jest.fn();
const renderGuide = () => render(<><RouteGuideCard guide={guide} onPrevious={previous} onNext={jest.fn()} onLive={jest.fn()} onEnd={end} /><DirectionsHeader title="Block 28" subtitle="Gate 12" onBack={back} /></>);
beforeEach(() => {
  jest.clearAllMocks();
  useLocaleStore.setState({ locale: 'en' });
  useAppStore.setState({ routeGuide: guide });
});
afterEach(() => useLocaleStore.setState({ locale: 'en' }));

test('Urdu controls and spoken step count update without replacing guide or progress', async () => {
  await renderGuide();
  expect(screen.getByText('Step 2 of 2')).toBeVisible();
  await act(() => useLocaleStore.setState({ locale: 'ur' }));
  expect(screen.getByRole('button', { name: 'پچھلا قدم' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'اگلا قدم' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'روٹ گائیڈ ختم کریں' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'واپس' })).toBeVisible();
  expect(screen.getByTestId('route-guide-card')).toHaveStyle({ direction: 'rtl' });
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(useAppStore.getState().routeGuide?.stepIndex).toBe(1);
  expect(screen.getByLabelText(/قدم.*2.*2.*Gate 12/)).toBeVisible();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'پچھلا قدم' }));
  await user.press(screen.getByRole('button', { name: 'روٹ گائیڈ ختم کریں' }));
  await user.press(screen.getByRole('button', { name: 'واپس' }));
  expect(previous).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledTimes(1);
  expect(back).toHaveBeenCalledTimes(1);
});

test('Roman Urdu remains LTR and acquisition label is truthful', async () => {
  useLocaleStore.setState({ locale: 'ur-Latn' });
  await render(<RouteGuideCard guide={guide} onPrevious={previous} onNext={jest.fn()} onLive={jest.fn()} onEnd={end} liveBusy />);
  expect(screen.getByTestId('route-guide-card')).toHaveStyle({ direction: 'ltr' });
  expect(screen.getByRole('button', { name: 'Pichla qadam' })).toBeVisible();
  expect(screen.getByText('Aap ki location talash ho rahi hai…')).toBeVisible();
});
