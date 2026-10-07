/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, Navigation, RefreshCw, Volume2, VolumeX, X } from 'lucide-react-native';

import { InstructionService } from '../../../services/InstructionService';
import { translate, useI18n } from '../../../i18n';
import { localizeVenueName } from '../../../i18n/venueNames';
import { staticColors } from '../../../theme';
import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';
import { NavigationOverlayV1 } from '../../../viewmodels/useNavigationOverlayV1';
import { computeNavRecenterInset, resolveNavBarHeight } from '../../../viewmodels/useOverlayInsets';
import { NAV_TOUCH_TARGET_HIT_SLOP, navOverlayStyles as styles } from './navOverlayStyles';

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
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
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
      AccessibilityInfo.announceForAccessibility(t('arrival.announcement', { place: localizeVenueName(destination.name) }));
    }
  }, [arrived, destination, t]);

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const arrivalTime = InstructionService.formatClockTime(new Date(Date.now() + (route.estimatedTimeMin ?? 0) * 60_000));
  const remainingText = InstructionService.formatDistance(
    remainingDistance > 0 ? remainingDistance : route.totalDistance,
    settings.distanceUnit,
  );

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
            <Text style={styles.rerouteText}>{t('navigation.findingNewWay')}</Text>
          </View>
        ) : currentStep && !arrived ? (
          <View style={styles.instructionCard} accessibilityLabel={currentStep.text}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} size={32} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.maneuverLabel}>{InstructionService.maneuverLabel(currentStep.type)}</Text>
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
              accessibilityLabel={isMuted ? t('navigation.unmuteVoice') : t('navigation.muteVoice')}
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
              <Text style={styles.weakGpsText}>{t('navigation.weakSignal')}</Text>
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
                {InstructionService.formatDuration(route.estimatedTimeMin)}
              </Text>
              <Text style={styles.distanceRemaining}>
                {t('navigation.remainingWithEta', { distance: remainingText, time: arrivalTime })}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{destination ? localizeVenueName(destination.name) : ''}</Text>
            </View>
            <Pressable
              testID="nav-exit-button"
              style={styles.exitButton}
              onPress={requestNavigationExit}
              hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t('navigation.exitA11y')}
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
            { bottom: computeNavRecenterInset(resolveNavBarHeight(bottomBarHeight, insets.bottom)) },
          ]}
          onPress={() => setIsAutoFollowing(true)}
          hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('navigation.recenterA11y')}
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
            <Text style={styles.arrivedTitle}>{t('arrival.title')}</Text>
            {locale === 'en' && <Text style={styles.arrivedUrdu}>{translate('ur', 'arrival.title')}</Text>}
            <Text style={styles.arrivedSubtitle}>{destination ? localizeVenueName(destination.name) : ''}</Text>
            <View style={styles.arrivedActionsRow}>
              <Pressable
                testID="nav-arrived-recenter-button"
                style={styles.arrivedSecondaryButton}
                onPress={() => setIsAutoFollowing(true)}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('navigation.recenterA11y')}
              >
                <LocateFixed size={18} color={staticColors.routeInside} />
                <Text style={styles.arrivedSecondaryButtonText}>{t('arrival.recenter')}</Text>
              </Pressable>
              <Pressable
                testID="nav-arrived-done-button"
                style={styles.arrivedButton}
                onPress={completeArrivalNavigation}
                hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('arrival.doneA11y')}
              >
                <Text style={styles.arrivedButtonText}>{t('arrival.done')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
