/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AlertTriangle, Check, Compass, Layers, LocateFixed, Minus, Plus } from 'lucide-react-native';

import { mapControlStyles as styles } from './mapControlStyles';
import { staticColors } from '../../../theme';
import { CompassMode } from '../../../viewmodels/useCameraManager';

export interface MapControlsRecenter {
  /** 'active' = CameraManager is in FOLLOWING_USER mode (Google-Maps-style sustained
   * follow, entered by tapping recenter, exited by panning the map) — distinct from the
   * transient 'success' checkmark, which only confirms the tap itself resolved. */
  state: 'idle' | 'loading' | 'success' | 'failure' | 'active';
  onPress: () => void;
}

interface MapControlsProps {
  /** 'browse' shows the Layers button + north-up/free-rotate helper badge; 'nav' omits both
   * (no layer switching while actively navigating, per Phase 2's control-stack scoping). */
  variant: 'browse' | 'nav';
  /** NORTH_UP (resting, neutral icon) vs FOLLOW_HEADING (bearing tracks device compass,
   * blue active icon) — see useCameraManager's CompassMode and HomeViewModel's
   * handleCompassToggle for the tap-to-cycle behavior. */
  compassMode: CompassMode;
  onLayers?: () => void;
  onCompassToggle: () => void;
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
export function MapControls({ variant, compassMode, onLayers, onCompassToggle, onZoomIn, onZoomOut, recenter }: MapControlsProps) {
  const isHeadingFollow = compassMode === 'FOLLOW_HEADING';
  return (
    <>
      {variant === 'browse' && (
        <Pressable
          style={styles.controlButton}
          onPress={onLayers}
          accessibilityRole="button"
          accessibilityLabel="Map layers and filters"
        >
          <Layers size={22} color={staticColors.iconMuted} />
        </Pressable>
      )}
      <Pressable
        style={[styles.controlButton, isHeadingFollow && styles.controlButtonActive]}
        onPress={onCompassToggle}
        accessibilityRole="button"
        accessibilityLabel={
          isHeadingFollow ? 'Map rotates with your compass heading. Tap to return to north-up.' : 'Map is north-up. Tap to rotate with your compass heading.'
        }
      >
        <Compass size={22} color={isHeadingFollow ? staticColors.info : staticColors.iconMuted} />
      </Pressable>
      {variant === 'browse' && (
        <View style={styles.controlHelperBadge}>
          <Text style={styles.controlHelperText}>{isHeadingFollow ? 'Compass' : 'North-up'}</Text>
        </View>
      )}
      <View style={styles.zoomControls}>
        <Pressable
          style={styles.zoomButton}
          onPress={onZoomIn}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Plus size={22} color={staticColors.iconMuted} />
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable
          style={styles.zoomButton}
          onPress={onZoomOut}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Minus size={22} color={staticColors.iconMuted} />
        </Pressable>
      </View>
      {recenter && (
        <View style={styles.recenterButtonWrap}>
          <Pressable
            style={[styles.recenterButton, recenter.state === 'active' && styles.recenterButtonActive]}
            disabled={recenter.state === 'loading'}
            onPress={recenter.onPress}
            accessibilityRole="button"
            accessibilityLabel={
              recenter.state === 'active'
                ? 'Following my current location. Tap to re-center.'
                : 'Center map on my current location'
            }
          >
            {recenter.state === 'loading' ? (
              <ActivityIndicator size="small" color={staticColors.recenterBlue} />
            ) : recenter.state === 'success' ? (
              <Check size={24} color={staticColors.success} />
            ) : recenter.state === 'failure' ? (
              <AlertTriangle size={22} color={staticColors.gateAccent} />
            ) : (
              <LocateFixed size={24} color={staticColors.recenterBlue} />
            )}
          </Pressable>
        </View>
      )}
    </>
  );
}
