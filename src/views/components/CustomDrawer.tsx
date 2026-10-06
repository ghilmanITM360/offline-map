/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DrawerContentComponentProps, DrawerContentScrollView } from '@react-navigation/drawer';
import { Search, Settings, HelpCircle, Map as MapIcon } from 'lucide-react-native';
import { useTheme } from '../../services/useTheme'; // fixed: use theme-safe colors for icons and badges
import { staticColors } from '../../theme';

const DRAWER_ICON_COLOR_KEY = 'subtext'; // fixed: centralize drawer icon color selection for future theming changes

// Home was only the plain map (a tap on the scrim already returns to it), so it is not an entry. About and the
// version live in Settings; Help carries no feedback form, so it is named for what it is.
const MENU_ITEMS = [
  // The Directory is the one place chooser; the map itself carries no search or browse controls.
  { label: 'Find a place', icon: Search, route: 'LocationsDirectory' },
  { label: 'Settings', icon: Settings, route: 'Settings' },
  { label: 'Help', icon: HelpCircle, route: 'Help' },
];

export function CustomDrawer(props: DrawerContentComponentProps) {
  const theme = useTheme(); // fixed: source icon and badge colors from the active theme

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
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.route}
              style={styles.menuItem}
              onPress={() => props.navigation.navigate(item.route as never)} // fixed: keep drawer-native navigation for actual drawer routes
              accessibilityRole="button" // fixed: expose drawer menu items correctly to assistive technologies
              accessibilityLabel={item.label} // fixed: use the menu label as the accessible action name
            >
              <item.icon size={22} color={theme[DRAWER_ICON_COLOR_KEY]} />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </DrawerContentScrollView>
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
  },
  menuItemLabel: {
    flex: 1, // wraps at large text instead of overflowing
    fontSize: 16,
    color: staticColors.drawerText,
    marginLeft: 16,
  },
});
