/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { RoutingService, RouteResult } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { SnapToRoadService } from '../services/SnapToRoadService';
import { VoiceService } from '../services/VoiceService';
import { getDistance } from 'geolib';
import { IJTEMA_DATA } from '../constants/data';
import { Coordinate } from '../models/types';

export function useNavigationViewModel() {
  const { destination, stopNavigation, currentLocation, setCurrentLocation } = useAppStore();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [snappedLocation, setSnappedLocation] = useState<Coordinate | null>(currentLocation);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [arrived, setArrived] = useState(false);

  // Refs to avoid stale closures inside the GPS callback
  const routeRef = useRef<RouteResult | null>(null);
  const instructionsRef = useRef<Instruction[]>([]);
  const currentStepIndexRef = useRef(0);
  const isMutedRef = useRef(false);
  const destinationRef = useRef(destination);
  const arrivedRef = useRef(false);

  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { instructionsRef.current = instructions; }, [instructions]);
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => {
    destinationRef.current = destination;
    arrivedRef.current = false;
    setArrived(false);
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
  }, [destination]);

  // Calculate initial route when destination changes
  useEffect(() => {
    if (currentLocation && destination) {
      const block = Object.values(IJTEMA_DATA.blocks).find(b => b.name === destination.name);
      const entryNodes = block ? block.entry_nodes : [RoutingService.findNearestNode(destination.coordinate)];

      const result = RoutingService.calculateRoute(currentLocation, entryNodes);
      if (result) {
        setRoute(result);
        routeRef.current = result;
        const generated = InstructionService.generateInstructions(result.nodes);
        setInstructions(generated);
        instructionsRef.current = generated;
        setRemainingDistance(result.totalDistance);
        if (!isMutedRef.current && generated[0]) {
          VoiceService.speak(generated[0].text);
        }
      }
    }
  }, [destination]);

  // GPS subscription (single, persistent while screen is mounted)
  useEffect(() => {
    const subscriptionPromise = Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      (location) => {
        const coord: Coordinate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading || 0,
        };
        setCurrentLocation(coord);

        const snapped = SnapToRoadService.snapToRoad(coord);
        setSnappedLocation(snapped);

        const stepIdx = currentStepIndexRef.current;
        const steps = instructionsRef.current;
        const currentRoute = routeRef.current;
        const dest = destinationRef.current;

        // --- Step advancement ---
        if (steps.length > 0 && stepIdx < steps.length - 1) {
          const stepCoord = steps[stepIdx].coordinate;
          if (stepCoord) {
            const distToStep = getDistance(
              { latitude: snapped.latitude, longitude: snapped.longitude },
              { latitude: stepCoord.latitude, longitude: stepCoord.longitude }
            );
            if (distToStep < 15) {
              const next = stepIdx + 1;
              setCurrentStepIndex(next);
              currentStepIndexRef.current = next;
              if (!isMutedRef.current && steps[next]) {
                VoiceService.speak(steps[next].text);
              }
            }
          }
        }

        // --- Remaining distance ---
        const remaining = steps
          .slice(currentStepIndexRef.current)
          .reduce((sum, s) => sum + s.distance, 0);
        setRemainingDistance(remaining);

        // --- Arrival detection ---
        if (dest && !arrivedRef.current) {
          const distToDest = getDistance(
            { latitude: snapped.latitude, longitude: snapped.longitude },
            { latitude: dest.coordinate.latitude, longitude: dest.coordinate.longitude }
          );
          if (distToDest < 20) {
            arrivedRef.current = true;
            setArrived(true);
            if (!isMutedRef.current) {
              VoiceService.speak('You have arrived at your destination.');
            }
          }
        }

        // --- Rerouting ---
        if (currentRoute && dest) {
          const distToRoute = Math.min(
            ...currentRoute.coordinates.map(rc =>
              getDistance({ latitude: coord.latitude, longitude: coord.longitude }, rc)
            )
          );
          if (distToRoute > 15) {
            const block = Object.values(IJTEMA_DATA.blocks).find(b => b.name === dest.name);
            const entryNodes = block
              ? block.entry_nodes
              : [RoutingService.findNearestNode(dest.coordinate)];
            const newRoute = RoutingService.calculateRoute(coord, entryNodes);
            if (newRoute) {
              setRoute(newRoute);
              routeRef.current = newRoute;
              const newInstructions = InstructionService.generateInstructions(newRoute.nodes);
              setInstructions(newInstructions);
              instructionsRef.current = newInstructions;
              setCurrentStepIndex(0);
              currentStepIndexRef.current = 0;
            }
          }
        }
      }
    );

    return () => {
      subscriptionPromise.then(s => s.remove());
      VoiceService.stop();
    };
  }, []); // run once on mount, use refs for all state

  const setMuteState = (muted: boolean) => {
    if (muted) VoiceService.stop();
    setIsMuted(muted);
  };

  const handleExit = (navigation: any) => {
    VoiceService.stop();
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
    setIsMuted: setMuteState,
    remainingDistance,
    arrived,
    handleExit,
  };
}
