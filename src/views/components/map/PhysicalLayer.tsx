/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { I18nManager, StyleSheet, View, ViewProps } from 'react-native';

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

const swapsLeftRight = I18nManager.isRTL && I18nManager.doLeftAndRightSwapInRTL;

/**
 * `direction: 'ltr'` only isolates an element's children; its own left/right offset is still mirrored by the RTL
 * parent. Use these to pin an absolutely positioned element or margin to the physical right edge.
 */
export const physicalRight = (value: number) => (swapsLeftRight ? { left: value } : { right: value });
export const physicalMarginLeft = (value: number) => (swapsLeftRight ? { marginRight: value } : { marginLeft: value });
export const physicalMarginRight = (value: number) => (swapsLeftRight ? { marginLeft: value } : { marginRight: value });
