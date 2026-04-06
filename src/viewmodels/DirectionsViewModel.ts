/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { RoutingService, RouteResult } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { Place } from '../models/types';
import { IJTEMA_DATA } from '../constants/data';

export function useDirectionsViewModel(destination: Place | null) {
  const { currentLocation, startNavigation } = useAppStore();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [origin, setOrigin] = useState('Your Location');

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
  }, [currentLocation, destination]);

  const handleStartNavigation = (navigation: any) => {
    if (destination) {
      startNavigation(destination);
      navigation.navigate('Navigation');
    }
  };

  return {
    route,
    instructions,
    origin,
    setOrigin,
    handleStartNavigation,
  };
}
