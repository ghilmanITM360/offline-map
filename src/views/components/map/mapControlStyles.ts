/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';

// Styles for the shared floating map-control cluster (MapControls, RecenterButton).
// Values extracted verbatim from HomeScreen.tsx's pre-extraction inline StyleSheet —
// must stay pixel-identical to the browse-mode controls that predate this extraction.
export const mapControlStyles = StyleSheet.create({
  controlButton: {
    backgroundColor: '#FFFFFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
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
  },
  controlHelperText: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '700',
  },
  zoomControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    elevation: 3,
  },
  zoomButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
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
