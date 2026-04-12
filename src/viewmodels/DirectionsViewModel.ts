/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { Place, RouteAlternative, RoutePreview } from '../models/types';
import { RootStackParamList } from '../navigation/RootNavigator';

export function useDirectionsViewModel(destination: Place | null) {
  const currentLocation = useAppStore((s) => s.currentLocation);
  const routePlannerOrigin = useAppStore((s) => s.routePlannerOrigin);
  const settings = useAppStore((s) => s.settings);
  const {
    startNavigation,
    setRouteAlternatives,
    setSelectedRouteIndex,
  } = useAppStore.getState();

  // Keep a ref to the current GPS position so it does NOT appear in effect deps
  const locationRef = useRef(currentLocation);
  useEffect(() => { locationRef.current = currentLocation; }, [currentLocation]);

  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [instructions, setInstructions] = useState<Instruction[]>([]);

  const originLabel = routePlannerOrigin ? routePlannerOrigin.name : 'Current location';

  // Recalculate routes ONLY when the destination (or explicit origin) changes — not on every GPS tick
  useEffect(() => {
    const loc = routePlannerOrigin
      ? routePlannerOrigin.coordinate
      : (locationRef.current ?? currentLocation);

    if (!loc || !destination) {
      setRoute(null);
      setAlternatives([]);
      setRouteAlternatives([]);
      return;
    }

    const walkingSpeedMs = settings.walkingSpeed ?? 1.4;
    const destNodeIds = RoutingService.resolveDestinationNodes(destination.id, destination.coordinate);

    const alts = RoutingService.calculateRoutes(loc, destNodeIds, walkingSpeedMs);
    setAlternatives(alts);
    setRouteAlternatives(alts);
    setSelectedIndex(0);
    setSelectedRouteIndex(0);

    const best = alts[0]?.route ?? RoutingService.calculateRoute(loc, destNodeIds);
    setRoute(best ?? null);
    if (best) setInstructions(InstructionService.generateInstructions(best.nodes));

  }, [destination, routePlannerOrigin]); // intentionally excludes currentLocation — only recalculate when the explicit origin or destination changes

  const selectAlternative = (idx: number) => {
    const alt = alternatives[idx];
    if (!alt) return;
    setSelectedIndex(idx);
    setSelectedRouteIndex(idx);
    setRoute(alt.route);
    setInstructions(InstructionService.generateInstructions(alt.route.nodes));
  };

  const handleStartNavigation = (navigation: NativeStackNavigationProp<RootStackParamList, 'Directions'>) => {
    if (destination) {
      startNavigation(destination);
      navigation.navigate('Navigation');
    }
  };

  return {
    route,
    alternatives,
    selectedIndex,
    selectAlternative,
    instructions,
    originLabel,
    handleStartNavigation,
  };
}
