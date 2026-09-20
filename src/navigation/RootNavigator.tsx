/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { NavigatorScreenParams } from '@react-navigation/native'; // fixed: add typed nested navigator params
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { HomeScreen } from '../views/screens/HomeScreen';
import { SplashScreen } from '../views/screens/SplashScreen';
import { WelcomeScreen } from '../views/screens/WelcomeScreen';
import { PermissionScreen } from '../views/screens/PermissionScreen';
import { DownloadMapScreen } from '../views/screens/DownloadMapScreen';
import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { SettingsScreen } from '../views/screens/SettingsScreen';
import { ErrorScreen } from '../views/screens/ErrorScreen';
import { HelpScreen } from '../views/screens/HelpScreen';
import { AboutScreen } from '../views/screens/AboutScreen';
import { AppGuideScreen } from '../views/screens/AppGuideScreen';
import { CustomDrawer } from '../views/components/CustomDrawer';
import { ConnectivityService } from '../services/ConnectivityService';
import { GPSManagerService } from '../services/GPSManagerService';
import { useAppStore } from '../store/useAppStore';

export type DrawerParamList = {
  Home: undefined;
  Settings: undefined;
  Help: undefined;
  About: undefined;
}; // fixed: type drawer routes

export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Permission: undefined;
  DownloadMap: undefined;
  LocationsDirectory: undefined;
  Main: NavigatorScreenParams<DrawerParamList> | undefined;
  AppGuide: undefined;
  Error: { title?: string; message?: string; type?: 'general' | 'connectivity' } | undefined;
}; // fixed: type stack routes

const Stack = createNativeStackNavigator<RootStackParamList>(); // fixed: use typed stack navigator
const Drawer = createDrawerNavigator<DrawerParamList>(); // fixed: use typed drawer navigator

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
  }, [setHasInternet]); // fixed: include store setter dependency

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Permission" component={PermissionScreen} />
      <Stack.Screen name="DownloadMap" component={DownloadMapScreen} />
      <Stack.Screen name="LocationsDirectory" component={LocationsDirectoryScreen} />
      <Stack.Screen name="Main" component={MainDrawer} />
      <Stack.Screen name="AppGuide" component={AppGuideScreen} />
      <Stack.Screen name="Error" component={ErrorScreen} />
    </Stack.Navigator>
  );
}
