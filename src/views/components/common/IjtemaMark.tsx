/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

import { premium } from '../../../theme';

/**
 * Lightweight vector reproduction of the brand mark (mihrab arch + map pin + a curving
 * path + crescent) — no original logo file is accessible on disk this pass (supplied only
 * as an inline chat attachment, not a filesystem asset), so this is rebuilt from what was
 * visually observed rather than an approximated/AI-regenerated raster (see redesign brief
 * §11/§15 and the correction pass's Rule #2). Decorative only; callers should mark the
 * wrapping element non-accessible.
 */
export function IjtemaMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path
        d="M18.6 1.5a2.9 2.9 0 0 0 4.3 2.5A4 4 0 1 1 18.6 1.5Z"
        fill={premium.primary}
      />
      <Path
        d="M7 35 V19.5 C7 11.5 12.5 6 20 6 C27.5 6 33 11.5 33 19.5 V35 Z"
        fill={premium.primary}
      />
      <Path
        d="M12 35 V20.5 C12 14.5 15.3 11 20 11 C24.7 11 28 14.5 28 20.5 V35 Z"
        fill={premium.mint}
      />
      <Path
        d="M13.5 35 C13.5 29.5 16.5 27.5 20 26"
        stroke={premium.primary}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
      <Path
        d="M20 14 C16.7 14 14 16.6 14 19.9 C14 24.3 20 30.5 20 30.5 C20 30.5 26 24.3 26 19.9 C26 16.6 23.3 14 20 14 Z"
        fill={premium.primary}
      />
      <Circle cx="20" cy="19.6" r="2.4" fill={premium.mint} />
    </Svg>
  );
}
