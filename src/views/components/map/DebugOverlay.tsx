/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GRAPH_VALIDATION } from '../../../constants/data';
import { getHomeRouteDiagnostics } from '../../../viewmodels/HomeViewModel';
import { Z } from '../../styles/zLayers';

/**
 * Developer-only map tools. HomeScreen mounts these only behind `__DEV__ && developerModeEnabled`, so attendees never
 * see them and they are English on purpose (not part of the localization catalogs; the string scanners skip this file).
 */
export function DeveloperDiagnosticsBanner() {
  return (
    <View style={styles.diagnosticsBanner}>
      <Text style={styles.diagnosticsText}>
        {GRAPH_VALIDATION.isValid ? 'Graph validation: PASS' : 'Graph validation: FAIL'}
      </Text>
      {!GRAPH_VALIDATION.isValid && (
        <Text style={styles.diagnosticsText} numberOfLines={2}>
          {GRAPH_VALIDATION.errors[0]}
        </Text>
      )}
      <Text style={styles.diagnosticsText} numberOfLines={1}>
        {getHomeRouteDiagnostics().map((r) => `${r.from}->${r.to}:${r.success ? 'OK' : 'FAIL'}`).join(' | ')}
      </Text>
    </View>
  );
}

interface DeveloperMapTogglesProps {
  showGraphNodes: boolean;
  onToggleGraphNodes: () => void;
  showRastaNames: boolean;
  onToggleRastaNames: () => void;
  showRouteDiagnostics: boolean;
  onToggleRouteDiagnostics: () => void;
}

export function DeveloperMapToggles(props: DeveloperMapTogglesProps) {
  const onOff = (value: boolean) => (value ? 'ON' : 'OFF');
  return (
    <View style={styles.debugCard}>
      <Pressable style={styles.debugBtn} onPress={props.onToggleGraphNodes}>
        <Text style={styles.debugBtnText}>Nodes {onOff(props.showGraphNodes)}</Text>
      </Pressable>
      <Pressable style={styles.debugBtn} onPress={props.onToggleRastaNames}>
        <Text style={styles.debugBtnText}>Rasta Names {onOff(props.showRastaNames)}</Text>
      </Pressable>
      <Pressable style={styles.debugBtn} onPress={props.onToggleRouteDiagnostics}>
        <Text style={styles.debugBtnText}>Diagnostics {onOff(props.showRouteDiagnostics)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  diagnosticsBanner: {
    position: 'absolute',
    top: 260,
    start: 12,
    end: 12,
    backgroundColor: 'rgba(32,33,36,0.9)',
    borderRadius: 8,
    padding: 8,
    zIndex: Z.mapControls,
  },
  diagnosticsText: { color: '#FFFFFF', fontSize: 11, marginBottom: 2 },
  debugCard: {
    position: 'absolute',
    bottom: 96,
    start: 12,
    end: 12,
    backgroundColor: 'rgba(32,33,36,0.88)',
    borderRadius: 10,
    padding: 6,
    flexDirection: 'row',
    gap: 6,
    zIndex: Z.mapControls,
  },
  debugBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  debugBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
});
