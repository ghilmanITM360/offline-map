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
import { useWelcomeViewModel } from '../viewmodels/WelcomeViewModel';
import { StartupManager } from '../services/StartupManager';

jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: { setHasSeenWelcome: jest.fn().mockResolvedValue(undefined) },
}));

// A real React Navigation stack router that renders only the focused route, so these tests assert the
// screen the user would actually see and what sits underneath it, not just that replace() was called.
function StackView({ initialRouteName, children }: { initialRouteName: string; children: React.ReactNode }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { initialRouteName, children });
  const focused = state.routes[state.index];
  return <NavigationContent>{descriptors[focused.key].render()}</NavigationContent>;
}
const Stack = createNavigatorFactory(StackView)<any>();

function WelcomeProbe({ navigation }: { navigation: any }) {
  const { continueFromWelcome } = useWelcomeViewModel();
  return (
    <>
      <Text>welcome-screen</Text>
      <Pressable accessibilityLabel="continue" onPress={() => { void continueFromWelcome(navigation); }} />
    </>
  );
}
const withNav = (Probe: React.ComponentType<{ navigation: any }>) => ({ navigation }: { navigation: any }) => (
  <Probe navigation={navigation} />
);
const navRef = createNavigationContainerRef<any>();
const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const stackNames = () => navRef.getRootState().routes.map((r: { name: string }) => r.name);

describe('#307 first install: Welcome -> Directory, location is asked later in context', () => {
  it('Continue on Welcome shows the Directory with nothing underneath (no Permission step)', async () => {
    await render(
      <NavigationContainer ref={navRef}>
        <Stack.Navigator initialRouteName="Welcome">
          <Stack.Screen name="Welcome" component={withNav(WelcomeProbe)} />
          <Stack.Screen name="LocationsDirectory" component={() => <Text>directory-screen</Text>} />
        </Stack.Navigator>
      </NavigationContainer>,
    );
    await act(async () => { fireEvent.press(screen.getByLabelText('continue')); });
    await settle();

    expect(navRef.getCurrentRoute()?.name).toBe('LocationsDirectory');
    expect(screen.getByText('directory-screen')).toBeTruthy();
    expect(stackNames()).toEqual(['LocationsDirectory']);
  });
});

describe('#153 returning launch', () => {
  it('onboarding complete resolves to the Directory (no map-setup step exists, #140)', () => {
    expect(StartupManager.resolve({ hasSeenWelcome: true })).toEqual({ phase: 'ready', route: 'LocationsDirectory' });
  });

  it('incomplete onboarding does not resolve to the Directory', () => {
    expect(StartupManager.resolve({ hasSeenWelcome: false }).route).toBe('Welcome');
  });
});
