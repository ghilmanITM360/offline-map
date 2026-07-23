/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { staticColors } from '../../../theme';

// Shared drag-handle geometry (Phase 8A task 6). LayersSheet (raw Modal) renders this
// directly; HomeScreen's BottomSheetModal (@gorhom/bottom-sheet) uses the same
// width/height/radius/color via its own `handleIndicatorStyle` prop (see
// SHEET_HANDLE_STYLE below) since @gorhom renders its handle internally and can't
// mount this component — the two sheet systems stay visually identical without a
// full migration off Modal.
export const SHEET_HANDLE_WIDTH = 36;
export const SHEET_HANDLE_HEIGHT = 4;
export const SHEET_HANDLE_COLOR = staticColors.border;

export const SHEET_HANDLE_STYLE = {
  width: SHEET_HANDLE_WIDTH,
  height: SHEET_HANDLE_HEIGHT,
  borderRadius: SHEET_HANDLE_HEIGHT / 2,
  backgroundColor: SHEET_HANDLE_COLOR,
};

export function SheetHandle() {
  return <View style={styles.handle} />;
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    marginBottom: 12,
    ...SHEET_HANDLE_STYLE,
  },
});
