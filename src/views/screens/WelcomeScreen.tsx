/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { useWelcomeViewModel } from '../../viewmodels/WelcomeViewModel';
import { WelcomeHeroIcon } from '../components/common/WelcomeHeroIcon';
import { TentSkyline } from '../components/common/TentSkyline';
import { premium, radii, spacing } from '../../theme';

export function WelcomeScreen() {
  const navigation = useNavigation<any>();
  const { continueFromWelcome } = useWelcomeViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.content}>
          <View style={styles.markWrap}>
            <WelcomeHeroIcon size={84} />
          </View>
          <Text style={styles.urduTitle}>اجتماع</Text>
          <Text style={styles.title}>Karachi Ijtema</Text>
          <Text style={styles.subtitle}>Offline Navigation</Text>
          <Text style={styles.description}>Find blocks, gates, rastas and facilities with ease.</Text>

          <TentSkyline width={280} height={170} style={styles.illustration} />

          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => continueFromWelcome(navigation)}
            accessibilityRole="button"
            accessibilityLabel="Get Started"
          >
            <Text style={styles.ctaLabel}>Get Started</Text>
            <ChevronRight size={20} color={premium.card} />
          </Pressable>

          <Text style={styles.footer}>Offline Maps • Always With You</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CTA_HEIGHT = 56;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: premium.canvas,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  content: {
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
  },
  markWrap: {
    marginBottom: spacing.sm,
  },
  urduTitle: {
    fontSize: 58,
    lineHeight: 68,
    fontWeight: '700',
    color: premium.primary,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: premium.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: premium.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: premium.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  illustration: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  cta: {
    minHeight: CTA_HEIGHT,
    minWidth: '100%',
    borderRadius: radii.pill,
    backgroundColor: premium.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  ctaPressed: {
    backgroundColor: premium.primaryPressed,
  },
  ctaLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: premium.card,
  },
  footer: {
    fontSize: 13,
    fontWeight: '500',
    color: premium.textMuted,
    marginTop: spacing.lg,
  },
});
