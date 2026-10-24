/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  AppState,
} from 'react-native';
import { Text } from '@muslim-ummah/offline-navigation/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Info, Shield, Trash2, Volume2, BookOpen, LucideIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { backChevron } from '../components/common/directionalIcons';
import { useSettingsViewModel } from '../../viewmodels/SettingsViewModel';
import { useTheme } from '../../services/useTheme';
import { useAppStore } from '../../store/useAppStore';
import { staticColors } from '../../theme';
import { LOCALE_CODES, LOCALES, useI18n } from '../../i18n';

declare const __DEV__: boolean;

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const BackIcon = backChevron();
  const theme = useTheme();
  const { t, locale, setLocale, isRTL } = useI18n();
  const developerModeEnabled = useAppStore((s) => s.developerModeEnabled);
  const setDeveloperModeEnabled = useAppStore((s) => s.setDeveloperModeEnabled);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const {
    settings,
    handleToggle,
    updateSettingValue,
    handleClearLocalData,
    handleReRequestPermission,
    locationPermissionState,
    refreshLocationPermissionState,
  } = useSettingsViewModel();

  type SettingItemProps = {
    icon: LucideIcon;
    label: string;
    description?: string;
    value?: any;
    type?: 'toggle' | 'text' | 'button';
    onToggle?: () => void;
    onPress?: () => void;
    danger?: boolean;
  };

  const SettingItem = ({
    icon: Icon,
    label,
    value,
    onToggle,
    type = 'toggle',
    onPress,
    description,
    danger,
  }: SettingItemProps) => {
    const isToggle = type === 'toggle';
    const rowPressHandler = isToggle ? onToggle : onPress;
    const accessibleLabel = description ? t('common.labelWithHint', { label, hint: description }) : label;
    return (
      <Pressable
        android_ripple={{ color: `${theme.primary}22` }}
        style={({ pressed }) => [
          styles.settingItem,
          {
            borderBottomColor: theme.border,
            opacity: !isToggle && !onPress ? 0.88 : (pressed ? 0.72 : 1),
          },
        ]}
        disabled={!isToggle && !onPress}
        onPress={rowPressHandler}
        accessibilityRole={isToggle ? 'switch' : 'button'}
        accessibilityLabel={accessibleLabel}
        accessibilityState={isToggle ? { checked: !!value } : { disabled: !isToggle && !onPress }}
      >
      <View style={styles.settingMain}>
        <View style={styles.settingLabelContainer}>
          <Icon size={22} color={danger ? theme.danger : theme.primary} />
          <View style={styles.textContainer}>
            <Text style={[styles.settingLabel, { color: danger ? theme.danger : theme.text }]} numberOfLines={1} ellipsizeMode="tail">
              {label}
            </Text>
            {description && (
              <Text style={[styles.settingDescription, { color: theme.subtext }]} numberOfLines={2} ellipsizeMode="tail">{description}</Text>
            )}
          </View>
        </View>
        {type === 'toggle' ? (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: theme.border, true: theme.chipActive }}
            thumbColor={value ? theme.accent : staticColors.switchThumbOff}
            // The row Pressable already carries the switch's accessible role/label/state —
            // see LayersSheet.tsx's OverlayRow for why (avoids a redundant second
            // TalkBack stop announcing "switch, on/off" a second time).
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <Text style={[styles.settingValue, { color: danger ? theme.danger : theme.primary }]} numberOfLines={1} ellipsizeMode="tail">
            {value}
          </Text>
        )}
      </View>
      </Pressable>
    );
  };

  const handleVersionTap = () => {
    if (!__DEV__) return; // release builds have no developer mode, not even a hidden gesture
    const nextCount = versionTapCount + 1;
    if (nextCount >= 7) {
      const nextEnabled = !developerModeEnabled;
      setDeveloperModeEnabled(nextEnabled);
      setVersionTapCount(0);
      Alert.alert(
        t(nextEnabled ? 'settings.developerEnabledTitle' : 'settings.developerDisabledTitle'),
        t(nextEnabled ? 'settings.developerEnabledBody' : 'settings.developerDisabledBody'),
      );
      return;
    }
    setVersionTapCount(nextCount);
  };

  useEffect(() => {
    void refreshLocationPermissionState();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshLocationPermissionState();
      }
    });
    return () => sub.remove();
  }, [refreshLocationPermissionState]);

  // One plain state word, said once. "Manage" opens the permission prompt or the phone's own settings as needed.
  const locationHint = t(
    !locationPermissionState || locationPermissionState.servicesState === 'unknown'
      ? 'settings.locationHintChecking'
      : locationPermissionState.granted && locationPermissionState.servicesState !== 'disabled'
        ? 'settings.locationHintOn'
        : 'settings.locationHintOff',
  );
  // Arabic-script letters must stay joined, so the small-caps letter spacing is Latin-only.
  const sectionTitleStyle = [styles.sectionTitle, isRTL && styles.sectionTitleRtl];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <BackIcon size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView style={styles.content}>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[sectionTitleStyle, { color: theme.primary }]}>{t('settings.language')}</Text>
          {LOCALE_CODES.map((code) => (
            <Pressable
              key={code}
              android_ripple={{ color: `${theme.primary}22` }}
              style={[styles.settingItem, styles.languageRow, { borderBottomColor: theme.border }]}
              onPress={() => setLocale(code)}
              accessibilityRole="radio"
              accessibilityLabel={LOCALES[code].autonym}
              accessibilityState={{ selected: code === locale }}
            >
              <Text style={[styles.settingLabel, { color: theme.text }]}>{LOCALES[code].autonym}</Text>
              {code === locale && <Check size={22} color={theme.primary} />}
            </Pressable>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[sectionTitleStyle, { color: theme.primary }]}>{t('settings.sectionNavigation')}</Text>
          <SettingItem
            icon={Volume2}
            label={t('settings.voiceInstructions')}
            value={settings.voiceInstructions}
            onToggle={() => handleToggle('voiceInstructions')}
            description={t('settings.voiceInstructionsHint')}
          />
          <SettingItem
            icon={Info}
            label={t('settings.distanceUnit')}
            value={settings.distanceUnit === 'meters' ? t('settings.unitMeters') : t('settings.unitFeet')}
            type="text"
            onPress={() =>
              updateSettingValue(
                'distanceUnit',
                settings.distanceUnit === 'meters' ? 'feet' : 'meters'
              )
            }
            description={t('settings.distanceUnitHint')}
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[sectionTitleStyle, { color: theme.primary }]}>{t('settings.sectionLocation')}</Text>
          <SettingItem
            icon={Shield}
            label={t('settings.location')}
            value={t('settings.locationManage')}
            type="text"
            onPress={handleReRequestPermission}
            description={locationHint}
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[sectionTitleStyle, { color: theme.primary }]}>{t('settings.sectionPrivacy')}</Text>
          <SettingItem
            icon={Trash2}
            label={t('settings.clearRecent')}
            value={t('common.clear')}
            type="text"
            onPress={() => handleClearLocalData('recentSearches')}
            description={t('settings.clearRecentHint')}
          />
          <SettingItem
            icon={Trash2}
            label={t('settings.clearSaved')}
            value={t('common.clear')}
            type="text"
            onPress={() => handleClearLocalData('savedLocation')}
            description={t('settings.clearSavedHint')}
          />
          <SettingItem
            icon={Trash2}
            label={t('settings.clearJourney')}
            value={t('common.clear')}
            type="text"
            onPress={() => handleClearLocalData('navigationRecovery')}
            description={t('settings.clearJourneyHint')}
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[sectionTitleStyle, { color: theme.primary }]}>{t('settings.sectionHelp')}</Text>
          <SettingItem
            icon={BookOpen}
            label={t('settings.appGuide')}
            value={t('settings.open')}
            type="text"
            onPress={() => navigation.navigate('AppGuide')}
            description={t('settings.appGuideHint')}
          />
          <SettingItem
            icon={Info}
            label={t('settings.aboutApp')}
            value={t('settings.open')}
            type="text"
            onPress={() => navigation.navigate('About')}
            description={t('settings.aboutHint')}
          />
          {__DEV__ && (
            <SettingItem
              icon={Shield}
              label={t('settings.developerMode')}
              value={developerModeEnabled}
              onToggle={() => setDeveloperModeEnabled(!developerModeEnabled)}
              description={t('settings.developerModeHint')}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Pressable onPress={handleVersionTap}>
            <Text style={[styles.version, { color: theme.subtext }]}>{t('settings.version', { version: '1.0.0' })}</Text>
          </Pressable>
          <Text style={[styles.copyright, { color: theme.subtext }]}>
            {t('settings.copyright')}
          </Text>
          <Text style={[styles.credits, { color: theme.subtext }]}>
            {t('settings.credits')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    elevation: 2,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginStart: 16 },
  content: { flex: 1 },
  section: {
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginStart: 16,
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitleRtl: { letterSpacing: 0 },
  settingItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLabelContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  textContainer: { marginStart: 16, flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '500' },
  settingDescription: { fontSize: 12, marginTop: 2 },
  languageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  settingValue: { fontSize: 14, fontWeight: '600', maxWidth: 132, textAlign: 'auto' },
  footer: { padding: 32, alignItems: 'center' },
  version: { fontSize: 14, fontWeight: '500' },
  copyright: { fontSize: 12, marginTop: 4 },
  credits: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
});
