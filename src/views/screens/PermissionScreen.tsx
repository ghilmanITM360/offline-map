/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MapPin, ShieldCheck, Info } from 'lucide-react-native';
import { usePermissionViewModel } from '../../viewmodels/PermissionViewModel';
import { useReducedMotion } from '../../viewmodels/useReducedMotion';
import { staticColors, spacing, radii, shadows } from '../../theme';

export function PermissionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Set only when SplashScreen routes here on a later launch (Welcome seen, permission
  // not granted, never skipped): usually access revoked outside the app, but possibly a
  // first ask the user closed the app on — hence the hedged copy below.
  // WelcomeViewModel's in-session Continue -> Permission transition passes no params,
  // so this stays falsy on an uninterrupted first ask (#153 Finding 2).
  const isReturningAfterRevocation = Boolean(route.params?.revoked);
  const { loading, requestPermission, skipPermission } = usePermissionViewModel();

  const reducedMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    const anim = Animated.timing(entrance, { toValue: 1, duration: 320, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reducedMotion, entrance]);

  const pressIn = () => {
    if (reducedMotion) return;
    Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true, friction: 6, tension: 200 }).start();
  };
  const pressOut = () => {
    if (reducedMotion) return;
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 140 }).start();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Animated.View
          style={[
            styles.content,
            { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
          ]}
        >
          <View style={styles.iconContainer}>
            <MapPin size={72} color={staticColors.success} />
          </View>
          <Text style={styles.title}>Find your location</Text>
          <Text style={styles.description}>
            {isReturningAfterRevocation
              ? 'Allow location access so we can show where you are and guide you to your destination. If you already allowed this before, it may have been turned off.'
              : 'Allow location access so we can show where you are and guide you to your destination.'}
          </Text>

          <View style={styles.featureCard}>
            <View style={styles.featureItem}>
              <ShieldCheck size={22} color={staticColors.success} />
              <Text style={styles.featureText}>Current location on map</Text>
            </View>
            <View style={styles.featureItem}>
              <ShieldCheck size={22} color={staticColors.success} />
              <Text style={styles.featureText}>Walking navigation</Text>
            </View>
            <View style={styles.featureItem}>
              <ShieldCheck size={22} color={staticColors.success} />
              <Text style={styles.featureText}>Turn-by-turn guidance</Text>
            </View>
          </View>

          <View style={styles.consequenceNote}>
            <Info size={16} color={staticColors.iconMuted} />
            <Text style={styles.consequenceText}>
              Without it, you can still explore the map, but live navigation won't work.
            </Text>
          </View>

          <Animated.View style={{ width: '100%', transform: [{ scale: buttonScale }] }}>
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => requestPermission(navigation)}
              onPressIn={pressIn}
              onPressOut={pressOut}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Allow Location"
            >
              {loading ? (
                <ActivityIndicator color={staticColors.white} />
              ) : (
                <Text style={styles.buttonText}>Allow Location</Text>
              )}
            </Pressable>
          </Animated.View>

          <Pressable
            style={styles.skipButton}
            onPress={() => skipPermission(navigation)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Continue Without Location"
          >
            <Text style={styles.skipText}>Continue Without Location</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticColors.white,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  content: {
    padding: spacing.xxl - spacing.xs,
    alignItems: 'center',
  },
  iconContainer: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: staticColors.lightGreenSubtext,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl + spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: staticColors.textPrimary,
    marginBottom: spacing.md + spacing.xs,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: staticColors.iconMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  featureCard: {
    width: '100%',
    backgroundColor: staticColors.infoBackground,
    borderWidth: 1,
    borderColor: staticColors.infoBorder,
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 16,
    color: staticColors.textPrimary,
    marginLeft: spacing.md,
  },
  consequenceNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xl + spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  consequenceText: {
    flex: 1,
    fontSize: 13,
    color: staticColors.iconMuted,
    lineHeight: 18,
  },
  button: {
    backgroundColor: staticColors.success,
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    ...shadows.low,
  },
  buttonDisabled: {
    backgroundColor: staticColors.focusedBlock,
  },
  buttonText: {
    color: staticColors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: spacing.xl - spacing.xs,
    padding: spacing.sm,
  },
  skipText: {
    color: staticColors.iconMuted,
    fontSize: 16,
  },
});
