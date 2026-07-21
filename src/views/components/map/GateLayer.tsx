/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';

import { V2GateLayer } from '../../../services/V2MapRenderingService';
import { mapLayerStyles as styles } from './mapLayerStyles';

interface GateLayerProps {
  gates: V2GateLayer[];
  /** True when this gate's label would visually collide with a higher-priority
   * neighbor and is being suppressed in favor of a plain dot — this is the only
   * case GateLayer itself still renders a Marker for; the full/compact/number
   * label text renders via MapLabelOverlay (see HomeScreen's mapLabelItems). */
  focused?: boolean;
  onPressGate?: (gateId: string) => void;
  keyPrefix: string;
}

/** Renders gate touch-target dots. Label text (Gate NN / GNN / NN) is rendered by
 * MapLabelOverlay instead of as Marker children — see docs/TARGETED_FIX_SPRINT_REPORT.md
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
        return (
          <Marker
            key={`${keyPrefix}_${gate.id}`}
            coordinate={gate.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={gate.isSelected ? 16 : focused ? 14 : 12}
            tracksViewChanges={false}
            onPress={() => onPressGate?.(gate.id)}
          >
            <View style={[styles.v2GateMarkerDot, gate.needsConnectorVerification && styles.v2GateMarkerWarning]} />
          </Marker>
        );
      })}
    </>
  );
}

export const GateLayer = React.memo(GateLayerImpl);
