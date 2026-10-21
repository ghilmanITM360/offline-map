/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localizeVenueName } from '../../../i18n/venueNames';
import { useAccessibilityFocus } from '../../hooks/useAccessibilityFocus';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, Navigation, Volume2, VolumeX, X } from 'lucide-react-native';

import { InstructionService } from '../../../services/InstructionService';
import { V2PlaceAdapter } from '../../../services/V2PlaceAdapter';
import { staticColors } from '../../../theme';
import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';
import { NavigationOverlayV2 } from '../../../viewmodels/useNavigationOverlayV2';
import { useReducedMotion } from '../../../viewmodels/useReducedMotion';
import { computeNavRecenterInset, resolveNavBarHeight } from '../../../viewmodels/useOverlayInsets';
import { NAV_TOUCH_TARGET_HIT_SLOP, navOverlayStyles as styles } from './navOverlayStyles';
import { OutsideRouteStatusCard } from './OutsideRouteStatusCard';
import { outsideRouteMessage } from '../../../services/OutsideRouteLocalizationService';
import { ActiveDirectionsPanel } from './ActiveDirectionsPanel';
import { useI18n } from '../../../i18n';
import { ArrivalCard } from './ArrivalCard';
import { EntryGateOriginBanner } from './EntryGateOriginBanner';
import { GateChooser } from './GateChooser';
import { GpsSignalBanner } from './GpsSignalBanner';
import { MapUnavailableBanner } from './MapUnavailableBanner';
import { RerouteBanner } from './RerouteBanner';
import { RerouteProgressCard } from './RerouteProgressCard';

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

function StepIcon({ type, size = 32 }: { type: string; size?: number }) {
  const color = staticColors.white;
  switch (type) {
    case 'left':    return <ArrowLeft size={size} color={color} />;
    case 'right':   return <ArrowRight size={size} color={color} />;
    case 'arrival': return <MapPin size={size} color={color} />;
    default:        return <Navigation size={size} color={color} />;
  }
}

/** Overlay chrome (banners, instruction/trip cards, recenter, arrival modal) shown over the
 * shared MapView while a v2 route is being navigated. Renders as a sibling of the MapView,
 * not inside it. */
// Within this distance of the gate the user counts as having reached the venue.
const OUTSIDE_PHASE_ENTRY_TOLERANCE_M = 15;

