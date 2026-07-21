/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, Navigation, RefreshCw, Volume2, VolumeX, X } from 'lucide-react-native';

import { InstructionService } from '../../../services/InstructionService';
import { NavigationOverlayV2 } from '../../../viewmodels/useNavigationOverlayV2';
import { NAV_TOUCH_TARGET_HIT_SLOP, navOverlayStyles as styles } from './navOverlayStyles';

function StepIcon({ type, size = 32 }: { type: string; size?: number }) {
  const color = '#FFFFFF';
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
    rerouteStatusMessage,
    snappedLocation,
    settings,
    graphOnlyFallbackUsed,
    handleExit,
    setIsAutoFollowing,
    bottomBarHeight,
    setBottomBarHeight,
  } = overlay;

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
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

      <SafeAreaView style={styles.topBar}>
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
            <RefreshCw size={28} color="#FFFFFF" />
            <Text style={styles.rerouteText}>Recalculating...</Text>
          </View>
        ) : currentStep && !arrived ? (
          <View style={styles.instructionCard}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} size={32} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionDistance}>
                {currentStep.distanceM > 0 ? InstructionService.formatDistance(currentStep.distanceM, settings.distanceUnit) : ''}
              </Text>
              <Text style={styles.instructionText} numberOfLines={2} ellipsizeMode="tail">{currentStep.text}</Text>
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
            >
              {isMuted ? <VolumeX size={24} color="#FFFFFF" /> : <Volume2 size={24} color="#FFFFFF" />}
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      {!arrived && (
        <View
          style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
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
            >
              <X size={20} color="#FFFFFF" />
              <Text style={styles.exitText}>Exit</Text>
            </Pressable>
          </View>
        </View>
      )}

      {snappedLocation && (
        <Pressable
          testID="nav-recenter-button"
          style={[
            styles.recenterButton,
            // bottomBarHeight already bakes in insets.bottom (it's the bar's own
            // paddingBottom) — stacking insets.bottom again here would double-count it.
            { bottom: (bottomBarHeight || Math.max(insets.bottom, 12) + 140) + 12 },
          ]}
          onPress={() => setIsAutoFollowing(true)}
          hitSlop={NAV_TOUCH_TARGET_HIT_SLOP}
        >
          <LocateFixed size={20} color="#1A73E8" />
        </Pressable>
      )}

      <Modal visible={arrived} transparent animationType="slide">
        <View style={styles.arrivedOverlay}>
          <View style={styles.arrivedCard}>
            <MapPin size={52} color="#2E7D32" />
            <Text style={styles.arrivedTitle}>You've Arrived!</Text>
            <Text style={styles.arrivedUrdu}>منزل پر پہنچ گئے</Text>
            <Text style={styles.arrivedSubtitle}>{route.destination.label}</Text>
            <Pressable style={styles.arrivedButton} onPress={() => handleExit()}>
              <Text style={styles.arrivedButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
