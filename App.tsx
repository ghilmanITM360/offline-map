import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { getBundledBasemap } from './src/services/BundledBasemap';
import { ErrorBoundary } from './src/components/ErrorBoundary'; // fixed: protect the navigator tree with a render error boundary

// #140 POC harness: isolated MapLibre offline-render proof, off unless enabled at bundle time.
// Required lazily so tests and normal builds never load the MapLibre native module.
const OfflineMapPoc =
  process.env.EXPO_PUBLIC_OFFLINE_MAP_POC === '1'
    ? (require('./src/poc/OfflineMapPoc') as typeof import('./src/poc/OfflineMapPoc')).OfflineMapPoc
    : null;

// BottomSheetModalProvider must wrap every screen that presents a BottomSheetModal
// (HomeScreen's directions/place sheet) — it renders a portal host so sheet content
// mounts in its own layer, guaranteed to paint above MapView's native Android
// SurfaceView regardless of sibling zIndex/elevation values.
export default function App() {
  // Install the bundled offline basemap (APK → app storage) while onboarding runs, so it is ready before the first map.
  // Local copy only; a failure is retried by the map's own request and degrades to a plain canvas.
  useEffect(() => {
    getBundledBasemap().catch(() => undefined);
  }, []);

  if (OfflineMapPoc) return <OfflineMapPoc />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <BottomSheetModalProvider>
            <NavigationContainer>
              <StatusBar style="auto" />
              <RootNavigator />
            </NavigationContainer>
          </BottomSheetModalProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
