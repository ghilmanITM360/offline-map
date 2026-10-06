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
  Navigation,
  Info,
  Shield,
  Trash2,
  RefreshCw,
  Volume2,
  Globe,
  Compass,
  Footprints,
  BookOpen,
  LucideIcon,
} from 'lucide-react-native';

// Walking speed presets. `value` (m/s) drives internal ETA math only —
// labels stay plain-language, no raw units shown to the user.
const SPEED_PRESETS: { label: string; value: number }[] = [
  { label: 'Slow', value: 0.8 },
  { label: 'Normal', value: 1.1 },
  { label: 'Fast', value: 1.4 },
];
import { useNavigation } from '@react-navigation/native';
import { backChevron } from '../components/common/directionalIcons';
import { useSettingsViewModel } from '../../viewmodels/SettingsViewModel';
import { useTheme } from '../../services/useTheme';
import { useAppStore } from '../../store/useAppStore';
import { staticColors } from '../../theme';

declare const __DEV__: boolean;

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const BackIcon = backChevron();
  const theme = useTheme();
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
    const accessibleLabel = description ? `${label}, ${description}` : label;
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
    if (locationPermissionState.servicesState === 'disabled') return 'Location Off';
    if (locationPermissionState.servicesState === 'unknown') return 'Checking location';
    return 'Allowed';
  })();

  const locationPermissionDescription = (() => {
    if (!locationPermissionState) return 'Checking…';
    if (!locationPermissionState.granted) {
      return locationPermissionState.canAskAgain
        ? 'Tap to allow location'
        : 'Location is off for this app. Tap to turn it on.';
    }
    if (locationPermissionState.servicesState === 'disabled') {
      return "Your phone's location is off. Tap to turn it on.";
    }
    if (locationPermissionState.servicesState === 'unknown') {
      return "Couldn't check your location. Tap to try again.";
    }
    return 'Tap to change this in Settings';
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Appearance</Text>
          <SettingItem
            icon={Globe}
            label="Voice Language"
            value={settings.language === 'en' ? 'English' : 'اردو'}
            type="text"
            onPress={() =>
              updateSettingValue('language', settings.language === 'en' ? 'ur' : 'en')
            }
            description="Language of spoken directions"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Map Display</Text>
          <SettingItem
            icon={Navigation}
            label="Auto-follow Location"
            value={settings.autoFollowLocation}
            onToggle={() => handleToggle('autoFollowLocation')}
            description="Keeps the map on where you are"
          />
          <SettingItem
            icon={Compass}
            label="North-up Map"
            value={settings.keepNorthFixed}
            onToggle={() => handleToggle('keepNorthFixed')}
            description="Map always has north at the top"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Navigation</Text>
          <SettingItem
            icon={Volume2}
            label="Voice Instructions"
            value={settings.voiceInstructions}
            onToggle={() => handleToggle('voiceInstructions')}
            description="Speaks each turn aloud"
          />
          <SettingItem
            icon={RefreshCw}
            label="Fix my route automatically"
            value={settings.autoReroute}
            onToggle={() => handleToggle('autoReroute')}
            description="Finds a new way if you go the wrong way"
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
            description="Meters or feet"
          />
          <SettingItem
            icon={Footprints}
            label="Walking Speed"
            value={SPEED_PRESETS.find((p) => p.value === settings.walkingSpeed)?.label ?? 'Normal'}
            type="text"
            onPress={() => {
              const options = SPEED_PRESETS.map((p) => ({
                text: p.label + (p.value === settings.walkingSpeed ? ' ✓' : ''),
                onPress: () => updateSettingValue('walkingSpeed', p.value),
              }));
              Alert.alert('Walking Speed', 'Choose how fast you walk. This sets the time shown.', [
                ...options,
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
            description="Used to show how long a walk takes"
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Location</Text>
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
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Privacy</Text>
          <SettingItem
            icon={Trash2}
            label="Clear Recent Searches"
            value="Clear"
            type="text"
            onPress={() => handleClearLocalData('recentSearches')}
            description="Kept on this device for up to 30 days"
          />
          <SettingItem
            icon={Trash2}
            label="Clear Saved Location"
            value="Clear"
            type="text"
            onPress={() => handleClearLocalData('savedLocation')}
            description="Your saved location, kept for up to 24 hours"
          />
          <SettingItem
            icon={Trash2}
            label="Clear Unfinished Trip Reminder"
            value="Clear"
            type="text"
            onPress={() => handleClearLocalData('navigationRecovery')}
            description="Unfinished-trip reminder, kept for up to 2 hours"
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
            description="How to find places and get directions"
          />
          <SettingItem
            icon={Info}
            label="About Ijtema Map"
            value="Open"
            type="text"
            onPress={() => navigation.navigate('About')}
            description="Version, privacy and terms"
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
