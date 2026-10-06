/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DrawerContentComponentProps, DrawerContentScrollView } from '@react-navigation/drawer';
import { 
  Home, 
  Search,
  Settings, 
  HelpCircle, 
  Info, 
  Map as MapIcon
} from 'lucide-react-native';
import { useTheme } from '../../services/useTheme'; // fixed: use theme-safe colors for icons and badges
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { staticColors } from '../../theme';

const DRAWER_ICON_COLOR_KEY = 'subtext'; // fixed: centralize drawer icon color selection for future theming changes

export function CustomDrawer(props: DrawerContentComponentProps) {
  const theme = useTheme(); // fixed: source icon and badge colors from the active theme
  const insets = useSafeAreaInsets();

  const menuItems = [
    { label: 'Home', icon: Home, route: 'Home' },
    // The Directory is the one place chooser; the map itself carries no search or browse controls.
    { label: 'Find a place', icon: Search, route: 'LocationsDirectory' },
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
          <MapIcon size={32} color={staticColors.white} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Ijtema Map</Text>
          <Text style={styles.subtitle}>Find your way</Text>
        </View>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
        <View style={styles.section}>
          {menuItems.map((item, index) => (
            <Pressable 
              key={index} 
              style={styles.menuItem}
              onPress={() => props.navigation.navigate(item.route as never)} // fixed: keep drawer-native navigation for actual drawer routes
              accessibilityRole="button" // fixed: expose drawer menu items correctly to assistive technologies
              accessibilityLabel={item.label} // fixed: use the menu label as the accessible action name
            >
              <item.icon size={22} color={theme[DRAWER_ICON_COLOR_KEY]} />
              <View style={styles.menuItemTextContainer}>
                <Text style={styles.menuItemLabel}>{item.label}</Text>
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
              onPress={() => props.navigation.navigate(item.route as never)}
              accessibilityRole="button" // fixed: expose support drawer items correctly to assistive technologies
              accessibilityLabel={item.label} // fixed: use the support item label as the accessible action name
            >
              <item.icon size={22} color={theme[DRAWER_ICON_COLOR_KEY]} />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </DrawerContentScrollView>

      <View style={[styles.footer, { paddingBottom: styles.footer.padding + insets.bottom }]}>
        <Text style={styles.version}>Version 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticColors.white,
  },
  header: {
    backgroundColor: staticColors.drawerHeaderBackground,
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
    flex: 1, // shrinks and wraps at large text instead of running past the drawer's edge
    marginLeft: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: staticColors.white,
  },
  subtitle: {
    fontSize: 14,
    color: staticColors.lightGreenSubtext,
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
    color: staticColors.destNameMuted,
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
    color: staticColors.drawerText,
    marginLeft: 16,
  },
  badge: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: staticColors.drawerDivider,
    marginVertical: 16,
    marginHorizontal: 16,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: staticColors.drawerDivider,
    alignItems: 'center',
  },
  version: {
    fontSize: 12,
    color: staticColors.drawerFaint,
  },
});
