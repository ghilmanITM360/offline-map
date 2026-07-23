/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewStyle } from 'react-native';

// Elevation presets consolidated from the ad hoc shadow/elevation pairs scattered across
// mapControlStyles.ts, LocationSheet.tsx, navOverlayStyles.ts, LayersSheet.tsx.
export const shadows: Record<'low' | 'medium' | 'high', ViewStyle> = {
  low: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  medium: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  high: {
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
};
