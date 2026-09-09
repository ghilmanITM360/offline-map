/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

import { premium } from '../../../theme';

/**
 * Faded tent/minaret skyline — the reference screens' recurring illustration motif.
 * No matching production artwork exists in the repo, so this is a lightweight vector
 * composition (see redesign brief §15) rather than an embedded copy of the reference
 * screenshot. Purely decorative: hidden from the accessibility tree by the caller.
 */
export function TentSkyline({
  width = 220,
  height = 140,
  style,
}: {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox="0 0 220 140">
        <Circle cx="150" cy="55" r="26" fill={premium.canvasAlt} opacity={0.9} />
        <Rect x="150" y="18" width="6" height="70" fill={premium.illustration} />
        <Path d="M153 8 L157 14 L149 14 Z" fill={premium.illustration} />
        <Circle cx="153" cy="4" r="3" fill={premium.illustration} />
        <Path d="M0 140 L40 90 L80 140 Z" fill={premium.illustration} opacity={0.6} />
        <Path d="M50 140 L100 78 L150 140 Z" fill={premium.illustration} opacity={0.8} />
        <Path d="M120 140 L165 96 L210 140 Z" fill={premium.illustration} opacity={0.6} />
        <Path d="M170 140 L200 108 L220 140 Z" fill={premium.illustration} opacity={0.45} />
      </Svg>
    </View>
  );
}
