/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';
import { Z } from '../../styles/zLayers';
import { shadows, spacing, staticColors } from '../../../theme';

// Styles for the shared floating map-control cluster (MapControls, RecenterButton).
// Button size bumped from the original 44dp to 48dp (Android accessibility touch-target floor).
// zIndex added on top (was previously relying on elevation alone, which orders
// Android views within a parent but doesn't compose reliably against a sibling
// BottomSheetModal/native MapView surface) — see zLayers.ts for the layer contract.
export const mapControlStyles = StyleSheet.create({
  controlButton: {
    backgroundColor: staticColors.white,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    zIndex: Z.mapControls,
    ...shadows.low,
  },
  controlButtonActive: {
    borderWidth: 1,
    borderColor: staticColors.info,
    backgroundColor: staticColors.infoBackground,
  },
  moreButtonOpen: {
    borderWidth: 1,
    borderColor: staticColors.border,
  },
  zoomControls: {
    backgroundColor: staticColors.white,
    borderRadius: 24,
    zIndex: Z.mapControls,
    ...shadows.low,
  },
  zoomButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, backgroundColor: staticColors.border, marginHorizontal: spacing.sm },
  recenterButtonWrap: { marginTop: spacing.sm },
  recenterButton: {
    backgroundColor: staticColors.white,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.medium,
  },
  // CameraManager mode === FOLLOWING_USER — same active-state treatment as
  // controlButtonActive (compass), so "this control is currently engaged" reads
  // consistently across the whole stack.
  recenterButtonActive: {
    borderWidth: 1,
    borderColor: staticColors.info,
    backgroundColor: staticColors.infoBackground,
  },
});
