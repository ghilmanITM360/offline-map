/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, Navigation, RefreshCw, Volume2, VolumeX, X } from 'lucide-react-native';

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
import { Button } from '../common/Button';

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
export function NavigationChromeV2({ overlay, hasBaseMap }: { overlay: NavigationOverlayV2; hasBaseMap: boolean }) {
  const insets = useSafeAreaInsets();
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
      AccessibilityInfo.announceForAccessibility(`Arrived at ${route.destination.label}`);
    }
  }, [arrived, route]);

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const outsideRoute = route.outsideRoute;
  const outsidePhaseActive = Boolean(
    outsideRoute &&
    (currentStep?.routeIndex ?? 0) < (route.outsideLegCoordinateCount ?? 0),
  );
  const directOutsideActive = Boolean(
    outsidePhaseActive && outsideRoute?.provider === 'direct-guide',
  );
  const directGateLabel = outsideRoute
    ? V2PlaceAdapter.getPlaceById(outsideRoute.gateId)?.name ?? outsideRoute.gateId.replace('GATE_', 'Gate ')
    : 'selected gate';
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
            <View style={[styles.instructionCard, styles.rerouteCard]}>
              <RefreshCw size={28} color={staticColors.white} />
              <Text style={styles.rerouteText}>Recalculating...</Text>
            </View>
          ) : directOutsideActive && !arrived ? (
            <View
              style={styles.instructionCard}
              accessibilityLabel={outsideRouteMessage('direct.heading', 'en', { gate: directGateLabel })}
            >
              <View style={styles.instructionIcon}>
                <Navigation size={32} color={staticColors.white} />
              </View>
              <View style={styles.instructionTextContainer}>
                <Text style={styles.maneuverLabel}>Straight-line guide</Text>
                <Text style={styles.nextStepText}>
                  {outsideRouteMessage('direct.heading', 'en', { gate: directGateLabel })}
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
                <Text style={styles.maneuverLabel}>{InstructionService.maneuverLabel(currentStep.type)}</Text>
                <Text style={styles.instructionDistance}>
                  {maneuverDistance > 0 ? InstructionService.formatDistance(maneuverDistance, settings.distanceUnit) : ''}
                </Text>
                <Text style={styles.roadNameText} numberOfLines={1} ellipsizeMode="tail">
                  {InstructionService.stepRoadLine(currentStep, route.destination.label)}
                </Text>
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
                accessibilityLabel={isMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
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
            <View style={styles.weakGpsBanner} accessibilityLiveRegion="assertive">
              <Text style={styles.weakGpsText}>Searching for GPS signal. Your position may be out of date.</Text>
            </View>
          ) : isWeakGps ? (
            <View style={styles.weakGpsBanner} accessibilityLiveRegion="polite">
              <Text style={styles.weakGpsText}>Weak GPS signal detected. Route updates may be slower.</Text>
            </View>
          ) : rerouteStatusMessage && !reroutePending ? (
            <View style={styles.rerouteHintBanner} accessibilityLiveRegion="polite">
              <Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>
            </View>
          ) : !hasBaseMap ? (
            <View style={styles.mapUnavailableBanner} accessibilityLiveRegion="polite">
              <Text style={styles.mapUnavailableText}>The map can't be shown. Directions still work.</Text>
            </View>
          ) : null}
          {route.metadata.startedOutside && route.metadata.entryGateId && (
            <View style={styles.v2EntryGateBanner}>
              <Text style={styles.v2EntryGateText}>Route starts from {route.origin.label}.</Text>
            </View>
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
            <View style={styles.directGateOptions}>
              <Text style={styles.directGateOptionsTitle}>Choose a gate</Text>
              {availableOutsideGates.map((gate) => (
                <Button
                  key={gate.id}
                  variant={manualGateId === gate.id ? 'secondary' : 'outline'}
                  label={gate.label}
                  accessibilityLabel={`Use ${gate.label}`}
                  onPress={() => {
                    setShowGateOptions(false);
                    void selectOutsideGate(gate.id);
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </AnimatedSafeAreaView>

      {!arrived && (
        <Animated.View
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
            { opacity: mountAnim, transform: [{ translateY: mountAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
          ]}
          onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.tripInfo}>
            <View style={styles.tripTextWrap}>
              {!directOutsideActive && <Text style={styles.timeRemaining}>{etaMinutes} min</Text>}
              <Text style={styles.distanceRemaining}>
                {directOutsideActive
                  ? InstructionService.formatDistance(remainingDistance, settings.distanceUnit)
                  : `${InstructionService.formatDistance(remainingDistance, settings.distanceUnit)} · ETA ${arrivalTime}`}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{route.destination.label}</Text>
            </View>
            <Pressable
              testID="nav-exit-button"
              style={styles.exitButton}
              onPress={requestNavigationExit}
              hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Exit navigation"
            >
              <X size={20} color={staticColors.textPrimary} />
              <Text style={styles.exitText}>Exit</Text>
            </Pressable>
          </View>
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
          accessibilityLabel="Re-center map on my location"
        >
          <LocateFixed size={20} color={staticColors.routeInside} />
        </Pressable>
      )}

      <Modal
        testID="nav-arrival-modal"
        visible={arrived}
        transparent
        animationType="slide"
        onRequestClose={completeArrivalNavigation}
      >
        <View style={styles.arrivedOverlay} accessibilityViewIsModal>
          {/* The Modal window is full-screen (under the system nav bar), so the buttons must clear the bottom inset (#301). */}
          <View testID="nav-arrived-card" style={[styles.arrivedCard, { paddingBottom: Math.max(36, insets.bottom + 24) }]}>
            <MapPin size={52} color={staticColors.arrivalGreen} />
            <Text style={styles.arrivedTitle}>You've Arrived!</Text>
            <Text style={styles.arrivedUrdu}>منزل پر پہنچ گئے</Text>
            <Text style={styles.arrivedSubtitle}>{route.destination.label}</Text>
            <View style={styles.arrivedActionsRow}>
              <Pressable
                testID="nav-arrived-recenter-button"
                style={styles.arrivedSecondaryButton}
                onPress={() => setIsAutoFollowing(true)}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Re-center map on my location"
              >
                <LocateFixed size={18} color={staticColors.routeInside} />
                <Text style={styles.arrivedSecondaryButtonText}>Recenter</Text>
              </Pressable>
              <Pressable
                testID="nav-arrived-done-button"
                style={styles.arrivedButton}
                onPress={completeArrivalNavigation}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Done, return to map"
              >
                <Text style={styles.arrivedButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
