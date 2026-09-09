/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

import { premium } from '../../../theme';

/**
 * Welcome screen's single minaret-in-a-halo mark — visually distinct from the
 * arch+pin IjtemaMark used as the app's wordmark logo elsewhere (see the approved
 * Welcome reference: a plain minaret tower + crescent sits above the Urdu title,
 * not the full brand lockup). Decorative only.
 */
export function WelcomeHeroIcon({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Circle cx="48" cy="50" r="42" fill={premium.canvasAlt} opacity={0.85} />
      <Path d="M42 82 V38 Q42 30 48 30 Q54 30 54 38 V82 Z" fill={premium.primary} />
      <Path d="M44 30 L52 30 L48 18 Z" fill={premium.primary} />
      <Path d="M48 18 V6" stroke={premium.primary} strokeWidth={2.4} />
      <Path
        d="M44 8a5 5 0 0 0 7.2 4.4A6.6 6.6 0 1 1 44 8Z"
        fill={premium.primary}
      />
      <Path d="M38 82 H58" stroke={premium.primary} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
    </Svg>
  );
}
