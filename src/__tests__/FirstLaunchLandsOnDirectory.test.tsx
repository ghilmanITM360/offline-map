/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, Text } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
  createNavigatorFactory,
  StackRouter,
  useNavigationBuilder,
} from '@react-navigation/native';
import { act, fireEvent, render, screen } from './test-utils';
import { usePermissionViewModel } from '../viewmodels/PermissionViewModel';
import { StartupManager } from '../services/StartupManager';
import * as Location from 'expo-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));
jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: {
    setSkippedLocationPermission: jest.fn().mockResolvedValue(undefined),
    clearSkippedLocationPermissionOnGrant: jest.fn().mockResolvedValue(undefined),
  },
}));
// A real React Navigation stack router that renders only the focused route, so these tests assert the
// screen the user would actually see and what sits underneath it, not just that navigate() was called.
function StackView({ initialRouteName, children }: { initialRouteName: string; children: React.ReactNode }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { initialRouteName, children });
  const focused = state.routes[state.index];
  return <NavigationContent>{descriptors[focused.key].render()}</NavigationContent>;
}
const Stack = createNavigatorFactory(StackView)<any>();

function PermissionProbe({ navigation }: { navigation: any }) {
  const { requestPermission, skipPermission } = usePermissionViewModel();
  return (
    <>
      <Text>permission-screen</Text>
      <Pressable accessibilityLabel="allow" onPress={() => { void requestPermission(navigation); }} />
      <Pressable accessibilityLabel="skip" onPress={() => skipPermission(navigation)} />
    </>
  );
}

const withNav = (Probe: React.ComponentType<{ navigation: any }>) => ({ navigation }: { navigation: any }) => (
  <Probe navigation={navigation} />
);

const navRef = createNavigationContainerRef<any>();

async function mountAt(initial: 'Permission') {
  await render(
    <NavigationContainer ref={navRef}>
      <Stack.Navigator initialRouteName={initial}>
        <Stack.Screen name="Permission" component={withNav(PermissionProbe)} />
        <Stack.Screen name="LocationsDirectory" component={() => <Text>directory-screen</Text>} />
        <Stack.Screen name="Main" component={() => <Text>home-screen</Text>} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const visibleRoute = () => navRef.getCurrentRoute()?.name;
const stackNames = () => navRef.getRootState().routes.map((r: { name: string }) => r.name);

beforeEach(() => {
  jest.clearAllMocks();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
});

describe('#153 first install completes into the Locations Directory, not Home', () => {
  it('granting permission shows the Directory with nothing underneath', async () => {
    await mountAt('Permission');
    await act(async () => { fireEvent.press(screen.getByLabelText('allow')); });
    await settle();

    expect(visibleRoute()).toBe('LocationsDirectory');
    expect(screen.getByText('directory-screen')).toBeTruthy();
    expect(stackNames()).toEqual(['LocationsDirectory']);
  });

  it('continuing without location also shows the Directory', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    await mountAt('Permission');
    await act(async () => { fireEvent.press(screen.getByLabelText('skip')); });
    await act(async () => {
      alertSpy.mock.calls.at(-1)?.[2]?.find((b: { text?: string }) => b.text === 'Continue Without Location')?.onPress?.();
    });
    await settle();
    alertSpy.mockRestore();

    expect(visibleRoute()).toBe('LocationsDirectory');
    expect(stackNames()).toEqual(['LocationsDirectory']);
  });

  it('denied permission keeps the user on the Permission step', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    await mountAt('Permission');
    await act(async () => { fireEvent.press(screen.getByLabelText('allow')); });
    await settle();
    alertSpy.mockRestore();

    expect(visibleRoute()).toBe('Permission');
  });
});

describe('#153 returning launch', () => {
  const complete = {
    hasSeenWelcome: true,
    permissionGranted: true,
    skippedLocationPermission: false,
  };

  it('onboarding complete resolves to the Directory (no map-setup step exists, #140)', () => {
    expect(StartupManager.resolve(complete)).toEqual({ phase: 'ready', route: 'LocationsDirectory' });
  });

  it('incomplete onboarding does not resolve to the Directory', () => {
    expect(StartupManager.resolve({ ...complete, hasSeenWelcome: false }).route).toBe('Welcome');
    expect(StartupManager.resolve({ ...complete, permissionGranted: false }).route).toBe('Permission');
  });
});
