/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Download, Search, Navigation, LocateFixed, Route, WifiOff, Shield } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

const GUIDE_SECTIONS = [
  {
    key: 'download',
    icon: Download,
    title: '1. Download Offline Map',
    urduTitle: '۱۔ آف لائن نقشہ ڈاؤن لوڈ کریں',
    body: 'Download the map once before visiting the Ijtema ground. Wi-Fi is recommended. After download, the app can work without internet.',
  },
  {
    key: 'search',
    icon: Search,
    title: '2. Find a Block or Rasta',
    urduTitle: '۲۔ بلاک یا راستہ تلاش کریں',
    body: 'Use the search bar to find blocks, rastas, gates, masjids, or terminals. You can also tap a place on the map.',
  },
  {
    key: 'directions',
    icon: Navigation,
    title: '3. Get Directions',
    urduTitle: '۳۔ راستہ حاصل کریں',
    body: 'Select a place first and tap Directions. Choose Use My Current Location or select your starting point manually.',
  },
  {
    key: 'gps',
    icon: LocateFixed,
    title: '4. If GPS Does Not Work',
    urduTitle: '۴۔ اگر جی پی ایس کام نہ کرے',
    body: 'Choose your starting point manually. GPS can be weak in crowded areas or under tents. Follow the shown rasta route.',
  },
  {
    key: 'start',
    icon: Route,
    title: '5. Start Navigation',
    urduTitle: '۵۔ نیویگیشن شروع کریں',
    body: 'Review the route, then tap Start Navigation. Follow the steps and map line carefully.',
  },
  {
    key: 'offline',
    icon: WifiOff,
    title: '6. Offline Use',
    urduTitle: '۶۔ آف لائن استعمال',
    body: 'Without internet, search and routes still work from saved data. Some background/satellite details need downloaded tiles.',
  },
  {
    key: 'safety',
    icon: Shield,
    title: '7. Safety',
    urduTitle: '۷۔ حفاظت',
    body: 'Do not look at your phone while walking in a crowd. Stop safely before checking directions. Follow official volunteers/security first.',
  },
];

export function AppGuideScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={26} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>App Guide</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>How to Use App • ایپ گائیڈ</Text>
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
});
