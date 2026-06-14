/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Map as MapIcon,
  Navigation,
  Download,
  Info,
  Shield,
  Trash2,
  RefreshCw,
  Volume2,
  Globe,
  Compass,
  Calendar,
  Footprints,
  BookOpen,
  LucideIcon,
} from 'lucide-react-native';

// Walking speed presets (m/s)
const SPEED_PRESETS: { label: string; value: number }[] = [
  { label: 'Slow (0.8 m/s)', value: 0.8 },
  { label: 'Normal (1.1 m/s)', value: 1.1 },
  { label: 'Fast (1.4 m/s)', value: 1.4 },
];
import { useNavigation } from '@react-navigation/native';
import { useSettingsViewModel } from '../../viewmodels/SettingsViewModel';
import { useTheme } from '../../services/useTheme';
import { useAppStore } from '../../store/useAppStore';
import { MapConfigService } from '../../services/MapConfigService';

declare const __DEV__: boolean;

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const offlineData = useAppStore((s) => s.offlineData); // fixed: focused selector prevents every GPS store update from re-rendering SettingsScreen
  const hasInternet = useAppStore((s) => s.hasInternet);
  const developerModeEnabled = useAppStore((s) => s.developerModeEnabled);
  const setDeveloperModeEnabled = useAppStore((s) => s.setDeveloperModeEnabled);
  const hasGoogleMapsKey = MapConfigService.isGoogleMapsKeyConfigured();
  const [versionTapCount, setVersionTapCount] = useState(0);
  const {
    settings,
    handleToggle,
    updateSettingValue,
    handleRedownloadMap,
    handleDeleteMap,
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
    const rowPressHandler = type === 'toggle' ? onToggle : onPress;
    return (
      <Pressable
        android_ripple={{ color: `${theme.primary}22` }}
        style={({ pressed }) => [
          styles.settingItem,
          {
            borderBottomColor: theme.border,
            opacity: type !== 'toggle' && !onPress ? 0.88 : (pressed ? 0.72 : 1),
          },
        ]}
        disabled={type !== 'toggle' && !onPress}
        onPress={rowPressHandler}
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
            trackColor={{ false: theme.border, true: theme.primaryLight }}
            thumbColor={value ? theme.primary : '#F4F4F4'}
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
    const nextCount = versionTapCount + 1;
    if (nextCount >= 7) {
      const nextEnabled = !developerModeEnabled;
      setDeveloperModeEnabled(nextEnabled);
      setVersionTapCount(0);
      Alert.alert(
        nextEnabled ? 'Developer mode enabled' : 'Developer mode disabled',
        nextEnabled ? 'Debug overlays and controls are now available in development builds.' : 'Debug overlays are now hidden.',
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

  const locationPermissionLabel = (() => {
    if (!locationPermissionState) return 'Checking';
    if (!locationPermissionState.granted) return 'Not allowed';
    if (!locationPermissionState.servicesEnabled) return 'Location Off';
    return 'Allowed';
  })();

  const locationPermissionDescription = (() => {
    if (!locationPermissionState) return 'Checking current location permission status';
    if (!locationPermissionState.granted) {
      return locationPermissionState.canAskAgain
        ? 'Tap Manage to request location permission'
        : 'Not allowed. Tap Manage to change permission in Android settings';
    }
    if (!locationPermissionState.servicesEnabled) {
      return 'Permission allowed, but device location is off. Tap Manage to open location settings';
    }
    return 'Tap Manage to change permission in Android settings';
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton}>
          <ChevronLeft size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Appearance</Text>
          <SettingItem
            icon={Globe}
            label="Voice Language"
            value={settings.language === 'en' ? 'English (voice)' : 'اردو (voice)'}
            type="text"
            onPress={() =>
              updateSettingValue('language', settings.language === 'en' ? 'ur' : 'en')
            }
            description="Changes voice instruction language. Full app translation is not available yet"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Map Display</Text>
          <SettingItem
            icon={MapIcon}
            label="Map Style"
            value={settings.mapMode === 'standard' ? 'Standard' : 'Satellite'}
            type="text"
            onPress={() => {
              if (settings.mapMode === 'standard') {
                if (!hasInternet) {
                  Alert.alert('Satellite unavailable', 'Satellite requires internet or offline satellite tiles.');
                  return;
                }
                if (!hasGoogleMapsKey) {
                  Alert.alert('Map key not configured', MapConfigService.getMissingGoogleMapsMessage());
                  return;
                }
                updateSettingValue('mapMode', 'satellite');
                return;
              }
              updateSettingValue('mapMode', 'standard');
            }}
            description="Switch between road and satellite view"
          />
          <SettingItem
            icon={Navigation}
            label="Auto-follow Location"
            value={settings.autoFollowLocation}
            onToggle={() => handleToggle('autoFollowLocation')}
            description="Automatically center map on your position"
          />
          <SettingItem
            icon={Compass}
            label="North-up Map"
            value={settings.keepNorthFixed}
            onToggle={() => handleToggle('keepNorthFixed')}
            description="Keep north fixed; disable heading-up rotation"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Navigation</Text>
          <SettingItem
            icon={Volume2}
            label="Voice Instructions"
            value={settings.voiceInstructions}
            onToggle={() => handleToggle('voiceInstructions')}
            description="Enable turn-by-turn voice guidance"
          />
          <SettingItem
            icon={RefreshCw}
            label="Auto-reroute"
            value={settings.autoReroute}
            onToggle={() => handleToggle('autoReroute')}
            description="Recalculate route if you go off-track"
          />
          <SettingItem
            icon={Info}
            label="Distance Unit"
            value={settings.distanceUnit === 'meters' ? 'Meters' : 'Feet'}
            type="text"
            onPress={() =>
              updateSettingValue(
                'distanceUnit',
                settings.distanceUnit === 'meters' ? 'feet' : 'meters'
              )
            }
            description="Unit for distances and measurements"
          />
          <SettingItem
            icon={Footprints}
            label="Walking Speed"
            value={SPEED_PRESETS.find((p) => p.value === settings.walkingSpeed)?.label ?? `${settings.walkingSpeed} m/s`}
            type="text"
            onPress={() => {
              const options = SPEED_PRESETS.map((p) => ({
                text: p.label + (p.value === settings.walkingSpeed ? ' ✓' : ''),
                onPress: () => updateSettingValue('walkingSpeed', p.value),
              }));
              Alert.alert('Walking Speed', 'Choose your typical walking pace for ETA estimates.', [
                ...options,
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
            description="Used for walking time estimates"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Privacy & Permissions</Text>
          <SettingItem
            icon={Shield}
            label="Location Permission"
            value={locationPermissionLabel}
            type="text"
            onPress={handleReRequestPermission}
            description={locationPermissionDescription}
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Offline Data</Text>
          {offlineData.downloadDate && (
            <SettingItem
              icon={Calendar}
              label="Download Date"
              value={new Date(offlineData.downloadDate).toLocaleDateString()}
              type="text"
              description="When the map was last downloaded"
            />
          )}
          {(offlineData.sizeMB ?? 0) > 0 && ( // fixed: bare number 0 wrapped in boolean guard so {0 && ...} never renders the number directly
            <SettingItem
              icon={Info}
              label="Map Size"
              value={`${offlineData.sizeMB} MB`}
              type="text"
              description="Storage used by offline tiles"
            />
          )}
          <SettingItem
            icon={Download}
            label="Update Map"
            value="Update"
            type="text"
            onPress={() => {
              Alert.alert('Update Map', 'Delete existing map and download the latest version?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Update',
                  onPress: () =>
                    handleRedownloadMap(() =>
                      navigation.reset({ index: 0, routes: [{ name: 'DownloadMap' }] })
                    ),
                },
              ]);
            }}
            description="Download latest offline map tiles"
          />
          <SettingItem
            icon={Trash2}
            label="Delete Map Data"
            value="Delete"
            type="text"
            danger
            onPress={() => {
              Alert.alert('Delete offline map data?', 'This removes downloaded tiles and resets map status. You can download again later.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    handleDeleteMap(() =>
                      navigation.reset({ index: 0, routes: [{ name: 'DownloadMap' }] })
                    ),
                },
              ]);
            }}
            description="Free up device storage"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Help</Text>
          <SettingItem
            icon={BookOpen}
            label="App Guide"
            value="Open"
            type="text"
            onPress={() => navigation.navigate('AppGuide')}
            description="How to use offline maps, search, directions, GPS fallback, and safety tips"
          />
          {__DEV__ && (
            <SettingItem
              icon={Shield}
              label="Developer Mode"
              value={developerModeEnabled}
              onToggle={() => setDeveloperModeEnabled(!developerModeEnabled)}
              description="Show graph/debug overlays and diagnostics"
            />
          )}
        </View>

        <View style={styles.footer}>
          <Pressable onPress={handleVersionTap}>
            <Text style={[styles.version, { color: theme.subtext }]}>Version 1.0.0</Text>
          </Pressable>
          <Text style={[styles.copyright, { color: theme.subtext }]}>
            © 2026 Karachi Ijtema Navigation
          </Text>
          <Text style={[styles.credits, { color: theme.subtext }]}>
            Developed for the benefit of all pilgrims
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
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
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
    marginLeft: 16,
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
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
  textContainer: { marginLeft: 16, flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '500' },
  settingDescription: { fontSize: 12, marginTop: 2 },
  settingValue: { fontSize: 14, fontWeight: '600', maxWidth: 132, textAlign: 'right' },
  footer: { padding: 32, alignItems: 'center' },
  version: { fontSize: 14, fontWeight: '500' },
  copyright: { fontSize: 12, marginTop: 4 },
  credits: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
});
