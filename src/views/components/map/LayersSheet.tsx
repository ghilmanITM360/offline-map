/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, Satellite, Map as MapIcon } from 'lucide-react-native';

import { SheetHandle } from '../common/SheetHandle';
import { SheetHeader, SHEET_CORNER_RADIUS } from '../common/SheetHeader';
import { radii, shadows, spacing, staticColors } from '../../../theme';
import { useTheme } from '../../../services/useTheme';
import type { AppTheme } from '../../../services/ThemeService';

interface LayersSheetProps {
  visible: boolean;
  onClose: () => void;
  mapType: 'standard' | 'satellite' | 'hybrid';
  onMapTypeChange: (mapType: 'standard' | 'satellite') => void;
  showBlockPolygons: boolean;
  onToggleBlocks: (val: boolean) => void;
  showGatesLayer: boolean;
  onToggleGates: (val: boolean) => void;
  showRastasLayer: boolean;
  onToggleRastas: (val: boolean) => void;
  showSpecialRoutesLayer: boolean;
  onToggleSpecialRoutes: (val: boolean) => void;
}

function OverlayRow({ label, value, onChange, theme }: { label: string; value: boolean; onChange: (val: boolean) => void; theme: AppTheme }) {
  return (
    <Pressable
      style={[styles.row, { borderBottomColor: theme.border }]}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={staticColors.white}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export function LayersSheet({
  visible,
  onClose,
  mapType,
  onMapTypeChange,
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
  const theme = useTheme();

  // Modal renders as its own native layer and already blocks touches from reaching the
  // MapView underneath — no extra interaction-lock prop needed here. The caller (HomeScreen)
  // additionally disables the MapView's own scroll/zoom/rotate while this is open, as
  // belt-and-suspenders against any camera animation continuing behind the sheet.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <SheetHandle />
        <SheetHeader title="Map Layers" icon={<Layers size={18} color={theme.text} />} onClose={onClose} />

        <ScrollView style={styles.scroll} bounces={false}>
          <Text style={[styles.sectionLabel, { color: theme.subtext }]}>Map Type</Text>
          <View style={[styles.segmentedControl, { backgroundColor: theme.background }]}>
            <Pressable
              style={[styles.segment, mapType === 'standard' && [styles.segmentActive, { backgroundColor: theme.card }]]}
              onPress={() => onMapTypeChange('standard')}
              accessibilityRole="button"
              accessibilityLabel="Standard map type"
              accessibilityState={{ selected: mapType === 'standard' }}
            >
              <MapIcon size={16} color={mapType === 'standard' ? theme.accent : theme.subtext} />
              <Text style={[styles.segmentText, { color: mapType === 'standard' ? theme.accent : theme.subtext }]}>Standard</Text>
            </Pressable>
            <Pressable
              style={[styles.segment, mapType === 'satellite' && [styles.segmentActive, { backgroundColor: theme.card }]]}
              onPress={() => onMapTypeChange('satellite')}
              accessibilityRole="button"
              accessibilityLabel="Satellite map type"
              accessibilityState={{ selected: mapType === 'satellite' }}
            >
              <Satellite size={16} color={mapType === 'satellite' ? theme.accent : theme.subtext} />
              <Text style={[styles.segmentText, { color: mapType === 'satellite' ? theme.accent : theme.subtext }]}>Satellite</Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionLabel, { color: theme.subtext }]}>Show on Map</Text>
          <View style={[styles.overlayGroup, { backgroundColor: theme.background }]}>
            <OverlayRow label="Blocks" value={showBlockPolygons} onChange={onToggleBlocks} theme={theme} />
            <OverlayRow label="Gates" value={showGatesLayer} onChange={onToggleGates} theme={theme} />
            <OverlayRow label="Rastas" value={showRastasLayer} onChange={onToggleRastas} theme={theme} />
            <OverlayRow label="Shahr-e-Pindal" value={showSpecialRoutesLayer} onChange={onToggleSpecialRoutes} theme={theme} />
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
    borderTopLeftRadius: SHEET_CORNER_RADIUS,
    borderTopRightRadius: SHEET_CORNER_RADIUS,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    maxHeight: '70%',
    ...shadows.high,
  },
  scroll: {
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
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
    ...shadows.low,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
  },
  overlayGroup: {
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
    minHeight: 56,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
