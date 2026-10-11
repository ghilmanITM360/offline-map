/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// App shell copy (Settings, Drawer, Help, App Guide, About, Welcome/Splash, error screen, exit confirmation and the
// location messages) reads in Roman Urdu and Urdu, with no English leaking through.

import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { act, render, renderHook, screen } from './test-utils';

import { useLocaleStore } from '../i18n';
import { AboutScreen } from '../views/screens/AboutScreen';
import { AppGuideScreen } from '../views/screens/AppGuideScreen';
import { HelpScreen } from '../views/screens/HelpScreen';
import { SettingsScreen } from '../views/screens/SettingsScreen';
import { WelcomeScreen } from '../views/screens/WelcomeScreen';
import { SplashScreen } from '../views/screens/SplashScreen';
import { CustomDrawer } from '../views/components/CustomDrawer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LocationAccessService } from '../services/LocationAccessService';
import { useNavigationExitConfirmation } from '../viewmodels/useNavigationExitConfirmation';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation, useRoute: () => ({ params: undefined }) };
});
jest.mock('@react-navigation/drawer', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { DrawerContentScrollView: ScrollView };
});
jest.mock('expo-updates', () => ({ reloadAsync: jest.fn() }));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied', canAskAgain: true }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied', canAskAgain: true }),
  hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  jest.restoreAllMocks();
});

const english = (...phrases: string[]) => {
  const all = JSON.stringify(screen.toJSON());
  for (const phrase of phrases) expect(all).not.toContain(phrase);
};

describe('Settings', () => {
  test('Urdu: copy is Urdu, section titles keep their letters joined, language names stay as they are', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<SettingsScreen />);

    expect(screen.getByText('ترتیبات')).toBeOnTheScreen();
    expect(screen.getByText('آواز کی ہدایات')).toBeOnTheScreen();
    expect(screen.getByText('فاصلے کی اکائی')).toBeOnTheScreen();
    expect(screen.getByText('میٹر')).toBeOnTheScreen();
    expect(screen.getByText(/^ورژن\s\u2068?1\.0\.0/)).toBeOnTheScreen();
    // Language rows are autonyms, never translated.
    expect(screen.getByText('English')).toBeOnTheScreen();
    expect(screen.getByText('Roman Urdu')).toBeOnTheScreen();
    expect(screen.getByText('اردو')).toBeOnTheScreen();
    // letterSpacing breaks Arabic-script joining.
    expect(StyleSheet.flatten(screen.getByText('رازداری').props.style).letterSpacing).toBe(0);
    // Row label + hint are joined with the Urdu comma.
    expect(screen.getByRole('switch', { name: /آواز کی ہدایات.*،.*ہر موڑ آواز میں بتاتا ہے/ })).toBeTruthy();
    english('Voice Instructions', 'Distance Unit', 'Privacy', 'Clear Recent Searches', 'Version 1', 'pilgrims', 'Manage');
  });

  test('Roman Urdu: copy is Roman Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    await render(<SettingsScreen />);

    expect(screen.getByText('Tarteebat')).toBeOnTheScreen();
    expect(screen.getByText('Awaaz ki hidayat')).toBeOnTheScreen();
    expect(screen.getByText('Faasle ki ikai')).toBeOnTheScreen();
    expect(screen.getByText('Meter')).toBeOnTheScreen();
    english('Voice Instructions', 'Distance Unit', 'Clear Recent Searches', 'Speaks each turn aloud', 'pilgrims');
  });

  test('English keeps its small-caps letter spacing', async () => {
    await render(<SettingsScreen />);
    expect(StyleSheet.flatten(screen.getByText('Privacy').props.style).letterSpacing).toBe(1);
  });

  test('the clear-data confirmation is localized, including its buttons', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: /حالیہ تلاشیں صاف کریں/ }));

    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string }[]];
    expect(title).toBe('حالیہ تلاشیں صاف کریں؟');
    expect(message).toContain('فہرست');
    expect(buttons.map((b) => b.text)).toEqual(['منسوخ کریں', 'صاف کریں']);
  });
});

