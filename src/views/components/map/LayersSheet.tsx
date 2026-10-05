/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers } from 'lucide-react-native';

import { SheetHandle } from '../common/SheetHandle';
import { SheetHeader, SHEET_CORNER_RADIUS } from '../common/SheetHeader';
import { radii, shadows, spacing, staticColors } from '../../../theme';

interface LayersSheetProps {
  visible: boolean;
  onClose: () => void;
  showBlockPolygons: boolean;
  onToggleBlocks: (val: boolean) => void;
  showGatesLayer: boolean;
  onToggleGates: (val: boolean) => void;
  showRastasLayer: boolean;
  onToggleRastas: (val: boolean) => void;
  showSpecialRoutesLayer: boolean;
  onToggleSpecialRoutes: (val: boolean) => void;
}

function OverlayRow({ label, value, onChange }: { label: string; value: boolean; onChange: (val: boolean) => void }) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: staticColors.border, true: staticColors.info }}
        thumbColor={staticColors.white}
        // The row Pressable already carries the switch's accessible role/label/state —
        // without this, Android TalkBack focuses the inner Switch as a second, redundant
        // stop and announces "switch, on/off" a second time right after the row itself.
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export function LayersSheet({
  visible,
  onClose,
  showBlockPolygons,
  onToggleBlocks,
  showGatesLayer,
  onToggleGates,
  showRastasLayer,
  onToggleRastas,
  showSpecialRoutesLayer,
  onToggleSpecialRoutes,
}: LayersSheetProps) {
  const insets = useSafeAreaInsets();

  // Modal renders as its own native layer and already blocks touches from reaching the
  // MapView underneath — no extra interaction-lock prop needed here. The caller (HomeScreen)
  // additionally disables the MapView's own scroll/zoom/rotate while this is open, as
  // belt-and-suspenders against any camera animation continuing behind the sheet.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <SheetHandle />
        <SheetHeader title="Map Layers" icon={<Layers size={18} color="#202124" />} onClose={onClose} />

        <ScrollView bounces={false}>
          <Text style={styles.sectionLabel}>Show on Map</Text>
          <View style={styles.overlayGroup}>
            <OverlayRow label="Blocks" value={showBlockPolygons} onChange={onToggleBlocks} />
            <OverlayRow label="Gates" value={showGatesLayer} onChange={onToggleGates} />
            <OverlayRow label="Rastas" value={showRastasLayer} onChange={onToggleRastas} />
            <OverlayRow label="Shahr-e-Pindal" value={showSpecialRoutesLayer} onChange={onToggleSpecialRoutes} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: staticColors.white,
    borderTopLeftRadius: SHEET_CORNER_RADIUS,
    borderTopRightRadius: SHEET_CORNER_RADIUS,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    maxHeight: '70%',
    ...shadows.high,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: staticColors.iconMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F4',
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radii.md - 3,
  },
  segmentActive: {
    backgroundColor: staticColors.white,
    ...shadows.low,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: staticColors.iconMuted,
  },
  segmentTextActive: {
    color: staticColors.info,
  },
  overlayGroup: {
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAED',
    minHeight: 56,
  },
  rowLabel: {
    fontSize: 16,
    color: '#202124',
    fontWeight: '500',
  },
});
