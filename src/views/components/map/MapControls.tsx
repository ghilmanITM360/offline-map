/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Compass, Layers, Minus, Plus } from 'lucide-react-native';

import { mapControlStyles as styles } from './mapControlStyles';

interface MapControlsProps {
  /** 'browse' shows the Layers button + north-up/free-rotate helper badge; 'nav' omits both
   * (no layer switching while actively navigating, per Phase 2's control-stack scoping). */
  variant: 'browse' | 'nav';
  keepNorthFixed: boolean;
  onLayers?: () => void;
  onCompassReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/** Shared floating Compass + Zoom (+ Layers, browse-only) control cluster, rendered
 * identically by HomeScreen's browse mode and its live-navigation overlay — previously
 * two independently hand-rolled copies of the same buttons. Purely presentational: the
 * caller owns absolute positioning (top/bottom/right differ by mode and by what other
 * chrome is on screen), this component only renders the stack's contents. */
export function MapControls({ variant, keepNorthFixed, onLayers, onCompassReset, onZoomIn, onZoomOut }: MapControlsProps) {
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
    </>
  );
}
