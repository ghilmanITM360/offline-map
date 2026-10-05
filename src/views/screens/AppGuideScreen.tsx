/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  Navigation,
  LocateFixed,
  Route,
  WifiOff,
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

type GuideSection = {
  key: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  urduTitle: string;
  body: string;
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    key: 'welcome',
    icon: Navigation,
    title: '1. Welcome',
    urduTitle: '۱۔ خوش آمدید',
    body:
      'Ijtema Map helps you find internal walking routes inside Karachi Ijtema ground. This app is for venue navigation, not city-wide driving routes.',
  },
  {
    key: 'offline',
    icon: WifiOff,
    title: '2. Offline Maps',
    urduTitle: '۲۔ آف لائن نقشہ',
    body:
      'The map is built into the app. Search, the map, directions and navigation all work without internet — there is nothing to download.',
  },
  {
    key: 'search',
    icon: Search,
    title: '3. Search Places',
    urduTitle: '۳۔ تلاش کریں',
    body:
      'Use search to find Blocks, Rastas, Gates, Masjids, Terminals, and Help points. Category chips help you filter quickly.',
  },
  {
    key: 'destination',
    icon: MapPin,
    title: '4. Choose Destination',
    urduTitle: '۴۔ منزل منتخب کریں',
    body:
      'Tap a search result or map place to set destination. Red marker means destination. Review details, then open Directions.',
  },
  {
    key: 'start',
    icon: LocateFixed,
    title: '5. Choose Start Source',
    urduTitle: '۵۔ آغاز کا مقام',
    body:
      'Tap Change Start to open the place list. Use My Current Location = live GPS now. Use Last Known Location = your last saved location, not live. Or pick a gate, block or rasta yourself. If you start outside Ijtema, routes enter from the nearest connected official gate.',
  },
  {
    key: 'directions',
    icon: Route,
    title: '6. Directions Screen',
    urduTitle: '۶۔ ڈائریکشن اسکرین',
    body:
      'Directions shows where you are going and where you are starting from. Tap Change Start to pick current location, last known location, or a place. When route is ready, tap Show route on map to see blue line, distance, and ETA on Home.',
  },
  {
    key: 'navigation',
    icon: Navigation,
    title: '7. Navigation Screen',
    urduTitle: '۷۔ نیویگیشن اسکرین',
    body:
      'Blue marker = your current/active position. Green marker = start. Red marker = destination. Blue route line = internal path. Follow instruction card and bottom summary.',
  },
  {
    key: 'controls',
    icon: Layers,
    title: '8. Map Controls',
    urduTitle: '۸۔ نقشہ کنٹرولز',
    body:
      'Layer button changes map style. Follow direction button turns the map to face the way you are moving; tap it again for north-up. Zoom buttons change level. Recenter button jumps back to your position.',
  },
  {
    key: 'settings',
    icon: Settings,
    title: '9. Settings Meaning',
    urduTitle: '۹۔ سیٹنگز کی وضاحت',
    body:
      'Voice Language changes speech only. Map Style, Auto-follow, North-up, Voice Instructions, Auto-reroute, Distance Unit, and Walking Speed all affect navigation behavior.',
  },
  {
    key: 'gps',
    icon: TriangleAlert,
    title: '10. GPS & Permission Problems',
    urduTitle: '۱۰۔ جی پی ایس مسائل',
    body:
      'If permission is denied, open Manage in Settings. If signal is weak, pause and wait. If you are outside Ijtema, the app will enter through the nearest connected official gate automatically.',
  },
  {
    key: 'safety',
    icon: Shield,
    title: '11. Safety Tips',
    urduTitle: '۱۱۔ حفاظتی ہدایات',
    body:
      'Keep phone charged. Stop walking before reading screen. Follow official volunteers and announcements first in heavy crowd conditions.',
  },
  {
    key: 'troubleshoot',
    icon: LifeBuoy,
    title: '12. Troubleshooting',
    urduTitle: '۱۲۔ مسئلہ حل',
    body:
      'Map looks empty: close and reopen the app. Route not calculating: retry or tap Change Start. GPS not working: tap Change Start and pick a place, or use your last known location. If a gate needs connector verification or is not ready for navigation, choose another connected official gate.',
  },
];

function LegendDot({ color }: { color: string }) {
  return <Circle size={12} color={color} fill={color} />;
}

export function AppGuideScreen() {
  const navigation = useNavigation<any>();
  const BackIcon = backChevron();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackIcon size={26} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>App Guide</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>How to Use App Offline • ایپ گائیڈ</Text>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Quick Marker Legend</Text>
          <View style={styles.legendRow}>
            <LegendDot color="#1A73E8" />
            <Text style={styles.legendText}>Blue: Current / active location</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#2E7D32" />
            <Text style={styles.legendText}>Green: Start marker</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#EA4335" />
            <Text style={styles.legendText}>Red: Destination marker</Text>
          </View>
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Start Source Mini Guide</Text>
          <Text style={styles.quickBody}>Use My Current Location: Live GPS location now.</Text>
          <Text style={styles.quickBody}>Use Last Known Location: Last saved valid location (not live).</Text>
          <Text style={styles.quickBody}>Pick a place: Choose a gate, block or rasta yourself.</Text>
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
                  <Text style={styles.cardTitle}>{section.title}</Text>
                  <Text style={styles.cardUrdu}>{section.urduTitle}</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>{section.body}</Text>
            </View>
          );
        })}

        <View style={styles.footerCard}>
          <WifiOff size={16} color="#7C4A03" />
          <Text style={styles.footerText}>
            No internet? Everything here still works — the map and all routes are built into the app.
          </Text>
        </View>
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
    marginLeft: 8,
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
    marginLeft: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardUrdu: {
    fontSize: 12,
    color: '#2E7D32',
    marginTop: 2,
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
