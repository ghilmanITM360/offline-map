/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, Satellite, Map as MapIcon, X } from 'lucide-react-native';

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

function OverlayRow({ label, value, onChange }: { label: string; value: boolean; onChange: (val: boolean) => void }) {
  return (
    <Pressable style={styles.row} onPress={() => onChange(!value)}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#DADCE0', true: '#1A73E8' }}
        thumbColor="#FFFFFF"
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

  // Modal renders as its own native layer and already blocks touches from reaching the
  // MapView underneath — no extra interaction-lock prop needed here. The caller (HomeScreen)
  // additionally disables the MapView's own scroll/zoom/rotate while this is open, as
  // belt-and-suspenders against any camera animation continuing behind the sheet.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Layers size={18} color="#202124" />
            <Text style={styles.headerTitle}>Map Layers</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={20} color="#5F6368" />
          </Pressable>
        </View>

        <ScrollView bounces={false}>
          <Text style={styles.sectionLabel}>Map Type</Text>
          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.segment, mapType === 'standard' && styles.segmentActive]}
              onPress={() => onMapTypeChange('standard')}
            >
              <MapIcon size={16} color={mapType === 'standard' ? '#1A73E8' : '#5F6368'} />
              <Text style={[styles.segmentText, mapType === 'standard' && styles.segmentTextActive]}>Standard</Text>
            </Pressable>
            <Pressable
              style={[styles.segment, mapType === 'satellite' && styles.segmentActive]}
              onPress={() => onMapTypeChange('satellite')}
            >
              <Satellite size={16} color={mapType === 'satellite' ? '#1A73E8' : '#5F6368'} />
              <Text style={[styles.segmentText, mapType === 'satellite' && styles.segmentTextActive]}>Satellite</Text>
            </Pressable>
          </View>

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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DADCE0',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F3F4',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F6368',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F4',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#5F6368',
  },
  segmentTextActive: {
    color: '#1A73E8',
  },
  overlayGroup: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
