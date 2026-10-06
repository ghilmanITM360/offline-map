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
    body: 'Ijtema Map helps you find your way on foot inside the Karachi Ijtema ground.',
  },
  {
    key: 'search',
    icon: Search,
    title: '2. Search Places',
    urduTitle: '۲۔ تلاش کریں',
    body: 'Search for a block, gate, rasta, masjid or help point. Tap a place to see it on the map.',
  },
  {
    key: 'destination',
    icon: MapPin,
    title: '3. Choose Destination',
    urduTitle: '۳۔ منزل منتخب کریں',
    body: 'Tap a place, then tap Directions. A red marker shows where you are going.',
  },
  {
    key: 'start',
    icon: LocateFixed,
    title: '4. Choose Where You Start',
    urduTitle: '۴۔ آغاز کا مقام',
    body:
      'In Directions, tap the From row. Choose Use my location, or pick a gate, block or rasta yourself. If you are outside Ijtema, we guide you to the nearest gate first.',
  },
  {
    key: 'directions',
    icon: Route,
    title: '5. Directions Screen',
    urduTitle: '۵۔ ڈائریکشن اسکرین',
    body:
      'Directions shows From and To. Tap either one to change it. When a route is found you see the time and distance. Tap Start Navigation to be guided as you walk. If you picked your own start, tap Start route to follow the steps one by one.',
  },
  {
    key: 'navigation',
    icon: Navigation,
    title: '6. While You Walk',
    urduTitle: '۶۔ چلتے وقت',
    body:
      'Blue marker: you. Green marker: where you start. Red marker: where you are going. Follow the card at the top for the next turn. If you go the wrong way, we find a new way.',
  },
  {
    key: 'controls',
    icon: Layers,
    title: '7. Map Controls',
    urduTitle: '۷۔ نقشہ کنٹرولز',
    body:
      'Follow direction turns the map the way you walk; tap it again to keep north at the top. Recenter brings the map back to you. More map controls has layers and zoom. You can also pinch to zoom.',
  },
  {
    key: 'settings',
    icon: Settings,
    title: '8. Settings Meaning',
    urduTitle: '۸۔ سیٹنگز کی وضاحت',
    body:
      'In Settings you can turn spoken directions on or off, choose meters or feet, and clear what the app remembers on your phone. Location shows whether live guidance is on.',
  },
  {
    key: 'gps',
    icon: TriangleAlert,
    title: '9. Location Problems',
    urduTitle: '۹۔ لوکیشن کے مسائل',
    body:
      "If we can't find you, stand in an open area and wait a moment. If location is off, turn it on in Settings. You can always choose where you are starting from instead.",
  },
  {
    key: 'safety',
    icon: Shield,
    title: '10. Safety Tips',
    urduTitle: '۱۰۔ حفاظتی ہدایات',
    body:
      'Keep your phone charged. Stop walking before you read the screen. In a heavy crowd, follow volunteers and announcements first.',
  },
  {
    key: 'troubleshoot',
    icon: LifeBuoy,
    title: '11. Troubleshooting',
    urduTitle: '۱۱۔ مسئلہ حل',
    body:
      "Map looks empty: close and reopen the app. No route found: tap Try again or choose another start. Can't find you: choose where you're starting from. If a gate isn't ready, choose another gate.",
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
        <Text style={styles.subtitle}>How to use the app • ایپ گائیڈ</Text>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Quick Marker Legend</Text>
          <View style={styles.legendRow}>
            <LegendDot color="#1A73E8" />
            <Text style={styles.legendText}>Blue: you</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#2E7D32" />
            <Text style={styles.legendText}>Green: where you start</Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#EA4335" />
            <Text style={styles.legendText}>Red: where you are going</Text>
          </View>
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Where You Start</Text>
          <Text style={styles.quickBody}>Use my location: we show the way from where you stand.</Text>
          <Text style={styles.quickBody}>Use earlier location: from where you were a little while ago.</Text>
          <Text style={styles.quickBody}>Pick a place: choose a gate, block or rasta yourself.</Text>
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
