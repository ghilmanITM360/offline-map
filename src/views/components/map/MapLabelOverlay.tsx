/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MapView, { Point } from 'react-native-maps';

import { mapLayerStyles as styles } from './mapLayerStyles';

export type MapLabelKind = 'gate' | 'block' | 'rasta' | 'route';
export type MapLabelVariant = 'full' | 'compact' | 'number';

export interface MapLabelItem {
  id: string;
  coordinate: { latitude: number; longitude: number };
  text: string;
  secondaryText?: string;
  kind: MapLabelKind;
  /** LOD tier — only meaningful for 'gate' (block/rasta/route labels only ever render one style). */
  variant?: MapLabelVariant;
  isSelected?: boolean;
  focused?: boolean;
  /** Gate-only warning styling. */
  needsConnectorVerification?: boolean;
  /** Renders with the compact live-navigation pill style instead of the browse-mode one. */
  navPreview?: boolean;
  /** Paint order — mirrors the zIndex values the old Marker-based labels used, so
   * cross-layer stacking (e.g. a selected gate label over a block label) is unchanged. */
  zPriority: number;
  onPress?: () => void;
  /** Spoken name when `text` is an abbreviated LOD form (e.g. gate "12" -> "Gate 12"). */
  accessibilityLabel?: string;
}

export interface MapLabelOverlayHandle {
  /** Re-projects every item's lat/lng to a screen point. Safe to call as often as
   * needed (e.g. on every native onRegionChange tick) — internally coalesced. */
  requestProjection: () => void;
}

export interface MapLabelOverlayEdgeInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface MapLabelOverlayProps {
  mapRef: React.RefObject<MapView | null>;
  items: MapLabelItem[];
  /** Disables label tap targets while true (e.g. during an active map drag, when the
   * last resolved projection may be one throttle-frame stale). */
  disableTouch?: boolean;
  /** Culls labels whose projected point falls within these distances of the
   * container edges, so they don't render under chrome overlapping the map
   * (e.g. a top search bar or a right-side control column). Optional, all
   * sides default to 0 (no culling beyond the existing offscreen check). */
  edgeInsets?: MapLabelOverlayEdgeInsets;
}

const OFFSCREEN_PAD = 40;

type Size = { width: number; height: number };

// Seed sizes so a label's first paint lands close to its final centered position
// before onLayout reports the real measured box (rasta/route labels have no
// min-size in mapLayerStyles, so their seed is a rough text-length estimate).
const GATE_FULL_SIZE: Size = { width: 108, height: 34 };
const GATE_FULL_FOCUSED_SIZE: Size = { width: 116, height: 40 };
const GATE_COMPACT_SIZE: Size = { width: 28, height: 28 };
const GATE_COMPACT_FOCUSED_SIZE: Size = { width: 34, height: 34 };
const BLOCK_SIZE: Size = { width: 58, height: 28 };
const BLOCK_FOCUSED_SIZE: Size = { width: 66, height: 32 };
const NAV_PREVIEW_SIZE: Size = { width: 40, height: 22 };

function estimateTextSize(text: string): Size {
  return { width: Math.max(24, text.length * 7 + 20), height: 24 };
}

function estimateSize(item: MapLabelItem): Size {
  if (item.kind === 'gate') {
    if (item.navPreview) return NAV_PREVIEW_SIZE;
    if (item.variant !== 'full') return item.focused ? GATE_COMPACT_FOCUSED_SIZE : GATE_COMPACT_SIZE;
    return item.focused ? GATE_FULL_FOCUSED_SIZE : GATE_FULL_SIZE;
  }
  if (item.kind === 'block') {
    return item.focused ? BLOCK_FOCUSED_SIZE : BLOCK_SIZE;
  }
  return estimateTextSize(item.text);
}

