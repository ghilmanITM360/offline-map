import { useI18n } from '../i18n/useI18n';
import { useEffect, useRef, useState } from 'react';
import type { Coordinate, Place } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { LocationAccessService } from '../services/LocationAccessService';
import { evaluateLocationCapability, liveBlockerMessage } from '../services/LocationCapability';
import { V2DirectionsService } from '../services/V2DirectionsService';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { startPreviewNavigationV2 } from './NavigationViewModelV2';

import { clearManualLivePreview, publishManualLivePreview } from './manualLivePreview';

const outsideProvider = createProductionOutsideRouteSource();
export type ManualLiveUpgrade =
  | { phase: 'idle' | 'confirming' | 'acquiring' | 'routing' }
  | { phase: 'failed'; message: string }
  | { phase: 'preview'; token: number; route: RoutePreviewV2; coordinate: Coordinate };

/** Speculative live routing never changes the committed manual guide. Only explicit Start publishes authority. */
export function useManualLiveUpgrade(destination: Place | null, route: unknown, manualStart: Place | null, manualGateId: string | null) {
  const { t } = useI18n();
  const [upgrade, setUpgradeState] = useState<ManualLiveUpgrade>({ phase: 'idle' });
  const stateRef = useRef(upgrade);
  stateRef.current = upgrade;
  const setUpgrade = (next: ManualLiveUpgrade) => { stateRef.current = next; setUpgradeState(next); };
  const generation = useRef(0);
  const presentationOwner = useRef(Symbol('manual-live-preview'));
  const committed = useRef<Pick<ReturnType<typeof useAppStore.getState>, 'activeRoute' | 'routePlannerOrigin' | 'routePlannerDest' | 'directoryRequestSerial'> | null>(null);
  const mounted = useRef(true);
  const coordinator = useRef(new OutsideRouteRequestCoordinator());
  const guideActive = useAppStore(s => s.routeGuide !== null);
  const chooserSerial = useAppStore(s => s.directoryRequestSerial);
  const chooserPurpose = useAppStore(s => s.directoryPurpose);
  const cancelLiveUpgrade = () => {
    generation.current += 1;
    coordinator.current.cancelCurrent();
    clearManualLivePreview(presentationOwner.current);
    if (mounted.current) setUpgrade({ phase: 'idle' });
  };
  useEffect(() => {
    cancelLiveUpgrade();
    // A candidate belongs to exactly one committed manual trip.
  }, [destination?.id, route, manualStart?.id, manualGateId]);
  useEffect(() => { if (!guideActive) cancelLiveUpgrade(); }, [guideActive]);
  useEffect(() => { cancelLiveUpgrade(); }, [chooserPurpose, chooserSerial]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; coordinator.current.cancelCurrent(); clearManualLivePreview(presentationOwner.current); };
  }, []);
  const requestLiveUpgrade = () => {
    if (stateRef.current.phase !== 'idle' || !destination || !manualStart || !useAppStore.getState().routeGuide) return;
    const intent = useAppStore.getState().destinationJourneyIntent;
    if (intent) useAppStore.getState().retireDestinationIntent(intent.id);
    generation.current += 1;
    const state = useAppStore.getState();
    committed.current = { activeRoute: state.activeRoute, routePlannerOrigin: state.routePlannerOrigin, routePlannerDest: state.routePlannerDest, directoryRequestSerial: state.directoryRequestSerial };
    coordinator.current.cancelCurrent();
    setUpgrade({ phase: 'confirming' });
  };
  const ownsCommittedTrip = () => {
    const state = useAppStore.getState();
    return mounted.current && !state.isNavigating && !state.directoryPurpose && state.routeGuide !== null &&
      committed.current !== null && state.activeRoute === committed.current.activeRoute &&
      state.routePlannerOrigin === committed.current.routePlannerOrigin && state.routePlannerDest === committed.current.routePlannerDest &&
      state.directoryRequestSerial === committed.current.directoryRequestSerial;
  };
  const confirmLiveUpgrade = async () => {
    if (!destination || !manualStart || !['confirming', 'failed'].includes(stateRef.current.phase)) return;
    const token = ++generation.current;
    const owns = () => ownsCommittedTrip() && token === generation.current &&
      useAppStore.getState().routePlannerDest?.id === destination.id && useAppStore.getState().routeGuide !== null;
    setUpgrade({ phase: 'acquiring' });
    try {
      const resolved = await LocationAccessService.resolveCurrentLocation(true);
      if (!owns()) return;
      useAppStore.getState().setLocationPermissionFacts(resolved.permissionState);
      const capability = evaluateLocationCapability({ permission: resolved.permissionState, liveFix: resolved.source === 'live' ? resolved.coordinate : null });
      if (!resolved.ok || !resolved.coordinate || capability.mode !== 'live_navigation') {
        setUpgrade({ phase: 'failed', message: (capability.liveBlocker ? liveBlockerMessage(capability.liveBlocker) : null) ?? resolved.message ?? t('routeGuide.upgrade.failed') });
        return;
      }
      useAppStore.getState().setCurrentLocation(resolved.coordinate, 'live');
      setUpgrade({ phase: 'routing' });
      const forceOutside = !EntryGateRoutingService.isInsideIjtemaArea(resolved.coordinate);
      const request = { destination, startPlace: null, currentLocation: resolved.coordinate, forceOutside,
        manualGateId: manualGateId ?? undefined, walkingSpeedMs: useAppStore.getState().settings.walkingSpeed ?? 1.4 };
      const handle = forceOutside ? coordinator.current.begin(`upgrade:${token}:${destination.id}`) : null;
      const result = handle ? await V2DirectionsService.calculateHybridPreview({ request, token: handle.token, signal: handle.signal, outsideProvider }) :
        V2DirectionsService.calculatePreview(request);
      if (!owns() || (handle && !handle.canCommit())) return;
      handle?.finish();
      if (result.status !== 'ready' || !result.route || !V2NavigationAdapter.canStartActiveNavigation({ route: result.route, destination }).canStart ||
        result.route.outsideRoute?.provider === 'direct-guide') {
        setUpgrade({ phase: 'failed', message: result.message ?? t('routeGuide.upgrade.failed') });
        return;
      }
      publishManualLivePreview({ owner: presentationOwner.current, committedRoute: committed.current!.activeRoute, destinationId: destination.id, route: result.route });
      setUpgrade({ phase: 'preview', token, route: result.route, coordinate: resolved.coordinate });
    } catch {
      if (owns()) setUpgrade({ phase: 'failed', message: t('routeGuide.upgrade.failed') });
    }
  };
  const startUpgradedNavigation = (): boolean => {
    const candidate = stateRef.current;
    const state = useAppStore.getState();
    if (candidate.phase !== 'preview' || candidate.token !== generation.current || !ownsCommittedTrip() || !destination || !state.routeGuide || state.routePlannerDest?.id !== destination.id) return false;
    const original = { activeRoute: state.activeRoute, routePlannerOrigin: state.routePlannerOrigin, routePlannerDest: state.routePlannerDest,
      routeInstructions: state.routeInstructions, routeGuide: state.routeGuide };
    useAppStore.setState({ activeRoute: candidate.route, routePlannerOrigin: null, routePlannerDest: destination });
    const result = startPreviewNavigationV2({ route: candidate.route, destination, startPlace: null, currentLocation: state.currentLocation });
    if (!result.canStart) {
      useAppStore.setState(original);
      clearManualLivePreview(presentationOwner.current);
      setUpgrade({ phase: 'failed', message: result.message ?? t('routeGuide.upgrade.failed') });
      return false;
    }
    cancelLiveUpgrade();
    return true;
  };
  return { upgrade, requestLiveUpgrade, confirmLiveUpgrade, cancelLiveUpgrade, startUpgradedNavigation };
}
