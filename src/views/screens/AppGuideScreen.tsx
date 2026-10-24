/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text } from '@muslim-ummah/offline-navigation/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  Navigation,
  LocateFixed,
  Route,
  Shield,
  Layers,
  MapPin,
  Settings,
  TriangleAlert,
  LifeBuoy,
  Circle,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { backChevron } from '../components/common/directionalIcons';
import { MessageKey, useI18n } from '../../i18n';

type GuideSection = {
  key: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  titleKey: MessageKey;
  bodyKey: MessageKey;
};

const GUIDE_SECTIONS: GuideSection[] = [
  { key: 'welcome', icon: Navigation, titleKey: 'help.guideWelcomeTitle', bodyKey: 'help.guideWelcomeBody' },
  { key: 'search', icon: Search, titleKey: 'help.guideSearchTitle', bodyKey: 'help.guideSearchBody' },
  { key: 'destination', icon: MapPin, titleKey: 'help.guideDestinationTitle', bodyKey: 'help.guideDestinationBody' },
  { key: 'start', icon: LocateFixed, titleKey: 'help.guideStartSectionTitle', bodyKey: 'help.guideStartSectionBody' },
  { key: 'directions', icon: Route, titleKey: 'help.guideDirectionsTitle', bodyKey: 'help.guideDirectionsBody' },
  { key: 'navigation', icon: Navigation, titleKey: 'help.guideWalkTitle', bodyKey: 'help.guideWalkBody' },
  { key: 'controls', icon: Layers, titleKey: 'help.guideControlsTitle', bodyKey: 'help.guideControlsBody' },
  { key: 'settings', icon: Settings, titleKey: 'help.guideSettingsTitle', bodyKey: 'help.guideSettingsBody' },
  { key: 'gps', icon: TriangleAlert, titleKey: 'help.guideLocationTitle', bodyKey: 'help.guideLocationBody' },
  { key: 'safety', icon: Shield, titleKey: 'help.guideSafetyTitle', bodyKey: 'help.guideSafetyBody' },
  { key: 'troubleshoot', icon: LifeBuoy, titleKey: 'help.guideTroubleTitle', bodyKey: 'help.guideTroubleBody' },
];

function LegendDot({ color }: { color: string }) {
  return <Circle size={12} color={color} fill={color} />;
}

export function AppGuideScreen() {
  const navigation = useNavigation<any>();
  const BackIcon = backChevron();
  const { t } = useI18n();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <BackIcon size={26} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('help.guideTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>{t('help.guideSubtitle')}</Text>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>{t('help.guideLegendTitle')}</Text>
          <View style={styles.legendRow}>
            <LegendDot color="#1A73E8" />
            <Text style={styles.legendText}>{t('help.guideLegendYou')}</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#2E7D32" />
            <Text style={styles.legendText}>{t('help.guideLegendStart')}</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#EA4335" />
            <Text style={styles.legendText}>{t('help.guideLegendDestination')}</Text>
          </View>
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>{t('help.guideStartTitle')}</Text>
          <Text style={styles.quickBody}>{t('help.guideStartMyLocation')}</Text>
          <Text style={styles.quickBody}>{t('help.guideStartEarlier')}</Text>
          <Text style={styles.quickBody}>{t('help.guideStartPick')}</Text>
        </View>

        {GUIDE_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <View key={section.key} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Icon size={18} color="#2E7D32" />
                </View>
                <View style={styles.titleWrap}>
                  <Text style={styles.cardTitle}>{t(section.titleKey)}</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>{t(section.bodyKey)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E8EE',
    backgroundColor: '#FFFFFF',
  },
  backButton: { padding: 6 },
  headerTitle: {
    marginStart: 8,
    color: '#202124',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  quickCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E6EBF2',
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  quickBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#374151',
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  legendText: {
    fontSize: 13,
    color: '#374151',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E6EBF2',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
  },
  titleWrap: {
    flex: 1,
    marginStart: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#374151',
  },
  footerCard: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#F9E6A2',
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    color: '#7C4A03',
    fontWeight: '600',
  },
});