function getLabelStyles(item: MapLabelItem): { container: ViewStyle[]; text: any[]; secondary?: any } {
  const { kind, variant, isSelected, focused, needsConnectorVerification, navPreview } = item;

  if (kind === 'gate') {
    if (navPreview) {
      return {
        container: [styles.previewGateLabel, needsConnectorVerification && styles.previewGateLabelWarning].filter(Boolean) as ViewStyle[],
        text: [styles.previewLabelText],
      };
    }
    const isCompact = variant !== 'full';
    return {
      container: [
        isCompact ? styles.v2GateMarkerCompact : styles.v2GateMarker,
        isCompact && focused && styles.v2GateMarkerCompactFocused,
        !isCompact && focused && styles.v2GateMarkerFocused,
        needsConnectorVerification && styles.v2GateMarkerWarning,
        isSelected && styles.v2GateMarkerSelected,
      ].filter(Boolean) as ViewStyle[],
      text: [
        isCompact ? styles.v2GateMarkerTextCompact : styles.v2GateMarkerText,
        !isCompact && focused && styles.v2GateMarkerTextFocused,
        variant === 'number' && styles.v2GateMarkerTextNumber,
      ],
      secondary: styles.v2GateMarkerUrdu,
    };
  }

  if (kind === 'block') {
    return {
      container: [
        styles.v2BlockLabel,
        focused && styles.v2BlockLabelFocused,
        isSelected && styles.v2SelectedBlockLabel,
      ].filter(Boolean) as ViewStyle[],
      text: [styles.v2BlockLabelText, focused && styles.v2BlockLabelTextFocused, isSelected && styles.v2SelectedBlockLabelText],
      secondary: [styles.v2BlockLabelUrdu, focused && styles.v2BlockLabelUrduFocused, isSelected && styles.v2SelectedBlockLabelText],
    };
  }

  if (kind === 'rasta') {
    return {
      container: [styles.rastaLabel, focused && styles.rastaLabelFocused, isSelected && styles.v2SelectedLabel].filter(Boolean) as ViewStyle[],
      text: [styles.rastaLabelText, focused && styles.rastaLabelTextFocused],
      secondary: styles.rastaLabelUrdu,
    };
  }

  return {
    container: [styles.v2RouteLabel, focused && styles.v2RouteLabelFocused, isSelected && styles.v2SelectedLabel].filter(Boolean) as ViewStyle[],
    text: [styles.v2RouteLabelText, focused && styles.v2RouteLabelTextFocused],
    secondary: styles.v2RouteLabelUrdu,
  };
}

/**
 * Replaces react-native-maps Marker-snapshot label rendering with a plain overlay
 * positioned via MapView.pointForCoordinate — see docs/ARCHITECTURE.md
 * (Phase 5) for why: Android's native custom-marker-view snapshot capture hard-clips
 * dynamically-sized label text under this app's New Architecture runtime, and no
 * JS/style-level fix exists. pointForCoordinate goes through a different native path
 * (the AirMapModule NativeModule bridge, same pattern as the already-working
 * getCamera()) with no snapshot/capture step, so it isn't subject to that bug.
 *
 * One shared instance renders every gate/block/rasta/special-route label so
 * cross-layer stacking (zPriority) is a single sort instead of four independent
 * component trees fighting over paint order.
 */
