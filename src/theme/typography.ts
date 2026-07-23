/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextStyle } from 'react-native';

// Text-style hierarchy consolidated from LocationSheet.tsx, navOverlayStyles.ts,
// HomeScreen.tsx, LayersSheet.tsx. Sizes are kept identical to the values already in
// use for each role — this is a naming/grouping pass, not a resize.
export const typography = {
  navigation: {
    maneuverTitle: { fontSize: 17, fontWeight: '700', color: '#E8F5E9' } as TextStyle,
    maneuverDistance: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' } as TextStyle,
    eta: { fontSize: 26, fontWeight: '700', color: '#2E7D32' } as TextStyle,
    distance: { fontSize: 15, fontWeight: '400', color: '#5F6368' } as TextStyle,
    roadName: { fontSize: 13, fontWeight: '400', color: '#A5D6A7' } as TextStyle,
  },
  map: {
    markerLabel: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' } as TextStyle,
    blockLabel: { fontSize: 13, fontWeight: '700', color: '#202124' } as TextStyle,
    gateLabel: { fontSize: 12, fontWeight: '700', color: '#202124' } as TextStyle,
  },
  sheet: {
    title: { fontSize: 20, fontWeight: '800', color: '#202124' } as TextStyle,
    subtitle: { fontSize: 15, fontWeight: '600', color: '#5F6368' } as TextStyle,
    body: { fontSize: 15, fontWeight: '400', color: '#3C4043' } as TextStyle,
    button: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' } as TextStyle,
  },
} as const;
