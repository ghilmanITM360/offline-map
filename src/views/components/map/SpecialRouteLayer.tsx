/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { MapLocalizationService } from '../../../services/MapLocalizationService';
import { V2PolylineLayer } from '../../../services/V2MapRenderingService';
import { mapLayerStyles as styles } from './mapLayerStyles';

interface SpecialRouteLayerProps {
  routes: V2PolylineLayer[];
  labels: V2PolylineLayer[];
  variant: 'home' | 'nav';
  /** Home-only: true when the "special_routes" map filter is active. */
  focused?: boolean;
  /** Home-only: suppresses tracksViewChanges thrash mid label-LOD transition — see GateLayer. */
  transitioning?: boolean;
  keyPrefix: string;
}

function SpecialRouteLayerImpl({ routes, labels, variant, focused = false, transitioning = false, keyPrefix }: SpecialRouteLayerProps) {
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
        </React.Fragment>
      ))}

      {labels.map((route) => {
        const urduName = MapLocalizationService.getSecondaryLabel(route.name);
        return (
          <Marker
            // Keyed on focused/isSelected — see BlockLayer's identical fix + comment.
            key={`${keyPrefix}_label_${route.id}_${focused ? 'f' : 'u'}_${route.isSelected ? 's' : 'u'}`}
            coordinate={route.labelCoordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={9}
            tracksViewChanges={transitioning}
          >
            <View style={[styles.v2RouteLabel, focused && styles.v2RouteLabelFocused, route.isSelected && styles.v2SelectedLabel]}>
              <Text style={[styles.v2RouteLabelText, focused && styles.v2RouteLabelTextFocused]}>{route.label}</Text>
              {urduName && <Text style={styles.v2RouteLabelUrdu}>{urduName}</Text>}
            </View>
          </Marker>
        );
      })}
    </>
  );
}

export const SpecialRouteLayer = React.memo(SpecialRouteLayerImpl);
