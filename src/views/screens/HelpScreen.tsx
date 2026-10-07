/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HelpCircle, MessageCircle, FileText, ExternalLink, MapPin, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { backChevron } from '../components/common/directionalIcons';
import { useI18n } from '../../i18n';

const OFFICIAL_WEBSITE_URL = 'TODO_OFFICIAL_WEBSITE_URL'; // fixed: replace placeholder website with an explicit TODO constant

export function HelpScreen() {
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

  const EMERGENCY_CONTACTS = [
    { name: t('help.emergencyEdhi'), number: '115' },
    { name: t('help.emergencyRescue'), number: '1122' },
    { name: t('help.emergencyPolice'), number: '15' },
  ];

  const showFAQ = (title: string, body: string) => {
    Alert.alert(title, body, [{ text: t('common.gotIt'), style: 'default' }]);
  };

  const callNumber = (num: string) => {
    const tel = `tel:${num}`;
    Linking.canOpenURL(tel).then((ok) => {
      if (ok) Linking.openURL(tel);
      else Alert.alert(t('help.callUnsupportedTitle'), t('help.callUnsupportedBody'));
    });
  };

  const HelpItem = ({ icon: Icon, title, description, onPress }: any) => (
    <Pressable
      style={styles.helpItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? t('common.labelWithHint', { label: title, hint: description }) : title}
    >
      <View style={styles.iconContainer}>
        <Icon size={24} color="#2E7D32" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpDescription}>{description}</Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home' as never)} style={styles.backButton} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <BackIcon size={28} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('help.title')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('help.sectionCommon')}</Text>
          <HelpItem
            icon={MapPin}
            title={t('help.findBlockTitle')}
            description={t('help.findBlockDesc')}
            onPress={() => showFAQ(t('help.findBlockFaqTitle'), t('help.findBlockFaqBody'))}
          />
          <HelpItem
            icon={HelpCircle}
            title={t('help.howDirectionsTitle')}
            description={t('help.howDirectionsDesc')}
            onPress={() => showFAQ(t('help.howDirectionsFaqTitle'), t('help.howDirectionsFaqBody'))}
          />
        </View>

        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('help.sectionEmergency')}</Text>
          {EMERGENCY_CONTACTS.map((c) => (
            <HelpItem
              key={c.number}
              icon={Phone}
              title={c.name}
              description={t('help.dial', { number: c.number })}
              onPress={() => callNumber(c.number)}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('help.sectionTips')}</Text>
          <HelpItem
            icon={HelpCircle}
            title={t('help.findLocationTitle')}
            description={t('help.findLocationDesc')}
            onPress={() => showFAQ(t('help.findLocationTitle'), t('help.findLocationFaqBody'))}
          />
          <HelpItem
            icon={MessageCircle}
            title={t('help.contactTitle')}
            description={t('help.contactDesc')}
            onPress={() => Alert.alert(t('help.contactTitle'), t('help.contactBody'), [{ text: t('common.ok') }])}
          />
        </View>

        <View style={styles.section}>
          <Text style={sectionTitleStyle}>{t('help.sectionResources')}</Text>
          <HelpItem
            icon={FileText}
            title={t('help.appVersionTitle')}
            description={t('help.appVersionDesc', { version: '1.0' })}
            onPress={() => Alert.alert(t('help.appInfoTitle'), t('help.appVersionDesc', { version: '1.0' }))}
          />
          <HelpItem
            icon={ExternalLink}
            title={t('help.websiteTitle')}
            description={t('help.websiteDesc')}
            onPress={() => { void openExternalUrl(OFFICIAL_WEBSITE_URL); }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('help.footer')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#EEEEEE',
    borderBottomColor: '#EEEEEE',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E7D32',
    marginStart: 16,
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitleRtl: {
    letterSpacing: 0, // Arabic-script letters must stay joined
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    marginStart: 16,
    flex: 1,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  helpDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
