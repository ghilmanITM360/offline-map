/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AlertTriangle, Check, Compass, Layers, LocateFixed, Minus, Plus } from 'lucide-react-native';

import { mapControlStyles as styles } from './mapControlStyles';

export interface MapControlsRecenter {
  state: 'idle' | 'loading' | 'success' | 'failure';
  onPress: () => void;
}

interface MapControlsProps {
  /** 'browse' shows the Layers button + north-up/free-rotate helper badge; 'nav' omits both
   * (no layer switching while actively navigating, per Phase 2's control-stack scoping). */
  variant: 'browse' | 'nav';
  keepNorthFixed: boolean;
  onLayers?: () => void;
  onCompassReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Renders the recenter/"current location" button as the last item in this same
   * stack (Google Maps ordering: Layers → Compass → Zoom+ → Zoom− → Current
   * location) so it can never end up positioned independently of the rest of the
   * cluster and collide with it. Omit to render no recenter button (e.g. nav mode,
   * which has its own separate recenter button elsewhere in its chrome). */
  recenter?: MapControlsRecenter;
}

/** Shared floating Layers/Compass/Zoom/Recenter control stack, rendered identically
 * by HomeScreen's browse mode and its live-navigation overlay. Purely presentational
 * and owns the full vertical arrangement (single source of truth for inter-button
 * spacing) — the caller only owns the stack's own absolute position (bottom/right
 * offset), not the layout of what's inside it. */
export function MapControls({ variant, keepNorthFixed, onLayers, onCompassReset, onZoomIn, onZoomOut, recenter }: MapControlsProps) {
  return (
    <>
      {variant === 'browse' && (
        <Pressable style={styles.controlButton} onPress={onLayers}>
          <Layers size={22} color="#5F6368" />
        </Pressable>
      )}
      <Pressable
        style={[styles.controlButton, keepNorthFixed && styles.controlButtonActive]}
        onPress={onCompassReset}
      >
        <Compass size={22} color={keepNorthFixed ? '#1A73E8' : '#5F6368'} />
      </Pressable>
      {variant === 'browse' && (
        <View style={styles.controlHelperBadge}>
          <Text style={styles.controlHelperText}>{keepNorthFixed ? 'North-up' : 'Free rotate'}</Text>
        </View>
      )}
      <View style={styles.zoomControls}>
        <Pressable style={styles.zoomButton} onPress={onZoomIn}>
          <Plus size={22} color="#5F6368" />
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable style={styles.zoomButton} onPress={onZoomOut}>
          <Minus size={22} color="#5F6368" />
        </Pressable>
      </View>
      {recenter && (
        <View style={styles.recenterButtonWrap}>
          <Pressable style={styles.recenterButton} disabled={recenter.state === 'loading'} onPress={recenter.onPress}>
            {recenter.state === 'loading' ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : recenter.state === 'success' ? (
              <Check size={24} color="#2E7D32" />
            ) : recenter.state === 'failure' ? (
              <AlertTriangle size={22} color="#EA4335" />
            ) : (
              <LocateFixed size={24} color="#4285F4" />
            )}
          </Pressable>
        </View>
      )}
    </>
  );
}