describe('Help and App Guide', () => {
  test('Help in Urdu: rows, emergency contacts and the FAQ dialog are Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<HelpScreen />);

    expect(screen.getByText('مدد اور معاونت')).toBeOnTheScreen();
    expect(screen.getByText('ہنگامی رابطے')).toBeOnTheScreen();
    expect(screen.getByText('ریسکیو 1122')).toBeOnTheScreen();
    expect(screen.getAllByText(/ملائیں/).length).toBe(3);
    english('Common Questions', 'Emergency Contacts', 'Dial ', 'Official Website', 'smooth journey');

    fireEvent.press(screen.getByRole('button', { name: /اپنا بلاک تلاش کرنا/ }));
    const [title, body, buttons] = alert.mock.calls[0] as [string, string, { text: string }[]];
    expect(title).toBe('اپنا بلاک تلاش کرنا');
    expect(body).not.toMatch(/Every block|Tap Directions/);
    expect(buttons[0].text).toBe('سمجھ گئے');
  });

  test('Help in Roman Urdu: no Urdu script and no English sentences', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<HelpScreen />);

    expect(screen.getByText('Madad aur sahayata')).toBeOnTheScreen();
    expect(screen.getByText('Hungami rabte')).toBeOnTheScreen();
    english('Common Questions', 'Tips for locating', 'Dial ');

    fireEvent.press(screen.getByRole('button', { name: /Apna block talash karna/ }));
    expect(alert.mock.calls[0][1]).not.toMatch(/[؀-ۿ]/);
  });

  test('App Guide: every section reads in the chosen language, with no second-language subtitle', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<AppGuideScreen />);

    expect(screen.getByText('ایپ گائیڈ')).toBeOnTheScreen();
    expect(screen.getByText('1. خوش آمدید')).toBeOnTheScreen();
    expect(screen.getByText('11. مسئلے کا حل')).toBeOnTheScreen();
    english('Welcome', 'Search Places', 'From row', 'Safety Tips', 'Troubleshooting', 'Blue: you', 'How to use the app');

    await act(async () => useLocaleStore.setState({ locale: 'ur-Latn' }));
    expect(await screen.findByText('1. Khush aamdeed')).toBeOnTheScreen();
    english('Safety Tips', 'Blue: you');
  });
});

describe('About', () => {
  test('Urdu: UI words are translated, the attribution proper name stays intact and tappable', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<AboutScreen />);

    expect(screen.getByText('ایپ کا تعارف')).toBeOnTheScreen();
    expect(screen.getByText('ہمارا مقصد')).toBeOnTheScreen();
    expect(screen.getByText('قانونی اور رازداری')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /© OpenStreetMap contributors/ })).toBeTruthy();
    expect(screen.getByText(/نقشے کا ڈیٹا/)).toBeOnTheScreen();
    english('Our Mission', 'Key Features', 'Privacy Policy', 'Terms of Service', 'Map data');
  });

  test('Roman Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    await render(<AboutScreen />);

    expect(screen.getByText('App ka taaruf')).toBeOnTheScreen();
    expect(screen.getByText('Hamara maqsad')).toBeOnTheScreen();
    expect(screen.getByText(/Map ka data/)).toBeOnTheScreen();
    english('Our Mission', 'Key Features', 'Privacy Policy', 'Made with');
  });
});

describe('Welcome, Splash and Drawer', () => {
  test('Welcome in Urdu and Roman Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<WelcomeScreen />);
    expect(screen.getByText('اجتماع میپ میں خوش آمدید')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'آگے بڑھیں' })).toBeTruthy();
    english('Welcome to', 'Continue', 'See where you are', 'optional');

    await act(async () => useLocaleStore.setState({ locale: 'ur-Latn' }));
    expect(await screen.findByText('Ijtema Map mein khush aamdeed')).toBeOnTheScreen();
    english('Welcome to', 'Continue', 'Get walking directions');
  });

  test('Splash shows the app name and tagline in the chosen language, once', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<SplashScreen />);
    expect(screen.getByText('اجتماع میپ')).toBeOnTheScreen();
    expect(screen.getByText('اجتماع میں اپنا راستہ تلاش کریں')).toBeOnTheScreen();
    english('Find your way', 'Ijtema Map');
  });

  test('Drawer entries and accessible names follow the language, and the header text starts at the logo edge', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await render(<CustomDrawer {...({ navigation: { navigate: jest.fn() } } as never)} />);

    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['مقام تلاش کریں', 'ترتیبات', 'مدد']);
    expect(screen.getByText('اجتماع میپ')).toBeOnTheScreen();
    const column = screen.getByText('اجتماع میپ').parent!;
    const style = StyleSheet.flatten(column.props.style);
    expect(style.marginStart).toBe(16);
    expect(style.marginLeft).toBeUndefined();
    english('Find a place', 'Find your way');
  });
});

describe('Dialogs, errors and location messages', () => {
  test('the stop-directions confirmation is localized', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderHook(() =>
      useNavigationExitConfirmation({ active: true, arrived: false, onExit: jest.fn() }),
    );

    await act(async () => result.current.requestNavigationExit());

    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string }[]];
    expect(title).toBe('Raaste ki rehnumai rokein?');
    expect(message).toBe('Aap wapas map par chale jayenge.');
    expect(buttons.map((b) => b.text)).toEqual(['Jaari rakhein', 'Rokein']);
  });

  test('the error screen reads in Urdu', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('کچھ غلط ہو گیا۔')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'ایپ دوبارہ شروع کریں' })).toBeTruthy();
    english('Something went wrong', 'Restart');
  });

  test('location messages follow the language', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    const denied = await LocationAccessService.resolveCurrentLocation(false);
    expect(denied.message).toBe('اپنی جگہ دیکھنے کے لیے لوکیشن کی اجازت دیں۔');

    useLocaleStore.setState({ locale: 'ur-Latn' });
    const deniedLatn = await LocationAccessService.resolveCurrentLocation(false);
    expect(deniedLatn.message).toBe('Apni jagah dekhne ke liye location ki ijazat dein.');
  });
});
