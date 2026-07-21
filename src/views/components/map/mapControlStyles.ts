/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';
import { Z } from '../../styles/zLayers';

// Styles for the shared floating map-control cluster (MapControls, RecenterButton).
// Button size bumped from the original 44dp to 48dp (Android accessibility touch-target floor).
// zIndex added on top (was previously relying on elevation alone, which orders
// Android views within a parent but doesn't compose reliably against a sibling
// BottomSheetModal/native MapView surface) — see zLayers.ts for the layer contract.
export const mapControlStyles = StyleSheet.create({
  controlButton: {
    backgroundColor: '#FFFFFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
    zIndex: Z.mapControls,
  },
  controlButtonActive: {
    borderWidth: 1,
    borderColor: '#1A73E8',
    backgroundColor: '#E8F0FE',
  },
  controlHelperBadge: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 10,
    alignSelf: 'center',
    elevation: 2,
    zIndex: Z.mapControls,
  },
  controlHelperText: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '700',
  },
  zoomControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    elevation: 3,
    zIndex: Z.mapControls,
  },
  zoomButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, backgroundColor: '#DADCE0', marginHorizontal: 8 },
  recenterButtonWrap: { marginTop: 8 },
  recenterButton: {
    backgroundColor: '#FFFFFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
});
