/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localizeVenueName } from '../../../i18n/venueNames';
import { useI18n } from '../../../i18n';
import { useAccessibilityFocus } from '../../hooks/useAccessibilityFocus';
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, Navigation, RefreshCw, Volume2, VolumeX, X } from 'lucide-react-native';

import { InstructionService } from '../../../services/InstructionService';
import { staticColors } from '../../../theme';
import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';
import { NavigationOverlayV1 } from '../../../viewmodels/useNavigationOverlayV1';
import { computeNavRecenterInset, resolveNavBarHeight } from '../../../viewmodels/useOverlayInsets';
import { NAV_TOUCH_TARGET_HIT_SLOP, navOverlayStyles as styles } from './navOverlayStyles';
import { physicalLayerStyle } from '../map/PhysicalLayer';

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
 * shared MapView while a legacy (v1) route is being navigated. Renders as a sibling of the
 * MapView, not inside it — moved verbatim out of the old standalone NavigationScreen. */
export function NavigationChromeV1({ overlay, hasBaseMap }: { overlay: NavigationOverlayV1; hasBaseMap: boolean }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const {
    route,
    destination,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    arrived,
    reroutePending,
    isWeakGps,
    rerouteStatusMessage,
    snappedLocation,
    settings,
    requestNavigationExit,
    completeArrivalNavigation,
    setIsAutoFollowing,
    bottomBarHeight,
    setBottomBarHeight,
  } = overlay;

  const { ref: instructionHeadingRef } = useAccessibilityFocus(route ? (arrived ? "arrival" : "navigation") : null);
  const mountAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Held back a beat so the chrome doesn't pop in on the same frame as the route-preview
    // sheet collapsing / CameraManager's enterNavigationCamera move — see NAV_TRANSITION_TIMINGS.
    const revealTimer = setTimeout(() => {
      Animated.timing(mountAnim, { toValue: 1, duration: NAV_TRANSITION_TIMINGS.chromeFadeMs, useNativeDriver: true }).start();
    }, NAV_TRANSITION_TIMINGS.chromeRevealDelayMs);
    return () => clearTimeout(revealTimer);
  }, [mountAnim]);

  // #64: one-time TalkBack announcement on arrival — the visible "You've Arrived!" card is
  // otherwise silent to screen-reader users, who get no signal the trip ended.
  useEffect(() => {
    if (arrived && destination) {
      AccessibilityInfo.announceForAccessibility(t('navigation.arrivedAnnouncement', {name: localizeVenueName(destination.name)}));
    }
  }, [arrived, destination]);

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const arrivalTime = new Date(Date.now() + (route.estimatedTimeMin ?? 0) * 60_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <AnimatedSafeAreaView
        testID="navigation-top-stack-v1"
        style={[
          styles.topBar,
          { opacity: mountAnim, transform: [{ translateY: mountAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
        ]}
      >
        {reroutePending ? (
          <View style={[styles.instructionCard, styles.rerouteCard]}>
            <RefreshCw size={28} color={staticColors.white} />
            <Text style={styles.rerouteText}>{t('navigation.rerouting')}</Text>
          </View>
        ) : currentStep && !arrived ? (
          <View style={styles.instructionCard} accessibilityLabel={currentStep.text}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} size={32} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text ref={instructionHeadingRef} accessible accessibilityRole="header" style={styles.maneuverLabel}>{InstructionService.maneuverLabel(currentStep.type)}</Text>
              <Text style={styles.instructionDistance}>
                {currentStep.distance > 0 ? InstructionService.formatDistance(currentStep.distance, settings.distanceUnit) : ''}
              </Text>
              {InstructionService.stepRoadLine(currentStep, destination?.name) ? (
                <Text style={styles.roadNameText} numberOfLines={1} ellipsizeMode="tail">
                {InstructionService.stepRoadLine(currentStep, destination?.name)}
              </Text>
              ) : null}
              {nextStep && (
                // B-001: was the full raw instruction sentence, clipped by numberOfLines={1}
                // at exactly the upcoming place name — see NavigationChromeV2's identical fix.
                <Text style={styles.nextStepText} numberOfLines={1}>
                  {InstructionService.nextStepPreview(nextStep, destination?.name)}
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
        {/* Single top safety/status slot — weak-GPS status outranks rerouting status, which
            outranks basemap degradation. Never stack more than one. */}
        <View style={styles.topStatusStack}>
          {isWeakGps ? (
            <View style={styles.weakGpsBanner} accessibilityLiveRegion="polite">
              <Text style={styles.weakGpsText}>{t('navigation.weak')}</Text>
            </View>
          ) : rerouteStatusMessage && !reroutePending ? (
            <View style={styles.rerouteHintBanner} accessibilityLiveRegion="polite">
              <Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>
            </View>
          ) : !hasBaseMap ? (
            <View style={styles.mapUnavailableBanner} accessibilityLiveRegion="polite">
              <Text style={styles.mapUnavailableText}>{t('navigation.mapUnavailable')}</Text>
            </View>
          ) : null}
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
              <Text style={styles.timeRemaining}>
                {route ? InstructionService.formatDuration(route.estimatedTimeMin) : t('navigation.unknownMinutes')}
              </Text>
              <Text style={styles.distanceRemaining}>
                {remainingDistance > 0
                  ? InstructionService.formatDistance(remainingDistance, settings.distanceUnit)
                  : route
                  ? InstructionService.formatDistance(route.totalDistance, settings.distanceUnit)
                  : '—'}{' '}
                · {t('navigation.eta', {time: arrivalTime})}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{destination?.name ? localizeVenueName(destination.name) : ''}</Text>
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
        </Animated.View>
      )}

      {snappedLocation && (
        <Pressable
          testID="nav-recenter-button"
          style={[
            styles.recenterButton,
            physicalLayerStyle,
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
            <Text ref={instructionHeadingRef} accessible accessibilityRole="header" style={styles.arrivedTitle}>{t('navigation.arrived')}</Text>
            <Text style={styles.arrivedUrdu}>{t('navigation.arrivedSubtitle')}</Text>
            <Text style={styles.arrivedSubtitle}>{destination?.name ? localizeVenueName(destination.name) : ''}</Text>
            <View style={styles.arrivedActionsRow}>
              <Pressable
                testID="nav-arrived-recenter-button"
                style={styles.arrivedSecondaryButton}
                onPress={() => setIsAutoFollowing(true)}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('navigation.recenterLabel')}
              >
                <LocateFixed size={18} color={staticColors.routeInside} />
                <Text style={styles.arrivedSecondaryButtonText}>{t('navigation.recenter')}</Text>
              </Pressable>
              <Pressable
                testID="nav-arrived-done-button"
                style={styles.arrivedButton}
                onPress={completeArrivalNavigation}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('navigation.doneLabel')}
              >
                <Text style={styles.arrivedButtonText}>{t('navigation.done')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
