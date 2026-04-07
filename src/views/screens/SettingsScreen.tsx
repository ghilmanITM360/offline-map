/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { ChevronLeft, Map as MapIcon, Navigation, Download, Info, Shield, Trash2, RefreshCw, Volume2, Globe } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettingsViewModel } from '../../viewmodels/SettingsViewModel';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { 
    settings, 
    handleToggle, 
    updateSettingValue,
    handleRedownloadMap, 
    handleDeleteMap, 
    handleReRequestPermission 
  } = useSettingsViewModel();

  const SettingItem = ({ icon: Icon, label, value, onToggle, type = 'toggle', onPress, description }: any) => (
    <Pressable style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingMain}>
        <View style={styles.settingLabelContainer}>
          <Icon size={22} color="#2E7D32" />
          <View style={styles.textContainer}>
            <Text style={styles.settingLabel}>{label}</Text>
            {description && <Text style={styles.settingDescription}>{description}</Text>}
          </View>
        </View>
        {type === 'toggle' ? (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: '#D1D1D1', true: '#A5D6A7' }}
            thumbColor={value ? '#2E7D32' : '#F4F4F4'}
          />
        ) : (
          <Text style={styles.settingValue}>{value}</Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={28} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Map Display</Text>
          <SettingItem
            icon={MapIcon}
            label="Map Mode"
            value={settings.mapMode === 'standard' ? 'Standard' : 'Satellite'}
            type="text"
            onPress={() => updateSettingValue('mapMode', settings.mapMode === 'standard' ? 'satellite' : 'standard')}
            description="Switch between normal and satellite view"
          />
          <SettingItem
            icon={Navigation}
            label="Auto-follow Location"
            value={settings.autoFollowLocation}
            onToggle={() => handleToggle('autoFollowLocation')}
            description="Automatically center map on your position"
          />
          <SettingItem
            icon={Globe}
            label="Language"
            value={settings.language === 'en' ? 'English' : 'Urdu'}
            type="text"
            onPress={() => updateSettingValue('language', settings.language === 'en' ? 'ur' : 'en')}
            description="Change app language"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation</Text>
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
            onPress={() => updateSettingValue('distanceUnit', settings.distanceUnit === 'meters' ? 'feet' : 'meters')}
            description="Unit for distances and measurements"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Permissions</Text>
          <SettingItem
            icon={Shield}
            label="Location Permission"
            value="Manage"
            type="text"
            onPress={handleReRequestPermission}
            description="Grant or revoke location access"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offline Data</Text>
          <SettingItem
            icon={Download}
            label="Redownload Map"
            value="45.2 MB"
            type="text"
            onPress={() => {
              Alert.alert('Redownload', 'Are you sure you want to redownload the map?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Redownload', onPress: () => handleRedownloadMap(() => navigation.navigate('DownloadMap')) }
              ]);
            }}
            description="Update offline map files"
          />
          <SettingItem
            icon={Trash2}
            label="Delete Map Data"
            value="Clear"
            type="text"
            onPress={() => {
              Alert.alert('Delete', 'This will remove offline map data. Continue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => handleDeleteMap(() => navigation.navigate('DownloadMap')) }
              ]);
            }}
            description="Free up space on your device"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.copyright}>© 2026 Karachi Ijtema Navigation</Text>
          <Text style={styles.credits}>Developed for the benefit of all pilgrims</Text>
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
    marginLeft: 16,
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
    marginLeft: 16,
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  settingMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  textContainer: {
    marginLeft: 16,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  settingValue: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  version: {
    fontSize: 14,
    color: '#AAA',
    fontWeight: '500',
  },
  copyright: {
    fontSize: 12,
    color: '#BBB',
    marginTop: 4,
  },
  credits: {
    fontSize: 11,
    color: '#CCC',
    marginTop: 2,
    fontStyle: 'italic',
  },
});
