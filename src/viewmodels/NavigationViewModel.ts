/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { RoutingService, RouteResult } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { SnapToRoadService } from '../services/SnapToRoadService';
import { getDistance } from 'geolib';
import { IJTEMA_DATA } from '../constants/data';

export function useNavigationViewModel() {
  const { destination, stopNavigation, currentLocation, setCurrentLocation } = useAppStore();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [snappedLocation, setSnappedLocation] = useState(currentLocation);

  const getDistanceToRoute = (coord: any, routeCoords: any[]) => {
    let minDist = Infinity;
    routeCoords.forEach(rc => {
      const d = getDistance(coord, rc);
      if (d < minDist) minDist = d;
    });
    return minDist;
  };

  useEffect(() => {
    if (currentLocation && destination) {
      const block = Object.values(IJTEMA_DATA.blocks).find(b => b.name === destination.name);
      const entryNodes = block ? block.entry_nodes : [RoutingService.findNearestNode(destination.coordinate)];
      
      const result = RoutingService.calculateRoute(currentLocation, entryNodes);
      if (result) {
        setRoute(result);
        const generatedInstructions = InstructionService.generateInstructions(result.nodes);
        setInstructions(generatedInstructions);
      }
    }
  }, [destination]);

  useEffect(() => {
    const subscription = Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      (location) => {
        const coord = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading || 0
        };
        setCurrentLocation(coord);
        
        const snapped = SnapToRoadService.snapToRoad(coord);
        setSnappedLocation(snapped);

        // Check for rerouting
        if (route) {
          const distToRoute = getDistanceToRoute(coord, route.coordinates);
          if (distToRoute > 15) {
             // Reroute logic
             const block = Object.values(IJTEMA_DATA.blocks).find(b => b.name === destination?.name);
             const entryNodes = block ? block.entry_nodes : [RoutingService.findNearestNode(destination!.coordinate)];
             const newRoute = RoutingService.calculateRoute(coord, entryNodes);
             if (newRoute) {
               setRoute(newRoute);
               setInstructions(InstructionService.generateInstructions(newRoute.nodes));
               setCurrentStepIndex(0);
             }
          }
        }
      }
    );

    return () => {
      subscription.then(s => s.remove());
    };
  }, [route, destination]);

  const handleExit = (navigation: any) => {
    stopNavigation();
    navigation.navigate('Home');
  };

  return {
    destination,
    currentLocation,
    snappedLocation,
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    handleExit,
  };
}
