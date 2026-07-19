/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { MapLocalizationService } from '../../../services/MapLocalizationService';
import { HIGH_ZOOM, MEDIUM_ZOOM, DEFAULT_ZOOM, V2GateLayer } from '../../../services/V2MapRenderingService';
import { mapLayerStyles as styles } from './mapLayerStyles';

interface GateLayerProps {
  gates: V2GateLayer[];
  variant: 'home' | 'nav';
  /** Home-only: true when the "gates" map filter is active. */
  focused?: boolean;
  /** Home-only: current map camera zoom, drives full/compact/number label LOD. */
  zoomLevel?: number;
  /** Home-only: suppresses tracksViewChanges thrash mid label-LOD transition. */
  transitioning?: boolean;
  onPressGate?: (gateId: string) => void;
  keyPrefix: string;
}

function GateLayerImpl({ gates, variant, focused = false, zoomLevel = DEFAULT_ZOOM, transitioning = false, onPressGate, keyPrefix }: GateLayerProps) {
  if (variant === 'nav') {
    return (
      <>
        {gates.map((gate) => (
          <Marker key={`${keyPrefix}_${gate.id}`} coordinate={gate.coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <View style={[styles.previewGateLabel, gate.needsConnectorVerification && styles.previewGateLabelWarning]}>
              <Text style={styles.previewLabelText}>{gate.label.replace('Gate ', 'G')}</Text>
            </View>
          </Marker>
        ))}
      </>
    );
  }

  return (
    <>
      {gates.map((gate) => {
        // Collision-suppressed gates still render (a real gate should never
        // vanish from the map) but as a plain dot instead of overlapping
        // label text — never applied to the selected gate.
        const dotOnly = gate.labelSuppressed && !gate.isSelected;
        if (dotOnly) {
          return (
            <Marker
              key={`${keyPrefix}_${gate.id}`}
              coordinate={gate.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={focused ? 13 : 11}
              tracksViewChanges={transitioning}
              onPress={() => onPressGate?.(gate.id)}
            >
              <View style={[styles.v2GateMarkerDot, gate.needsConnectorVerification && styles.v2GateMarkerWarning]} />
            </Marker>
          );
        }

        const gateNum = gate.label.replace('Gate ', '');
        const showFull = gate.isSelected || zoomLevel >= HIGH_ZOOM;
        const showCompact = !showFull && zoomLevel >= MEDIUM_ZOOM;
        const showNumber = !showFull && !showCompact;
        const displayLabel = showFull ? gate.label : showCompact ? `G${gateNum}` : gateNum;
        const isCompact = !showFull;
        const urduName = showFull ? MapLocalizationService.getSecondaryLabel(gate.name) : undefined;
        return (
          <Marker
            // KNOWN ISSUE (not fixed by this key, kept anyway as reasonable practice):
            // the full "Gate NN" label can render hard-clipped on Android ("Gat[e] 08").
            // Confirmed via onLayout logging that RN itself measures the box correctly
            // (108x49.7dp) — the clip happens in react-native-maps' native marker
            // snapshot capture, downstream of JS/style. Tried and individually
            // cold-boot-verified NOT to fix it: tracksViewChanges toggling (both the
            // transitioning-window version and permanently true), this content-keyed
            // remount, deterministic minWidth/minHeight, fixed width/height, and
            // collapsable={false} on the child. A seventh attempt — a shared
            // MapLabelBubble computing per-text pixel width/height before first mount
            // (replacing the static minWidth with a dynamic one) — was also cold-boot
            // verified NOT to fix it (see git history for the reverted
            // MapLabelBubble.tsx). While verifying that attempt, cold-boot testing at
            // a dense block-cluster zoom also surfaced the *same* clip pattern on
            // Block labels ("Bloc[k] NN") on this unmodified, reverted code — so the
            // bug's scope is wider than previously documented (affects Block labels
            // too, not just Gates), not something the MapLabelBubble attempt
            // introduced. Every attempt so far has kept the marker child as a
            // JS-composed View/Text tree, and the native Android snapshot step is the
            // common failure point across all of them. Root cause is very likely a
            // react-native-maps custom-marker-view incompatibility with this app's
            // New Architecture ("Bridgeless") runtime.
            // Needs either a react-native-maps version change, disabling New
            // Architecture for this app, or replacing the marker-snapshot pipeline
            // entirely (e.g. rendering labels as a plain overlay above the MapView,
            // positioned via manual coordinate-to-screen projection, instead of as
            // Marker children) — not a style fix. See docs/TARGETED_FIX_SPRINT_REPORT.md.
            key={`${keyPrefix}_${gate.id}_${displayLabel}_${isCompact ? 'c' : 'f'}_${gate.isSelected ? 's' : 'u'}`}
            coordinate={gate.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={gate.isSelected ? 16 : focused ? 14 : 12}
            tracksViewChanges={transitioning}
            onPress={() => onPressGate?.(gate.id)}
          >
            <View
              collapsable={false}
              style={[
                isCompact ? styles.v2GateMarkerCompact : styles.v2GateMarker,
                isCompact && focused && styles.v2GateMarkerCompactFocused,
                !isCompact && focused && styles.v2GateMarkerFocused,
                gate.needsConnectorVerification && styles.v2GateMarkerWarning,
                gate.isSelected && styles.v2GateMarkerSelected,
              ]}
            >
              <Text
                style={[
                  isCompact ? styles.v2GateMarkerTextCompact : styles.v2GateMarkerText,
                  !isCompact && focused && styles.v2GateMarkerTextFocused,
                  showNumber && styles.v2GateMarkerTextNumber,
                ]}
              >
                {displayLabel}
              </Text>
              {urduName && <Text style={styles.v2GateMarkerUrdu}>{urduName}</Text>}
            </View>
          </Marker>
        );
      })}
    </>
  );
}

export const GateLayer = React.memo(GateLayerImpl);
