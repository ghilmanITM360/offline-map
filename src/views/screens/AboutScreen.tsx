/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Info, Heart, Shield, ExternalLink, Map as MapIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { backChevron } from '../components/common/directionalIcons';
import { BASEMAP_ATTRIBUTION } from '../components/mapgl/basemapStyle';
import { OSM_COPYRIGHT_URL } from '../components/map/OsmAttribution';
import { useI18n } from '../../i18n';

const PRIVACY_POLICY_URL = 'TODO_PRIVACY_POLICY_URL'; // fixed: replace placeholder privacy URL with an explicit TODO constant
const TERMS_OF_SERVICE_URL = 'TODO_TERMS_OF_SERVICE_URL'; // fixed: replace placeholder terms URL with an explicit TODO constant

export function AboutScreen() {
  const navigation = useNavigation();
  const BackIcon = backChevron();
  const { t, isRTL } = useI18n();
  const sectionTitleStyle = [styles.sectionTitle, isRTL && styles.sectionTitleRtl];

  const openExternalUrl = async (url: string) => {
    if (!url.startsWith('http')) {
      Alert.alert(t('errors.linkNotReadyTitle'), t('errors.tryAgainLater')); // fixed: handle TODO URLs without throwing
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(t('errors.linkCantOpenTitle'), t('errors.linkUnsupportedBody')); // fixed: guard unsupported URLs
        return;
      }
      await Linking.openURL(url); // fixed: await the promise so errors can be caught
    } catch {
      Alert.alert(t('errors.linkCantOpenTitle'), t('errors.tryAgainLater')); // fixed: surface linking failures instead of silently rejecting
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home' as never)} style={styles.backButton} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <BackIcon size={28} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('about.title')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.logo}
            />
          </View>
          <Text style={styles.appName}>{t('common.appFullName')}</Text>
          <Text style={styles.version}>{t('about.version', { version: '1.0.0' })}</Text>
        </View>

        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('about.missionTitle')}</Text>
          <View style={styles.card}>
            <Heart size={24} color="#E91E63" style={styles.cardIcon} />
            <Text style={styles.cardText}>{t('about.missionBody')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('about.featuresTitle')}</Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{t('about.featureFind')}</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{t('about.featureDetails')}</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{t('about.featureLanguages')}</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{t('about.featureWalk')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('about.legalTitle')}</Text>
          <Pressable
            style={styles.linkItem}
            onPress={() => { void openExternalUrl(PRIVACY_POLICY_URL); }}
            accessibilityRole="button"
            accessibilityLabel={t('about.privacyPolicy')}
          >
            <Shield size={20} color="#666" />
            <Text style={styles.linkText}>{t('about.privacyPolicy')}</Text>
            <ExternalLink size={16} color="#AAA" />
          </Pressable>
          <Pressable
            style={styles.linkItem}
            onPress={() => { void openExternalUrl(TERMS_OF_SERVICE_URL); }}
            accessibilityRole="button"
            accessibilityLabel={t('about.termsOfService')}
          >
            <FileText size={20} color="#666" />
            <Text style={styles.linkText}>{t('about.termsOfService')}</Text>
            <ExternalLink size={16} color="#AAA" />
          </Pressable>
          {/* The map's own attribution control is covered while the Directions sheet is expanded to full height, so it is
              always reachable here too. The wording is the basemap's own (BASEMAP_ATTRIBUTION). */}
          <Pressable
            style={styles.linkItem}
            onPress={() => { void openExternalUrl(OSM_COPYRIGHT_URL); }}
            accessibilityRole="button"
            accessibilityLabel={t('about.mapDataLabel', { attribution: BASEMAP_ATTRIBUTION })}
          >
            <MapIcon size={20} color="#666" />
            <Text style={styles.linkText}>{t('about.mapData', { attribution: BASEMAP_ATTRIBUTION })}</Text>
            <ExternalLink size={16} color="#AAA" />
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('about.madeWith')}</Text>
          <Text style={styles.footerSubText}>{t('about.copyright')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const FileText = ({ size, color }: any) => <Info size={size} color={color} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    elevation: 2,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginStart: 16,
    color: '#333',
  },
  content: {
    flex: 1,
  },
  logoSection: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 16,
    textAlign: 'center',
  },
  version: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitleRtl: {
    letterSpacing: 0, // Arabic-script letters must stay joined
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardIcon: {
    marginEnd: 12,
    marginTop: 2,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
    flex: 1,
  },
  featureList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
    marginEnd: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#444',
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
  },
  linkText: {
    fontSize: 16,
    color: '#333',
    marginStart: 12,
    flex: 1,
  },
  footer: {
    padding: 48,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  footerSubText: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 4,
  },
});
