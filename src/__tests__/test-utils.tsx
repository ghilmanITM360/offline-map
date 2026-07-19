/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react-native';
import { SafeAreaProvider, Metrics } from 'react-native-safe-area-context';

// Screens under test call useSafeAreaInsets()/SafeAreaView, which throw without a
// SafeAreaProvider ancestor providing frame metrics — there is no real native layout pass in
// the test environment, so we supply fixed metrics ourselves.
const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>{children}</SafeAreaProvider>
  );
}

export function render(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react-native';
