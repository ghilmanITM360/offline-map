/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';
import { AlertTriangle, Check, Compass, Ellipsis, Layers, LocateFixed, Minus, Navigation, Plus, X } from 'lucide-react-native';

import { mapControlStyles as styles } from './mapControlStyles';
import { staticColors } from '../../../theme';
import { CompassMode } from '../../../viewmodels/useCameraManager';
import { useReducedMotion } from '../../../viewmodels/useReducedMotion';

export interface MapControlsRecenter {
  /** 'active' = CameraManager is in FOLLOWING_USER mode (Google-Maps-style sustained
   * follow, entered by tapping recenter, exited by panning the map) — distinct from the
   * transient 'success' checkmark, which only confirms the tap itself resolved. */
  state: 'idle' | 'loading' | 'success' | 'failure' | 'active';
  onPress: () => void;
}

interface MapControlsProps {
  /** 'browse' also offers Layers under "More map controls"; 'nav' omits it
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

  // Confirms the recenter tap actually resolved — the icon otherwise hard-cuts from a
  // spinner straight to a static checkmark with no feedback the action succeeded.
  // React-Bits-inspired ("SpringCheck" pattern under Micro), adapted to RN's own Animated
  // (this codebase's existing animation convention — see NavigationChromeV2,
  // LocationTutorialTooltip — not react-native-reanimated, which nothing here uses yet).
  const successScale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (recenter?.state !== 'success') return;
    if (reducedMotion) {
      successScale.setValue(1);
      return;
    }
    successScale.setValue(0.6);
    Animated.spring(successScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 140 }).start();
  }, [recenter?.state, reducedMotion, successScale]);

  // Only what people use constantly stays in view: direction and recenter. Layers and zoom (pinch also zooms) live
  // behind one "More map controls" button, and stay real buttons so TalkBack / keyboard users can zoom.
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {moreOpen && variant === 'browse' && (
        <Pressable
          style={styles.controlButton}
          onPress={() => {
            setMoreOpen(false);
            onLayers?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Map layers and filters"
        >
          <Layers size={22} color={staticColors.iconMuted} />
        </Pressable>
      )}
      {moreOpen && (
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
      )}
      <Pressable
        style={[styles.controlButton, moreOpen && styles.moreButtonOpen]}
        onPress={() => setMoreOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel="More map controls"
        accessibilityState={{ expanded: moreOpen }}
      >
        {moreOpen ? <X size={22} color={staticColors.iconMuted} /> : <Ellipsis size={22} color={staticColors.iconMuted} />}
      </Pressable>
      <Pressable
        style={[styles.controlButton, isHeadingFollow && styles.controlButtonActive]}
        onPress={onCompassToggle}
        accessibilityRole="button"
        accessibilityLabel={
          isHeadingFollow
            ? 'Follow direction is on. The map turns to face the way you are moving. Tap to return to north-up.'
            : 'Follow direction is off. Tap to turn the map to face the way you are moving.'
        }
      >
        {/* The icon carries the state (arrow = following, compass = north-up), not only its colour. */}
        {isHeadingFollow ? (
          <Navigation size={22} color={staticColors.info} />
        ) : (
          <Compass size={22} color={staticColors.iconMuted} />
        )}
      </Pressable>
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
              <Animated.View style={{ transform: [{ scale: successScale }] }}>
                <Check size={24} color={staticColors.success} />
              </Animated.View>
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
