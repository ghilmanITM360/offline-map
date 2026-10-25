import React, { useEffect, useMemo, useRef } from 'react';
import { Button, I18nManager, Platform, StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
import { createNavigationController } from '@muslim-ummah/offline-navigation';
import {
  createDefaultNavigationTheme,
  ENGLISH_NAVIGATION_SCREEN_COPY,
  NavigationProvider,
  NavigationScreen,
  useNavigationState,
} from '@muslim-ummah/offline-navigation/ui';
import { demoVenue, describeDemoPlace } from './demoVenue';
import { SketchMap } from './SketchMap';
import { createSimulatedLocation, type SimulatedLocation } from './simulatedLocation';

// Everything the host owns is here: the venue, place names, map, location service, language, theme and safe area.
// The ready-made screen owns the journey.
export default function App() {
  const isRTL = I18nManager.isRTL;
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { location, controller } = useMemo(() => {
    const location = createSimulatedLocation(demoVenue.graph.getNode('a')!.coordinate);
    return { location, controller: createNavigationController({ venue: demoVenue, location, now: Date.now }) };
  }, []);
  const theme = useMemo(() => createDefaultNavigationTheme({ isRTL, colorScheme }), [isRTL, colorScheme]);
  return (
    <NavigationProvider controller={controller}>
      <View style={styles.root}>
        <NavigationScreen
          style={styles.screen}
          copy={ENGLISH_NAVIGATION_SCREEN_COPY}
          theme={theme}
          isRTL={isRTL}
          describePlace={describeDemoPlace}
          MapComponent={SketchMap}
          bottomInset={Platform.OS === 'ios' ? 34 : 0}
        />
        <DemoGps location={location} />
      </View>
    </NavigationProvider>
  );
}

// Demo only: lets a simulator user walk the simulated GPS along the live route.
function DemoGps({ location }: { location: SimulatedLocation }) {
  const state = useNavigationState();
  const next = useRef(1);
  useEffect(() => { if (state.phase !== 'live') next.current = 1; }, [state.phase]);
  const points = state.route?.line?.points;
  if (state.phase !== 'live' || !points) return null;
  // RN's Button upper-cases its title on Android, so the accessible name is set explicitly.
  return <Button title="Demo GPS: walk to the next point" accessibilityLabel="Demo GPS: walk to the next point" onPress={() => location.moveTo(points[Math.min(next.current++, points.length - 1)])} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 56 },
});
