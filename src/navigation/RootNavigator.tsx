/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { HomeScreen } from '../views/screens/HomeScreen';
import { SplashScreen } from '../views/screens/SplashScreen';
import { PermissionScreen } from '../views/screens/PermissionScreen';
import { DownloadMapScreen } from '../views/screens/DownloadMapScreen';
import { SettingsScreen } from '../views/screens/SettingsScreen';
import { DirectionsScreen } from '../views/screens/DirectionsScreen';
import { NavigationScreen } from '../views/screens/NavigationScreen';
import { ErrorScreen } from '../views/screens/ErrorScreen';
import { HelpScreen } from '../views/screens/HelpScreen';
import { AboutScreen } from '../views/screens/AboutScreen';
import { CustomDrawer } from '../views/components/CustomDrawer';
import { useAppStore } from '../store/useAppStore';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function MainDrawer() {
  return (
    <Drawer.Navigator 
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
      <Drawer.Screen name="Help" component={HelpScreen} />
      <Drawer.Screen name="About" component={AboutScreen} />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  const { offlineData } = useAppStore();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Permission" component={PermissionScreen} />
      {!offlineData.isDownloaded && (
        <Stack.Screen name="DownloadMap" component={DownloadMapScreen} />
      )}
      <Stack.Screen name="Main" component={MainDrawer} />
      <Stack.Screen name="Directions" component={DirectionsScreen} />
      <Stack.Screen name="Navigation" component={NavigationScreen} />
      <Stack.Screen name="Error" component={ErrorScreen} />
    </Stack.Navigator>
  );
}
