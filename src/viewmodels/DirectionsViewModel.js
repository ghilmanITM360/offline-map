/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService } from '../services/InstructionService';
export function useDirectionsViewModel(destination) {
    const currentLocation = useAppStore((s) => s.currentLocation);
    const routePlannerOrigin = useAppStore((s) => s.routePlannerOrigin);
    const settings = useAppStore((s) => s.settings);
    const { startNavigation, setRouteAlternatives, setSelectedRouteIndex, } = useAppStore.getState();
    // Keep a ref to the current GPS position so it does NOT appear in effect deps
    const locationRef = useRef(currentLocation);
    useEffect(() => { locationRef.current = currentLocation; }, [currentLocation]);
    const [route, setRoute] = useState(null);
    const [alternatives, setAlternatives] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [instructions, setInstructions] = useState([]);
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
        if (best)
            setInstructions(InstructionService.generateInstructions(best.nodes));
    }, [destination, routePlannerOrigin]); // intentionally excludes currentLocation — only recalculate when the explicit origin or destination changes
    const selectAlternative = (idx) => {
        const alt = alternatives[idx];
        if (!alt)
            return;
        setSelectedIndex(idx);
        setSelectedRouteIndex(idx);
        setRoute(alt.route);
        setInstructions(InstructionService.generateInstructions(alt.route.nodes));
    };
    const handleStartNavigation = (navigation) => {
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
