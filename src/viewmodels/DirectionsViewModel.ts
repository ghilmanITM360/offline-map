/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { RoutingService, RouteResult } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { Place } from '../models/types';
import { IJTEMA_DATA } from '../constants/data';
import { RootStackParamList } from '../navigation/RootNavigator'; // fixed: type navigation used to enter turn-by-turn mode

export function useDirectionsViewModel(destination: Place | null) {
  const { currentLocation, startNavigation } = useAppStore();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [origin] = useState('Current location'); // fixed: keep the displayed origin text read-only until custom origin routing exists

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

  const handleStartNavigation = (navigation: NativeStackNavigationProp<RootStackParamList, 'Directions'>) => { // fixed: type the directions-screen navigation helper
    if (destination) {
      startNavigation(destination);
      navigation.navigate('Navigation');
    }
  };

  return {
    route,
    instructions,
    origin,
    handleStartNavigation,
  };
}
