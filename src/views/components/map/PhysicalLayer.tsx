/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

/**
 * Keeps screen-space map chrome in physical (LTR) coordinates even when the
 * surrounding application uses RTL layout. Geographic content and text
 * direction remain the responsibility of the map and the child component.
 */
export const physicalLayerStyle = StyleSheet.create({
  root: { direction: 'ltr' },
}).root;

export function PhysicalLayer({ style, ...props }: ViewProps) {
  return <View {...props} style={[physicalLayerStyle, style]} />;
}
