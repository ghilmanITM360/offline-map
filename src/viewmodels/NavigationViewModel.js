/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService } from '../services/InstructionService';
import { SnapToRoadService } from '../services/SnapToRoadService';
import { VoiceService } from '../services/VoiceService';
import { RerouteService } from '../services/RerouteService';
import { GPSManagerService } from '../services/GPSManagerService';
import { getDistance } from 'geolib';
const ARRIVAL_THRESHOLD_M = 20;
const REROUTE_GRACE_MS = 3000; // 3 s grace period before rerouting
export function useNavigationViewModel() {
    const { destination, stopNavigation, currentLocation, setReroutePending, reroutePending, settings, isMuted, setIsMuted, } = useAppStore();
    const [route, setRoute] = useState(null);
    const [instructions, setInstructions] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [snappedLocation, setSnappedLocation] = useState(currentLocation);
    const [remainingDistance, setRemainingDistance] = useState(0);
    const [arrived, setArrived] = useState(false);
    // Refs to avoid stale closures inside the GPS callback
    const routeRef = useRef(null);
    const instructionsRef = useRef([]);
    const currentStepIndexRef = useRef(0);
    const destinationRef = useRef(destination);
    const arrivedRef = useRef(false);
    const rerouteTimerRef = useRef(null);
    const settingsRef = useRef(settings);
    useEffect(() => { routeRef.current = route; }, [route]);
    useEffect(() => { instructionsRef.current = instructions; }, [instructions]);
    useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);
    useEffect(() => { settingsRef.current = settings; }, [settings]);
    useEffect(() => {
        destinationRef.current = destination;
        arrivedRef.current = false;
        setArrived(false);
        setCurrentStepIndex(0);
        currentStepIndexRef.current = 0;
    }, [destination]);
    // Capture the GPS location at the moment navigation starts so route generation
    // happens exactly once per destination change, never on every GPS tick.
    const initialLocationRef = useRef(currentLocation);
    useEffect(() => {
        initialLocationRef.current = currentLocation;
    }, [destination]); // update only when destination changes, not on every location update
    // Calculate route ONLY when destination changes (or on first mount if GPS is
    // already available). currentLocation is intentionally excluded from deps.
    useEffect(() => {
        const loc = initialLocationRef.current ?? currentLocation;
        if (!loc || !destination)
            return;
        const walkingSpeedMs = settingsRef.current.walkingSpeed ?? 1.4;
        const destNodeIds = RoutingService.resolveDestinationNodes(destination.id, destination.coordinate);
        const result = RoutingService.calculateRoute(loc, destNodeIds);
        void walkingSpeedMs; // ETA uses walkingSpeedMs via RoutingService default; single-route path defers speed to calculateRoutes
        if (result) {
            setRoute(result);
            routeRef.current = result;
            const generated = InstructionService.generateInstructions(result.nodes);
            setInstructions(generated);
            instructionsRef.current = generated;
            setRemainingDistance(result.totalDistance);
            // Speak the first instruction; mute state is checked via ref so this
            // effect never re-runs when the user toggles mute.
            if (!settingsRef.current.voiceInstructions)
                return;
            const isMutedNow = useAppStore.getState().isMuted;
            if (!isMutedNow && generated[0]) {
                VoiceService.speak(generated[0].text, settingsRef.current.language);
            }
        }
    }, [destination]); // intentionally only destination — mute and GPS ticks must not re-trigger route generation
    // GPS listener — registered once with the shared GPSManagerService
    const handleGPS = useCallback((coord) => {
        const snapped = SnapToRoadService.snapToRoad(coord);
        setSnappedLocation(snapped);
        const stepIdx = currentStepIndexRef.current;
        const steps = instructionsRef.current;
        const currentRoute = routeRef.current;
        const dest = destinationRef.current;
        const currentSettings = settingsRef.current;
        // --- Step advancement ---
        if (steps.length > 0 && stepIdx < steps.length - 1) {
            const stepCoord = steps[stepIdx].coordinate;
            if (stepCoord) {
                const distToStep = getDistance({ latitude: snapped.latitude, longitude: snapped.longitude }, { latitude: stepCoord.latitude, longitude: stepCoord.longitude });
                if (distToStep < 15) {
                    const next = stepIdx + 1;
                    setCurrentStepIndex(next);
                    currentStepIndexRef.current = next;
                    if (!isMuted && currentSettings.voiceInstructions && steps[next]) { // fixed: respect voice settings for step advancement prompts
                        VoiceService.speak(steps[next].text, currentSettings.language);
                    }
                }
            }
        }
        // --- Remaining distance ---
        const remaining = steps.slice(currentStepIndexRef.current).reduce((sum, s) => sum + s.distance, 0);
        setRemainingDistance(remaining);
        // --- Arrival detection ---
        if (dest && !arrivedRef.current) {
            const distToDest = getDistance({ latitude: snapped.latitude, longitude: snapped.longitude }, { latitude: dest.coordinate.latitude, longitude: dest.coordinate.longitude });
            if (distToDest < ARRIVAL_THRESHOLD_M) {
                arrivedRef.current = true;
                setArrived(true);
                if (!isMuted && currentSettings.voiceInstructions) { // fixed: respect voice settings for arrival prompts
                    VoiceService.speak(currentSettings.language === 'ur'
                        ? `${dest.name} پہنچ گئے۔`
                        : `You have arrived at ${dest.name}.`, currentSettings.language);
                }
                return;
            }
        }
        // --- Off-route detection with grace period ---
        if (currentRoute && dest && currentSettings.autoReroute && !arrivedRef.current) {
            // Accuracy-aware threshold: wider tolerance when GPS is weak
            const gpsAccuracy = coord.accuracy ?? 0;
            const offRoute = RerouteService.isOffRoute(coord, currentRoute, gpsAccuracy);
            if (offRoute) {
                if (!rerouteTimerRef.current) {
                    // Start grace period
                    setReroutePending(true);
                    rerouteTimerRef.current = setTimeout(() => {
                        rerouteTimerRef.current = null;
                        // Re-check still off-route after grace period
                        const latestRoute = routeRef.current;
                        if (latestRoute && RerouteService.isOffRoute(coord, latestRoute, gpsAccuracy)) {
                            const destNodeIds = RoutingService.resolveDestinationNodes(dest.id, dest.coordinate);
                            const newRoute = RoutingService.calculateRoute(coord, destNodeIds);
                            if (newRoute) {
                                setRoute(newRoute);
                                routeRef.current = newRoute;
                                const newInstructions = InstructionService.generateInstructions(newRoute.nodes);
                                setInstructions(newInstructions);
                                instructionsRef.current = newInstructions;
                                setCurrentStepIndex(0);
                                currentStepIndexRef.current = 0;
                                if (!isMuted && settingsRef.current.voiceInstructions) { // fixed: respect voice settings for reroute prompts
                                    VoiceService.speak(settingsRef.current.language === 'ur'
                                        ? 'راستہ دوبارہ بن رہا ہے۔ چلتے رہیں۔'
                                        : 'Recalculating. Please continue walking.', settingsRef.current.language);
                                }
                            }
                            setReroutePending(false);
                        }
                        else {
                            setReroutePending(false);
                        }
                    }, REROUTE_GRACE_MS);
                }
            }
            else {
                // Back on route — cancel pending reroute
                if (rerouteTimerRef.current) {
                    clearTimeout(rerouteTimerRef.current);
                    rerouteTimerRef.current = null;
                    setReroutePending(false);
                }
            }
        }
    }, [isMuted, setReroutePending]);
    useEffect(() => {
        GPSManagerService.addListener(handleGPS);
        return () => {
            GPSManagerService.removeListener(handleGPS);
            VoiceService.stop();
            if (rerouteTimerRef.current) {
                clearTimeout(rerouteTimerRef.current);
            }
        };
    }, [handleGPS]);
    const setMuteState = (muted) => {
        if (muted)
            VoiceService.stop();
        setIsMuted(muted);
    };
    const handleExit = (navigation) => {
        VoiceService.stop();
        stopNavigation();
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
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
        reroutePending,
        handleExit,
    };
}
