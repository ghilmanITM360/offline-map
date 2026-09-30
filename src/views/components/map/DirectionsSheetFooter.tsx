/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useSyncExternalStore } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BottomSheetFooter, type BottomSheetFooterProps } from '@gorhom/bottom-sheet';

import { directionsSheetColors } from '../../../theme';

/**
 * Pinned footer for the Get Directions sheet (#177).
 *
 * gorhom sizes the sheet's content area independently of the current snap point, so a plain
 * bottom-aligned View drifts below the screen at the 50% snap and floats above the sheet's
 * end when expanded. `BottomSheetFooter` is gorhom's own answer: it is positioned against the
 * visible part of the sheet at every snap. It can only be handed to the modal as a component,
 * while the footer's content (route summary, Start Navigation, disabled reason) lives in
 * LocationSheet's view-model state — so LocationSheet publishes the node here and HomeScreen
 * mounts this slot once. The slot renders nothing when no route-preview sheet is open.
 */
let footerNode: React.ReactNode = null;
let footerHeight = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function publishDirectionsFooter(node: React.ReactNode) {
  if (node === footerNode) return;
  footerNode = node;
  if (node === null) footerHeight = 0;
  emit();
}

/** Height the scroll content must leave free so its last row isn't hidden behind the footer. */
export function useDirectionsFooterHeight() {
  return useSyncExternalStore(subscribe, () => footerHeight, () => 0);
}

export function DirectionsSheetFooter({
  animatedFooterPosition,
  collapsed = false,
}: BottomSheetFooterProps & {
  /** True at the 15% snap, where only the handle and header are meant to show. */
  collapsed?: boolean;
}) {
  const node = useSyncExternalStore(subscribe, () => footerNode, () => null);
  if (!node || collapsed) return null;
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next === footerHeight) return;
    footerHeight = next;
    emit();
  };
  return (
    <BottomSheetFooter animatedFooterPosition={animatedFooterPosition}>
      <View onLayout={onLayout}>
        <View style={styles.footer}>{node}</View>
        <View pointerEvents="none" style={styles.skirt} />
      </View>
    </BottomSheetFooter>
  );
}

const styles = StyleSheet.create({
  // Below the footer, at snaps under the tallest one, gorhom's content area still extends past the
  // footer's bottom edge; this opaque skirt keeps scrolled content from showing through there.
  skirt: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: 1200,
    backgroundColor: directionsSheetColors.background,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: directionsSheetColors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: directionsSheetColors.cardBorder,
  },
});
