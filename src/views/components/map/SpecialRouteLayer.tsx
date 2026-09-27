/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Polyline } from 'react-native-maps';

import { V2PolylineLayer } from '../../../services/V2MapRenderingService';
import { Coordinate } from '../../../models/types';

interface SpecialRouteLayerProps {
  routes: V2PolylineLayer[];
  variant: 'home' | 'nav';
  /** Home-only: true when the "special_routes" map filter is active. */
  focused?: boolean;
  keyPrefix: string;
  /** Home-only: makes the polyline itself tappable (Google Maps parity — the visible
   * line is the touch target, not just its MapLabelOverlay label pill). coordinate is
   * the hit point on the corridor (Android only), passed through for HomeScreen's
   * tap disambiguator. */
  onPressRoute?: (routeId: string, coordinate?: Coordinate) => void;
}

// Route labels render via MapLabelOverlay (see HomeScreen's mapLabelItems), not as
// Marker children here — see GateLayer.tsx for why (Android marker-snapshot clipping).
function SpecialRouteLayerImpl({ routes, variant, focused = false, keyPrefix, onPressRoute }: SpecialRouteLayerProps) {
  if (variant === 'nav') {
    return (
      <>
        {routes.map((route) => (
          <Polyline
            key={`${keyPrefix}_${route.id}`}
            coordinates={route.polyline}
            strokeColor={route.isSelected ? '#8E24AA' : 'rgba(142,36,170,0.48)'}
            strokeWidth={route.isSelected ? 5 : 3}
            zIndex={3}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {routes.map((route) => (
        <React.Fragment key={`${keyPrefix}_${route.id}`}>
          <Polyline
            coordinates={route.polyline}
            strokeColor={route.isSelected ? '#6A0DAD' : focused ? 'rgba(106,13,173,0.65)' : 'rgba(142,36,170,0.55)'}
            strokeWidth={route.isSelected ? 7 : focused ? 8 : 3}
            zIndex={route.isSelected ? 10 : focused ? 6 : 4}
          />
          {focused && (
            <Polyline coordinates={route.polyline} strokeColor="rgba(255,255,255,0.55)" strokeWidth={3} zIndex={route.isSelected ? 11 : 7} />
          )}
          {onPressRoute && (
            // Near-invisible wide hit target on top of the visible line — see RastaLayer
            // for why (thin strokes are unreliable tap targets; Google Maps parity expects
            // the whole visible path, including at low zoom where its label is hidden, to
            // be tappable). Only 3 special routes exist and they run far apart, so the
            // adjacent-line collision risk RastaLayer tunes for doesn't apply here — kept
            // slightly wider than Rasta's hit width since there's no crosstalk to trade off.
            <Polyline
              coordinates={route.polyline}
              strokeColor="rgba(0,0,0,0.01)"
              strokeWidth={18}
              zIndex={20}
              tappable
              accessibilityLabel={route.label}
              onPress={(e) => onPressRoute(route.id, e.nativeEvent.coordinate)}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
}

export const SpecialRouteLayer = React.memo(SpecialRouteLayerImpl);