export const MapLabelOverlay = React.forwardRef<MapLabelOverlayHandle, MapLabelOverlayProps>(
  function MapLabelOverlay({ mapRef, items, disableTouch, edgeInsets }, ref) {
    const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
    const [points, setPoints] = useState<Record<string, Point>>({});
    const [measuredSizes, setMeasuredSizes] = useState<Record<string, Size>>({});
    const inFlightRef = useRef(false);
    const pendingRef = useRef(false);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    // project()'s rAF + Promise.all(pointForCoordinate) chain has no native cancellation —
    // guards its own state-setting continuation instead, so a projection started before
    // unmount can't call setPoints (or re-trigger itself via pendingRef) after unmount.
    const mountedRef = useRef(true);
    useEffect(() => {
      return () => {
        mountedRef.current = false;
      };
    }, []);

    // rAF-gated in-flight coalescing: while a projection batch is running, drop
    // intermediate calls (onRegionChange can fire many times per second during a
    // gesture) and re-project once more against the latest items when it resolves,
    // instead of queuing every tick or lagging behind a fixed debounce delay.
    const project = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;
      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }
      inFlightRef.current = true;
      pendingRef.current = false;
      requestAnimationFrame(() => {
        const currentItems = itemsRef.current;
        Promise.all(
          currentItems.map((item) => {
            // The native call throws synchronously for a coordinate it cannot read (seen on a release build:
            // "Expected argument 0 ... to be a number, but got null"). Uncaught inside this rAF callback that tears
            // down the React host and blanks the whole screen, so a bad item must only lose its own label.
            try {
              return map
                .pointForCoordinate(item.coordinate)
                .then((point) => [item.id, point] as const)
                .catch(() => null);
            } catch {
              return Promise.resolve(null);
            }
          }),
        )
          .then((resolved) => {
            if (!mountedRef.current) return;
            const next: Record<string, Point> = {};
            resolved.forEach((entry) => {
              if (entry) next[entry[0]] = entry[1];
            });
            setPoints(next);
          })
          .finally(() => {
            inFlightRef.current = false;
            if (mountedRef.current && pendingRef.current) {
              pendingRef.current = false;
              project();
            }
          });
      });
    }, [mapRef]);

    useImperativeHandle(ref, () => ({ requestProjection: project }), [project]);

    useEffect(() => {
      project();
    }, [items, project]);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerSize({ width, height });
    }, []);

    const handleItemLayout = useCallback((id: string, e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setMeasuredSizes((prev) => {
        const existing = prev[id];
        if (existing && existing.width === width && existing.height === height) return prev;
        return { ...prev, [id]: { width, height } };
      });
    }, []);

    return (
      <View
        testID="map-label-overlay"
        style={StyleSheet.absoluteFillObject}
        pointerEvents="box-none"
        onLayout={handleLayout}
      >
        {items.map((item) => {
          const point = points[item.id];
          if (!point) return null;
          const size = measuredSizes[item.id] ?? estimateSize(item);
          if (containerSize.width > 0 && containerSize.height > 0) {
            const offscreen =
              point.x < -OFFSCREEN_PAD ||
              point.x > containerSize.width + OFFSCREEN_PAD ||
              point.y < -OFFSCREEN_PAD ||
              point.y > containerSize.height + OFFSCREEN_PAD ||
              point.y < (edgeInsets?.top ?? 0) ||
              point.x > containerSize.width - (edgeInsets?.right ?? 0) ||
              point.y + size.height / 2 > containerSize.height - (edgeInsets?.bottom ?? 0) ||
              point.x < (edgeInsets?.left ?? 0);
            if (offscreen) return null;
          }

          const labelStyles = getLabelStyles(item);
          const spokenLabel = item.accessibilityLabel ?? (item.secondaryText ? `${item.text}, ${item.secondaryText}` : item.text);
          const content = (
            <View style={labelStyles.container} onLayout={(e) => handleItemLayout(item.id, e)}>
              <Text style={labelStyles.text}>{item.text}</Text>
              {item.secondaryText && <Text style={labelStyles.secondary}>{item.secondaryText}</Text>}
            </View>
          );

          const wrapperStyle = {
            position: 'absolute' as const,
            left: point.x - size.width / 2,
            top: point.y - size.height / 2,
            zIndex: item.zPriority,
          };

          if (item.onPress && !disableTouch) {
            return (
              <Pressable
                key={item.id}
                style={wrapperStyle}
                onPress={item.onPress}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={spokenLabel}
              >
                {content}
              </Pressable>
            );
          }
          return (
            <View
              key={item.id}
              style={wrapperStyle}
              pointerEvents="none"
              accessible
              accessibilityLabel={spokenLabel}
            >
              {content}
            </View>
          );
        })}
      </View>
    );
  },
);
