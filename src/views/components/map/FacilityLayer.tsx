/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View } from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import { Bus, Droplet, HelpCircle, Landmark, ParkingCircle, Search as SearchGlyph, Stethoscope, Utensils } from 'lucide-react-native';

import { Coordinate, Place } from '../../../models/types';
import { markerSizes, staticColors } from '../../../theme';
import { mapLayerStyles as styles } from './mapLayerStyles';

/** Icon per facility, keyed off the legacy LANDMARK_PLACES id prefix — these ids
 * (LM_FOOD_*, LM_WATER_*, ...) are the only signal available for sub-category,
 * since PlaceCommon.category only distinguishes 'Masjid' from the catch-all
 * 'Landmark'. See src/constants/data.ts LANDMARK_PLACES. */
function facilityIcon(place: Place, size: number, color: string) {
  if (place.category === 'Masjid') return <Landmark size={size} color={color} />;
  if (place.id.startsWith('LM_FOOD')) return <Utensils size={size} color={color} />;
  if (place.id.startsWith('LM_WATER')) return <Droplet size={size} color={color} />;
  if (place.id.startsWith('LM_MEDICAL')) return <Stethoscope size={size} color={color} />;
  if (place.id.startsWith('LM_PARKING')) return <ParkingCircle size={size} color={color} />;
  if (place.id.startsWith('LM_BUS')) return <Bus size={size} color={color} />;
  if (place.id.startsWith('LM_LOST_FOUND')) return <SearchGlyph size={size} color={color} />;
  if (place.id.startsWith('LM_VOLUNTEER')) return <HelpCircle size={size} color={color} />;
  return <Landmark size={size} color={color} />;
}

interface FacilityLayerProps {
  places: Place[];
  selectedPlaceId?: string;
  /** coordinate is the Marker's own press-event coordinate (always reported,
   * cross-platform), passed through for HomeScreen's tap disambiguator. */
  onPressFacility: (place: Place, coordinate?: Coordinate) => void;
}

/** Google-Maps-POI-style tappable markers for facilities (masjid, food, water,
 * medical, parking, terminals, help/lost-and-found) — the legacy `LANDMARK_PLACES`
 * dataset already carries routable coordinates (see LANDMARK_NEAREST_NODE in
 * src/constants/data.ts, consumed by RoutingService.resolveDestinationNodesFromPlace),
 * they were just never rendered as map objects. Routes through the same universal
 * handlePlaceSelect -> LocationSheet -> Directions chain as blocks/gates — no
 * separate facility flow or routing engine. */
function FacilityLayerImpl({ places, selectedPlaceId, onPressFacility }: FacilityLayerProps) {
  return (
    <>
      {places.map((place) => {
        const isSelected = place.id === selectedPlaceId;
        return (
          <Marker
            key={`facility_${place.id}`}
            testID={`facility_marker_${place.id}`}
            coordinate={place.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={isSelected ? 15 : 6}
            tracksViewChanges={false}
            accessibilityLabel={place.name}
            // Android names markers for TalkBack from the title, not accessibilityLabel (react-native-maps#3500).
            title={place.name}
            onPress={(e) => onPressFacility(place, e.nativeEvent.coordinate)}
          >
            <View style={styles.facilityMarkerHitArea}>
              <View style={[styles.facilityMarker, isSelected && styles.facilityMarkerSelected]}>
                {facilityIcon(place, markerSizes.facility * 0.62, staticColors.white)}
              </View>
            </View>
            {/* Suppresses the default info window that a title would otherwise pop on tap. */}
            <Callout tooltip><View /></Callout>
          </Marker>
        );
      })}
    </>
  );
}

export const FacilityLayer = React.memo(FacilityLayerImpl);
