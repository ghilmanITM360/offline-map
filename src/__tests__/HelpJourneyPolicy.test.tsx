import React from 'react';
import { Alert } from 'react-native';
import { AppGuideScreen } from '../views/screens/AppGuideScreen';
import { HelpScreen } from '../views/screens/HelpScreen';
import { useLocaleStore } from '../i18n';
import { render, screen, userEvent } from './test-utils';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
beforeEach(() => useLocaleStore.setState({ locale: 'en' }));

test('App Guide explains automatic fresh-location destination path and separately confirmed upgrade', async () => {
  await render(<AppGuideScreen />);
  expect(screen.getByText(/automatically/i)).toBeVisible();
  expect(screen.getByText(/confirmation.*preview.*Start/i)).toBeVisible();
  expect(JSON.stringify(screen.toJSON())).not.toContain('nearest gate');
  expect(screen.getByText(/Block 2.*preview.*confirm/i)).toBeVisible();
});

test('Help distinguishes manual guide steps from GPS tracking', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<HelpScreen />);
  // Expand the actual FAQ before examining the attendee-facing text.
  const user = userEvent.setup();
  await user.press(screen.getByText('How do directions work?'));
  expect(alert.mock.calls[0]?.[1]).toMatch(/manual.*does not track/i);
  alert.mockRestore();
});
