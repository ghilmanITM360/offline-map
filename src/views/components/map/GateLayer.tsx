/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';

import { V2GateLayer } from '../../../services/V2MapRenderingService';
import { Coordinate } from '../../../models/types';
import { mapLayerStyles as styles } from './mapLayerStyles';

interface GateLayerProps {
  gates: V2GateLayer[];
  /** True when this gate's label would visually collide with a higher-priority
   * neighbor and is being suppressed in favor of a plain dot — this is the only
   * case GateLayer itself still renders a Marker for; the full/compact/number
   * label text renders via MapLabelOverlay (see HomeScreen's mapLabelItems). */
  focused?: boolean;
  /** coordinate is the Marker's own press-event coordinate (always reported,
   * cross-platform) — passed through so HomeScreen's tap disambiguator can
   * resolve which object wins when this Marker's hit area overlaps another
   * layer's (e.g. a widened gate dot over a rasta hit-corridor). */
  onPressGate?: (gateId: string, coordinate: Coordinate) => void;
  keyPrefix: string;
}

/** Renders gate touch-target dots. Label text (Gate NN / GNN / NN) is rendered by
 * MapLabelOverlay instead of as Marker children — see docs/ARCHITECTURE.md
 * (Phase 5) for why: react-native-maps' native Android marker-snapshot capture hard-clips
 * dynamically-sized label text under this app's New Architecture runtime, with no
 * JS/style-level fix. A dot is fixed-size and unaffected, so it stays a Marker (native
 * hit-testing, always in sync with the true render). */
function GateLayerImpl({ gates, focused = false, onPressGate, keyPrefix }: GateLayerProps) {
  return (
    <>
      {gates.map((gate) => {
        // Collision-suppressed gates render as a plain dot instead of overlapping
        // label text — never applied to the selected gate. Non-suppressed gates
        // still get a dot here (the always-accurate native tap target); their
        // label text is a separate MapLabelOverlay item at the same coordinate.
        const dot = (
          <View style={[styles.v2GateMarkerDot, gate.needsConnectorVerification && styles.v2GateMarkerWarning]} />
        );
        // Suppressed + unselected gates lose their MapLabelOverlay Pressable entirely
        // (HomeScreen's mapLabelItems skips pushing a label item in exactly this case),
        // leaving this Marker's ~10px dot as the only tap target. Widen the Marker's own
        // child bounds for that case only — same "invisible wide hit area" idea
        // RastaLayer/SpecialRouteLayer use via a transparent Polyline hit corridor,
        // adapted to a point marker since react-native-maps' Marker has no hitSlop.
        const needsWiderHitArea = gate.labelSuppressed && !gate.isSelected;
        return (
          <Marker
            key={`${keyPrefix}_${gate.id}`}
            coordinate={gate.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={gate.isSelected ? 16 : focused ? 14 : 12}
            tracksViewChanges={false}
            // Only when MapLabelOverlay has no item for this gate (same condition HomeScreen's
            // mapLabelItems skips on) — otherwise TalkBack would reach the gate twice.
            accessibilityLabel={needsWiderHitArea ? gate.label : undefined}
            onPress={(e) => onPressGate?.(gate.id, e.nativeEvent.coordinate)}
          >
            {needsWiderHitArea ? <View style={styles.v2GateMarkerHitArea}>{dot}</View> : dot}
          </Marker>
        );
      })}
    </>
  );
}

export const GateLayer = React.memo(GateLayerImpl);