export function NavigationChromeV2({ overlay, hasBaseMap }: { overlay: NavigationOverlayV2; hasBaseMap: boolean }) {
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const [showDirections, setShowDirections] = useState(false);
  // Wrapped to three lines at large text, the status banners would run under the map control column on the right.
  const largeText = useWindowDimensions().fontScale >= 1.5;
  const {
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    maneuverDistance,
    etaMinutes,
    arrived,
    reroutePending,
    isWeakGps,
    gpsSignalState,
    rerouteStatusMessage,
    snappedLocation,
    settings,
    manualGateId,
    availableOutsideGates,
    retryOutsideRoute,
    selectOutsideGate,
    requestNavigationExit,
    completeArrivalNavigation,
    setIsAutoFollowing,
    bottomBarHeight,
    setBottomBarHeight,
  } = overlay;
  const [showGateOptions, setShowGateOptions] = useState(false);

  const { ref: instructionHeadingRef } = useAccessibilityFocus(route ? (arrived ? "arrival" : "navigation") : null);
  const mountAnim = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    // Held back a beat so the chrome doesn't pop in on the same frame as the route-preview
    // sheet collapsing / CameraManager's enterNavigationCamera move — see NAV_TRANSITION_TIMINGS.
    const revealTimer = setTimeout(() => {
      if (reducedMotion) {
        mountAnim.setValue(1);
      } else {
        Animated.timing(mountAnim, { toValue: 1, duration: NAV_TRANSITION_TIMINGS.chromeFadeMs, useNativeDriver: true }).start();
      }
    }, NAV_TRANSITION_TIMINGS.chromeRevealDelayMs);
    return () => clearTimeout(revealTimer);
  }, [mountAnim, reducedMotion]);

  // #64: one-time TalkBack announcement on arrival — the visible "You've Arrived!" card is
  // otherwise silent to screen-reader users, who get no signal the trip ended.
  useEffect(() => {
    if (arrived && route) {
      AccessibilityInfo.announceForAccessibility(t('navigation.arrivedAnnouncement', {name: localizeVenueName(route.destination.label)}));
    }
  }, [arrived, route]);

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const outsideRoute = route.outsideRoute;
  // Outside phase = the outside leg is not walked yet. Live progress advances the current step past the approach
  // step on the first fix, so the step index alone is not enough: more distance remaining than the walk inside the
  // venue also means the user is still outside.
  const routeWithConnector = route as typeof route & { startConnectorDistanceM?: number };
  const insideLegM = Math.max(0, route.totalDistanceM - (routeWithConnector.startConnectorDistanceM ?? 0));
  const outsidePhaseActive = Boolean(
    outsideRoute &&
    ((currentStep?.routeIndex ?? 0) < (route.outsideLegCoordinateCount ?? 0) ||
      remainingDistance > insideLegM + OUTSIDE_PHASE_ENTRY_TOLERANCE_M),
  );
  const directOutsideActive = Boolean(
    outsidePhaseActive && outsideRoute?.provider === 'direct-guide',
  );
  const directGateLabel = outsideRoute
    ? V2PlaceAdapter.getPlaceById(outsideRoute.gateId)?.name ?? outsideRoute.gateId.replace('GATE_', 'Gate ')
    : t('navigation.selectedGate');
  const arrivalTime = new Date(Date.now() + Math.max(etaMinutes, 0) * 60_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <AnimatedSafeAreaView
        testID="navigation-top-stack"
        style={[
          styles.topBar,
          { opacity: mountAnim, transform: [{ translateY: mountAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
        ]}
      >
        <View testID="navigation-maneuver-surface">
          {reroutePending ? (
            <RerouteProgressCard label={t('navigation.rerouting')} />
          ) : directOutsideActive && !arrived ? (
            <View
              style={styles.instructionCard}
              accessibilityLabel={outsideRouteMessage('direct.heading', locale, { gate: directGateLabel })}
            >
              <View style={styles.instructionIcon}>
                <Navigation size={32} color={staticColors.white} />
              </View>
              <View style={styles.instructionTextContainer}>
                <Text ref={instructionHeadingRef} accessible accessibilityRole="header" style={styles.maneuverLabel}>{t('navigation.direct')}</Text>
                <Text style={styles.nextStepText}>
                  {outsideRouteMessage('direct.heading', locale, { gate: directGateLabel })}
                </Text>
              </View>
            </View>
          ) : currentStep && !arrived ? (
            <View
              style={styles.instructionCard}
              // Was currentStep.text, whose baked-in "for N meters" is the whole edge length,
              // not the live distance to the maneuver shown on screen.
              accessibilityLabel={[
                InstructionService.maneuverLabel(currentStep.type),
                maneuverDistance > 0 ? InstructionService.formatDistance(maneuverDistance, settings.distanceUnit) : '',
                InstructionService.stepRoadLine(currentStep, route.destination.label),
              ]
                .filter(Boolean)
                .join(', ')}
            >
              <View style={styles.instructionIcon}>
                <StepIcon type={currentStep.type} size={32} />
              </View>
              <View style={styles.instructionTextContainer}>
                <Text ref={instructionHeadingRef} accessible accessibilityRole="header" style={styles.maneuverLabel}>{InstructionService.maneuverLabel(currentStep.type)}</Text>
                <Text style={styles.instructionDistance}>
                  {maneuverDistance > 0 ? InstructionService.formatDistance(maneuverDistance, settings.distanceUnit) : ''}
                </Text>
                {InstructionService.stepRoadLine(currentStep, route.destination.label) ? (
                <Text style={styles.roadNameText} numberOfLines={1} ellipsizeMode="tail">
                  {InstructionService.stepRoadLine(currentStep, route.destination.label)}
                </Text>
              ) : null}
                {nextStep && (
                  // B-001: was the full raw instruction sentence ("Then: Continue 40 meters
                  // on Rasta 09 to Rasta 09 & Rasta 01 Junction.") — with numberOfLines={1} the
                  // upcoming place name (the one useful part) was exactly what got clipped by
                  // the ellipsis. Short maneuver + road name mirrors the current-step card's
                  // own vocabulary and always fits.
                  <Text style={styles.nextStepText} numberOfLines={1}>
                    {InstructionService.nextStepPreview(nextStep, route.destination.label)}
                  </Text>
                )}
              </View>
              <Pressable
                testID="nav-mute-toggle"
                onPress={() => setIsMuted(!isMuted)}
                style={styles.muteButton}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t(isMuted ? 'navigation.unmute' : 'navigation.mute')}
              >
                {isMuted ? <VolumeX size={24} color={staticColors.white} /> : <Volume2 size={24} color={staticColors.white} />}
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Single top safety/status slot — navigation safety (GPS lost/weak) outranks
            rerouting status, which outranks basemap degradation. Never stack more than one. */}
        <View testID="navigation-subordinate-surfaces" style={[styles.topStatusStack, largeText && styles.topStatusStackClearOfControls]}>
          {gpsSignalState === 'GPS_LOST' ? (
            <GpsSignalBanner status="lost" message={t('navigation.lost')} />
          ) : isWeakGps ? (
            <GpsSignalBanner status="weak" message={t('navigation.weak')} />
          ) : rerouteStatusMessage && !reroutePending ? (
            <RerouteBanner message={rerouteStatusMessage} />
          ) : !hasBaseMap ? (
            <MapUnavailableBanner message={t('navigation.mapUnavailable')} />
          ) : null}
          {route.metadata.startedOutside && route.metadata.entryGateId && (
            <EntryGateOriginBanner message={t('navigation.origin', {name: localizeVenueName(route.origin.label)})} />
          )}
          {outsidePhaseActive && outsideRoute && (
            <View style={styles.outsideStatusCardWrap}>
              <OutsideRouteStatusCard
                route={outsideRoute}
                gateLabel={directGateLabel}
                retrying={reroutePending}
                onRetry={() => void retryOutsideRoute()}
                onChooseGate={() => setShowGateOptions((visible) => !visible)}
              />
            </View>
          )}
          {directOutsideActive && showGateOptions && (
            <GateChooser
              gates={availableOutsideGates}
              selectedId={manualGateId}
              onSelect={(gateId) => {
                setShowGateOptions(false);
                void selectOutsideGate(gateId);
              }}
            />
          )}
        </View>
      </AnimatedSafeAreaView>

      {!arrived && (
        <Animated.View
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
            // Durable controls are visible immediately when setup leaves; only the top maneuver animates.
          ]}
          onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.tripInfo}>
            <View style={styles.tripTextWrap}>
              {!directOutsideActive && <Text style={styles.timeRemaining}>{t('navigation.minutes', {count: etaMinutes})}</Text>}
              <Text style={styles.distanceRemaining}>
                {directOutsideActive
                  ? InstructionService.formatDistance(remainingDistance, settings.distanceUnit)
                  : `${InstructionService.formatDistance(remainingDistance, settings.distanceUnit)} · ${t('navigation.arriveTime', {time: arrivalTime})}`}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{localizeVenueName(route.destination.label)}</Text>
            </View>
            <Pressable
              testID="nav-exit-button"
              style={styles.exitButton}
              onPress={requestNavigationExit}
              hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t('navigation.exitLabel')}
            >
              <X size={20} color={staticColors.textPrimary} />
              <Text style={styles.exitText}>{t('navigation.exit')}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.directionsButton} onPress={() => setShowDirections(true)}
            accessibilityRole="button" accessibilityLabel={t('navigation.directions')}>
            <Text style={styles.exitText}>{t('navigation.directions')}</Text>
          </Pressable>
        </Animated.View>
      )}

      {snappedLocation && (
        <Pressable
          testID="nav-recenter-button"
          style={[
            styles.recenterButton,
            // resolveNavBarHeight only adds insets.bottom for the pre-layout fallback —
            // once bottomBarHeight is measured it already bakes insets.bottom in (it's
            // the bar's own paddingBottom), so it isn't double-counted here.
            { bottom: computeNavRecenterInset(resolveNavBarHeight(bottomBarHeight, insets.bottom)) },
          ]}
          onPress={() => setIsAutoFollowing(true)}
          hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('navigation.recenterLabel')}
        >
          <LocateFixed size={20} color={staticColors.routeInside} />
        </Pressable>
      )}

      <ActiveDirectionsPanel visible={showDirections && !arrived} destination={localizeVenueName(route.destination.label)}
        instructions={instructions} currentStepIndex={currentStepIndex} onClose={() => setShowDirections(false)} />

      <ArrivalCard visible={arrived} destination={localizeVenueName(route.destination.label)}
        onRecenter={() => setIsAutoFollowing(true)} onDone={completeArrivalNavigation} />
    </>
  );
}
