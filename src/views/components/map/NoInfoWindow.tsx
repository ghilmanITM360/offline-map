/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Callout } from 'react-native-maps';

/**
 * Suppresses the Google Maps info window that a marker `title` would otherwise pop on tap (the title is
 * what TalkBack reads, react-native-maps#3500, so it has to stay).
 *
 * react-native-maps' Android `MapMarker.wrapCalloutView` bails out when the Callout has no native children,
 * and an empty `<View />` is flattened away by React Native, so the default title bubble (and Google's
 * maps/directions toolbar) appeared on every tap (#128 C). A non-collapsable 1x1 child keeps the callout real.
 */
export function NoInfoWindow() {
  return (
    <Callout tooltip>
      <View testID="no-info-window-child" collapsable={false} style={styles.empty} />
    </Callout>
  );
}

const styles = StyleSheet.create({
  empty: { width: 1, height: 1 },
});
