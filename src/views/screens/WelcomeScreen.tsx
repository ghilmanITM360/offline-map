/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@muslim-ummah/offline-navigation/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Map as MapIcon, MapPin, Navigation, Footprints } from 'lucide-react-native';
import { useWelcomeViewModel } from '../../viewmodels/WelcomeViewModel';
import { MessageKey, useI18n } from '../../i18n';

const BENEFITS: { icon: typeof MapPin; textKey: MessageKey }[] = [
  { icon: MapPin, textKey: 'onboarding.benefitSeeYou' },
  { icon: Navigation, textKey: 'onboarding.benefitNavigate' },
  { icon: Footprints, textKey: 'onboarding.benefitWalk' },
];

export function WelcomeScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const route = useRoute<any>();
  const onboardingStatusReadFailed = Boolean(route.params?.onboardingStatusReadFailed);
  const { continueFromWelcome } = useWelcomeViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <MapIcon size={64} color="#2E7D32" />
          </View>
          <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
          {onboardingStatusReadFailed && (
            <Text style={styles.notice}>{t('onboarding.welcomeBack')}</Text>
          )}
          <Text style={styles.description}>{t('onboarding.welcomeDescription')}</Text>

          <View style={styles.featureList}>
            {BENEFITS.map(({ icon: Icon, textKey }) => (
              <View key={textKey} style={styles.featureItem}>
                <Icon size={24} color="#2E7D32" />
                <Text style={styles.featureText}>{t(textKey)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.optionalNote}>{t('onboarding.locationOptional')}</Text>

          <Pressable
            style={styles.button}
            onPress={() => continueFromWelcome(navigation)}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.continue')}
          >
            <Text style={styles.buttonText}>{t('onboarding.continue')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  content: {
    padding: 30,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 18,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  notice: {
    fontSize: 13,
    color: '#946500',
    textAlign: 'center',
    marginBottom: 12,
  },
  featureList: {
    width: '100%',
    marginBottom: 20,
  },
  optionalNote: {
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#444',
    marginStart: 15,
    flex: 1, // long translations wrap instead of running off the screen
  },
  button: {
    backgroundColor: '#2E7D32',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
