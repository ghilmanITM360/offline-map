/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
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
import { ConnectivityService } from '../services/ConnectivityService';
import { GPSManagerService } from '../services/GPSManagerService';
import { useAppStore } from '../store/useAppStore';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const CONNECTIVITY_POLL_INTERVAL_MS = 30000;

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{ headerShown: false, drawerType: 'front' }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
      <Drawer.Screen name="Help" component={HelpScreen} />
      <Drawer.Screen name="About" component={AboutScreen} />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  const { setHasInternet, setCurrentLocation } = useAppStore();

  // Wire GPSManagerService store updater once — keeps the service decoupled
  useEffect(() => {
    GPSManagerService.setStoreUpdater(setCurrentLocation);
  }, [setCurrentLocation]);

  // Poll connectivity every 30s and update the global store
  useEffect(() => {
    const check = async () => {
      const connected = await ConnectivityService.isConnected();
      setHasInternet(connected);
    };
    check();
    const interval = setInterval(check, CONNECTIVITY_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Permission" component={PermissionScreen} />
      <Stack.Screen name="DownloadMap" component={DownloadMapScreen} />
      <Stack.Screen name="Main" component={MainDrawer} />
      <Stack.Screen name="Directions" component={DirectionsScreen} />
      <Stack.Screen name="Navigation" component={NavigationScreen} />
      <Stack.Screen name="Error" component={ErrorScreen} />
    </Stack.Navigator>
  );
}
