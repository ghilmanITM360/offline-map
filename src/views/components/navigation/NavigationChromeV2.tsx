/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, Navigation, RefreshCw, Volume2, VolumeX, X } from 'lucide-react-native';

import { InstructionService } from '../../../services/InstructionService';
import { staticColors } from '../../../theme';
import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';
import { NavigationOverlayV2 } from '../../../viewmodels/useNavigationOverlayV2';
import { computeNavRecenterInset, resolveNavBarHeight } from '../../../viewmodels/useOverlayInsets';
import { NAV_TOUCH_TARGET_HIT_SLOP, navOverlayStyles as styles } from './navOverlayStyles';
import { OutsideRouteStatusCard } from './OutsideRouteStatusCard';
import { outsideRouteMessage } from '../../../services/OutsideRouteLocalizationService';

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
export function NavigationChromeV2({ overlay, hasGoogleMapsKey }: { overlay: NavigationOverlayV2; hasGoogleMapsKey: boolean }) {
  const insets = useSafeAreaInsets();
  const {
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    etaMinutes,
    arrived,
    reroutePending,
    isWeakGps,
    gpsSignalState,
    rerouteStatusMessage,
    snappedLocation,
    settings,
    graphOnlyFallbackUsed,
    handleExit,
    setIsAutoFollowing,
    bottomBarHeight,
    setBottomBarHeight,
  } = overlay;

  const mountAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Held back a beat so the chrome doesn't pop in on the same frame as the route-preview
    // sheet collapsing / CameraManager's enterNavigationCamera move — see NAV_TRANSITION_TIMINGS.
    const revealTimer = setTimeout(() => {
      Animated.timing(mountAnim, { toValue: 1, duration: NAV_TRANSITION_TIMINGS.chromeFadeMs, useNativeDriver: true }).start();
    }, NAV_TRANSITION_TIMINGS.chromeRevealDelayMs);
    return () => clearTimeout(revealTimer);
  }, [mountAnim]);

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const outsideRoute = route.outsideRoute;
  const directOutsideActive = Boolean(
    outsideRoute?.provider === 'direct-guide' &&
    (currentStep?.routeIndex ?? 0) < (route.outsideLegCoordinateCount ?? 0),
  );
  const directGateLabel = outsideRoute?.gateId.replace('GATE_', 'Gate ') ?? 'selected gate';
  const arrivalTime = new Date(Date.now() + Math.max(etaMinutes, 0) * 60_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {!hasGoogleMapsKey && (
        <View style={styles.mapUnavailableBanner}>
          <Text style={styles.mapUnavailableText}>
            {graphOnlyFallbackUsed ? 'Graph-only v2 map is active. Base map tiles are unavailable.' : 'Base map tiles are unavailable.'}
          </Text>
        </View>
      )}
      {route.metadata.startedOutside && route.metadata.entryGateId && (
        <View style={styles.v2EntryGateBanner}>
          <Text style={styles.v2EntryGateText}>Route starts from {route.origin.label}.</Text>
        </View>
      )}
      {directOutsideActive && outsideRoute && (
        <OutsideRouteStatusCard route={outsideRoute} gateLabel={directGateLabel} />
      )}

      <AnimatedSafeAreaView
        style={[
          styles.topBar,
          { opacity: mountAnim, transform: [{ translateY: mountAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
        ]}
      >
        {gpsSignalState === 'GPS_LOST' && (
          <View style={styles.weakGpsBanner}>
            <Text style={styles.weakGpsText}>Searching for GPS signal. Your position may be out of date.</Text>
          </View>
        )}
        {isWeakGps && (
          <View style={styles.weakGpsBanner}>
            <Text style={styles.weakGpsText}>Weak GPS signal detected. Route updates may be slower.</Text>
          </View>
        )}
        {rerouteStatusMessage && !reroutePending && (
          <View style={styles.rerouteHintBanner}>
            <Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>
          </View>
        )}
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
              <Text style={styles.maneuverLabel}>Direct gate guide</Text>
              <Text style={styles.nextStepText}>
                {outsideRouteMessage('direct.heading', 'en', { gate: directGateLabel })}
              </Text>
            </View>
          </View>
        ) : currentStep && !arrived ? (
          <View style={styles.instructionCard} accessibilityLabel={currentStep.text}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} size={32} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.maneuverLabel}>{InstructionService.maneuverLabel(currentStep.type)}</Text>
              <Text style={styles.instructionDistance}>
                {currentStep.distanceM > 0 ? InstructionService.formatDistance(currentStep.distanceM, settings.distanceUnit) : ''}
              </Text>
              <Text style={styles.roadNameText} numberOfLines={1} ellipsizeMode="tail">
                {currentStep.roadName ?? InstructionService.ROAD_NAME_FALLBACK}
              </Text>
              {nextStep && (
                <Text style={styles.nextStepText} numberOfLines={1}>
                  Then: {nextStep.text}
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
              <Text style={styles.timeRemaining}>{etaMinutes} min</Text>
              <Text style={styles.distanceRemaining}>
                {InstructionService.formatDistance(remainingDistance, settings.distanceUnit)} · ETA {arrivalTime}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{route.destination.label}</Text>
            </View>
            <Pressable
              testID="nav-exit-button"
              style={styles.exitButton}
              onPress={() => handleExit()}
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

      <Modal visible={arrived} transparent animationType="slide">
        <View style={styles.arrivedOverlay}>
          <View style={styles.arrivedCard}>
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
                onPress={() => handleExit()}
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
