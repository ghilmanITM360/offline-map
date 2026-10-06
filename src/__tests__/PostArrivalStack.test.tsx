/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: after Arrival -> Done the Directory is the root of the journey flow. It used to be pushed over Home
// ([Main, Directory]), so Back from the Directory reopened the finished journey's Map. The Directory now becomes
// the only route, exactly like a launch, and Back from it leaves the app.

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
import { resetToDirectoryAction } from '../navigation/postJourney';

// A real stack router that renders only the focused route, nested the way the app nests Home inside Main.
function StackView({ initialRouteName, children }: { initialRouteName: string; children: React.ReactNode }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { initialRouteName, children });
  const focused = state.routes[state.index];
  return <NavigationContent>{descriptors[focused.key].render()}</NavigationContent>;
}
const createStack = createNavigatorFactory(StackView);
const Root = createStack<any>();
const Inner = createStack<any>();

function Home({ navigation }: { navigation: any }) {
  return (
    <>
      <Text>home-screen</Text>
      <Pressable accessibilityLabel="done" onPress={() => navigation.dispatch(resetToDirectoryAction())} />
    </>
  );
}
function Directory({ navigation }: { navigation: any }) {
  return (
    <>
      <Text>directory-screen</Text>
      <Pressable accessibilityLabel="pick" onPress={() => navigation.replace('Main')} />
    </>
  );
}
const MainDrawerLike = () => (
  <Inner.Navigator initialRouteName="Home">
    <Inner.Screen name="Home" component={Home} />
  </Inner.Navigator>
);

const navRef = createNavigationContainerRef<any>();
const mount = () =>
  render(
    <NavigationContainer ref={navRef}>
      <Root.Navigator initialRouteName="Main">
        <Root.Screen name="Main" component={MainDrawerLike} />
        <Root.Screen name="LocationsDirectory" component={Directory} />
      </Root.Navigator>
    </NavigationContainer>,
  );
const rootNames = () => navRef.getRootState().routes.map((r: { name: string }) => r.name);

describe('Arrival -> Done -> Directory stack (#307)', () => {
  it('Done from the nested Home leaves the Directory as the only route (no stale Map underneath)', async () => {
    await mount();
    await act(async () => { fireEvent.press(screen.getByLabelText('done')); });

    expect(screen.getByText('directory-screen')).toBeTruthy();
    expect(rootNames()).toEqual(['LocationsDirectory']);
    expect(navRef.canGoBack()).toBe(false); // Back from the Directory leaves the app, like after a launch
  });

  it('picking the next destination from that Directory opens a fresh Map, as at launch', async () => {
    await mount();
    await act(async () => { fireEvent.press(screen.getByLabelText('done')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('pick')); });

    expect(screen.getByText('home-screen')).toBeTruthy();
    expect(rootNames()).toEqual(['Main']);
  });
});
