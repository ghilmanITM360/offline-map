/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

import { premium } from '../../../theme';

/**
 * Lightweight vector composition of the brand mark (mihrab arch + location pin +
 * crescent) — no matching production image asset exists in the repo (`assets/icon.png`
 * is a placeholder circle), so this is built from simple shapes rather than an
 * approximated/AI-regenerated raster (see redesign brief §11/§15). Decorative only;
 * callers should mark the wrapping element non-accessible.
 */
export function IjtemaMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path
        d="M18.5 2a3 3 0 0 0 4.5 2.6A4.2 4.2 0 1 1 18.5 2Z"
        fill={premium.primary}
      />
      <Path
        d="M8 34 V20 C8 12 13 7 20 7 C27 7 32 12 32 20 V34 Z"
        fill={premium.primary}
      />
      <Path
        d="M13 34 V21 C13 15.5 16 12 20 12 C24 12 27 15.5 27 21 V34 Z"
        fill={premium.mint}
      />
      <Circle cx="20" cy="20.5" r="4.6" fill={premium.primary} />
      <Circle cx="20" cy="19.4" r="1.7" fill={premium.mint} />
    </Svg>
  );
}
