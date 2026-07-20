/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { V2PolylineLayer } from '../../../services/V2MapRenderingService';
import { mapLayerStyles as styles } from './mapLayerStyles';

interface RastaLayerProps {
  rastas: V2PolylineLayer[];
  /** 'home' renders focus/selection-aware styling; 'nav' renders the simpler read-only style. */
  variant: 'home' | 'nav';
  /** Home-only: true when the "rastas" map filter is active. */
  focused?: boolean;
  keyPrefix: string;
}

// Rasta labels render via MapLabelOverlay (see HomeScreen's mapLabelItems), not as
// Marker children here — see GateLayer.tsx for why (Android marker-snapshot clipping).
function RastaLayerImpl({ rastas, variant, focused = false, keyPrefix }: RastaLayerProps) {
  if (variant === 'nav') {
    return (
      <>
        {rastas.map((rasta) => (
          <React.Fragment key={`${keyPrefix}_${rasta.id}`}>
            <Polyline coordinates={rasta.polyline} strokeColor="rgba(60,64,67,0.38)" strokeWidth={7} zIndex={1} />
            <Polyline
              coordinates={rasta.polyline}
              strokeColor={rasta.isSelected ? '#1A73E8' : 'rgba(255,255,255,0.86)'}
              strokeWidth={rasta.isSelected ? 5 : 4}
              zIndex={2}
            />
          </React.Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      {rastas.map((rasta) => {
        const start = rasta.polyline[0];
        const end = rasta.polyline[rasta.polyline.length - 1];
        const dotColor = rasta.isSelected ? '#1A73E8' : focused ? '#E65100' : 'rgba(60,64,67,0.75)';
        const dotStyle = rasta.isSelected || focused ? styles.rastaEndpointDotEmphasized : styles.rastaEndpointDot;
        return (
          <React.Fragment key={`${keyPrefix}_${rasta.id}`}>
            <Polyline
              coordinates={rasta.polyline}
              strokeColor={rasta.isSelected ? 'rgba(26,115,232,0.55)' : focused ? 'rgba(230,81,0,0.55)' : 'rgba(60,64,67,0.44)'}
              strokeWidth={rasta.isSelected ? 11 : focused ? 12 : 7}
              zIndex={rasta.isSelected ? 8 : focused ? 4 : 2}
            />
            <Polyline
              coordinates={rasta.polyline}
              strokeColor={rasta.isSelected ? '#1A73E8' : focused ? '#E65100' : 'rgba(255,255,255,0.9)'}
              strokeWidth={rasta.isSelected ? 6 : focused ? 7 : 4}
              zIndex={rasta.isSelected ? 9 : focused ? 5 : 3}
            />
            {start && end && (
              <>
                <Marker coordinate={start} anchor={{ x: 0.5, y: 0.5 }} zIndex={6} tracksViewChanges={false}>
                  <View style={[dotStyle, { borderColor: dotColor }]} />
                </Marker>
                <Marker coordinate={end} anchor={{ x: 0.5, y: 0.5 }} zIndex={6} tracksViewChanges={false}>
                  <View style={[dotStyle, { borderColor: dotColor }]} />
                </Marker>
              </>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

export const RastaLayer = React.memo(RastaLayerImpl);
