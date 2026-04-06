/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DrawerContentComponentProps, DrawerContentScrollView } from '@react-navigation/drawer';
import { 
  Home, 
  Settings, 
  Download, 
  Star, 
  History, 
  HelpCircle, 
  Info, 
  Map as MapIcon
} from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';

export function CustomDrawer(props: DrawerContentComponentProps) {
  const { offlineData } = useAppStore();

  const menuItems = [
    { label: 'Home', icon: Home, route: 'Home' },
    { label: 'Offline Maps', icon: Download, route: 'DownloadMap', badge: offlineData.isDownloaded ? 'Downloaded' : 'Not Downloaded' },
    { label: 'Saved Blocks', icon: Star, route: 'Home' },
    { label: 'Recent Searches', icon: History, route: 'Home' },
    { label: 'Settings', icon: Settings, route: 'Settings' },
  ];

  const secondaryItems = [
    { label: 'Help & Feedback', icon: HelpCircle, route: 'Help' },
    { label: 'About Ijtema Map', icon: Info, route: 'About' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <MapIcon size={32} color="#FFFFFF" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Ijtema Map</Text>
          <Text style={styles.subtitle}>Offline Navigation</Text>
        </View>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
        <View style={styles.section}>
          {menuItems.map((item, index) => (
            <Pressable 
              key={index} 
              style={styles.menuItem}
              onPress={() => props.navigation.navigate(item.route)}
            >
              <item.icon size={22} color="#555" />
              <View style={styles.menuItemTextContainer}>
                <Text style={styles.menuItemLabel}>{item.label}</Text>
                {item.badge && (
                  <Text style={[
                    styles.badge, 
                    { color: item.badge === 'Downloaded' ? '#2E7D32' : '#D32F2F' }
                  ]}>
                    {item.badge}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          {secondaryItems.map((item, index) => (
            <Pressable 
              key={index} 
              style={styles.menuItem}
              onPress={() => props.navigation.navigate(item.route)}
            >
              <item.icon size={22} color="#555" />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <Text style={styles.version}>Version 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#2E7D32',
    padding: 24,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    marginLeft: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#E8F5E9',
    marginTop: 2,
  },
  drawerContent: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    marginLeft: 16,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
  },
  menuItemTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 16,
  },
  menuItemLabel: {
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
  },
  badge: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 16,
    marginHorizontal: 16,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    alignItems: 'center',
  },
  version: {
    fontSize: 12,
    color: '#AAA',
  },
});
