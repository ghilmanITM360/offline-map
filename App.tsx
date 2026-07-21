import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ErrorBoundary } from './src/components/ErrorBoundary'; // fixed: protect the navigator tree with a render error boundary

// BottomSheetModalProvider must wrap every screen that presents a BottomSheetModal
// (HomeScreen's directions/place sheet) — it renders a portal host so sheet content
// mounts in its own layer, guaranteed to paint above MapView's native Android
// SurfaceView regardless of sibling zIndex/elevation values.
export default function App() {
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
