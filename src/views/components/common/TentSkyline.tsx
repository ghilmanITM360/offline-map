/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

import { premium } from '../../../theme';

/**
 * Faded Ijtema tent/minaret skyline — the reference screens' recurring illustration
 * motif (sun halo, mountain horizon, twin minarets with flags, a tent-city foreground).
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
        {/* sun halo */}
        <Circle cx="110" cy="62" r="30" fill={premium.canvasAlt} opacity={0.9} />

        {/* mountain horizon — kept hazy/background so the tent row in front reads as a
            distinct, closer layer rather than blending into it */}
        <Path d="M0 118 L30 78 L58 106 L86 62 L120 108 L150 84 L182 116 L220 92 L220 140 L0 140 Z" fill={premium.illustration} opacity={0.22} />
        <Path d="M0 132 L36 100 L70 124 L104 92 L140 126 L176 104 L220 130 L220 140 L0 140 Z" fill={premium.illustration} opacity={0.32} />

        {/* minaret 1 (left of centre) */}
        <Path d="M60 118 V58 Q60 52 66 52 Q72 52 72 58 V118 Z" fill={premium.primary} opacity={0.85} />
        <Path d="M63 52 L69 52 L66 44 Z" fill={premium.primary} opacity={0.85} />
        <Path d="M66 44 V34" stroke={premium.primary} strokeWidth={1.6} opacity={0.85} />
        <Path d="M66 34 L74 30 L66 38 Z" fill={premium.primary} opacity={0.85} />

        {/* minaret 2 (right, taller) */}
        <Path d="M148 118 V44 Q148 37 155 37 Q162 37 162 44 V118 Z" fill={premium.primary} />
        <Path d="M150 37 L160 37 L155 27 Z" fill={premium.primary} />
        <Path d="M155 27 V15" stroke={premium.primary} strokeWidth={1.8} />
        <Path d="M155 15 L164 10 L155 20 Z" fill={premium.primary} />

        {/* tent city foreground — deeply-rounded dome silhouettes (curve control point at
            80% of the tent's height, not a mild bulge) rendered at strong, near-solid
            opacity so this closer row reads unambiguously as tents against the hazy
            mountain layer behind, rather than repeating it */}
        <Path d="M0 140 Q20.8 132.8 26 104 Q31.2 132.8 52 140 Z" fill={premium.primary} opacity={0.55} />
        <Path d="M20 140 Q42.4 131.2 48 96 Q53.6 131.2 76 140 Z" fill={premium.primary} opacity={0.95} />
        <Path d="M64 140 Q86.4 132 92 100 Q97.6 132 120 140 Z" fill={premium.primary} opacity={0.7} />
        <Path d="M100 140 Q119.2 133.2 124 106 Q128.8 133.2 148 140 Z" fill={premium.primary} opacity={0.95} />
        <Path d="M130 140 Q152.4 131.6 158 98 Q163.6 131.6 186 140 Z" fill={premium.primary} opacity={0.7} />
        <Path d="M170 140 Q190 134.4 196 112 Q202 134.4 220 140 Z" fill={premium.primary} opacity={0.5} />

        {/* small pennants on the two foreground tent peaks */}
        <Path d="M48 96 V88 L54 91 Z" fill={premium.primary} opacity={0.6} />
        <Path d="M158 98 V90 L164 93 Z" fill={premium.illustration} opacity={0.85} />
      </Svg>
    </View>
  );
}
