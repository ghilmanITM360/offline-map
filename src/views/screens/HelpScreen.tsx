/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HelpCircle, MessageCircle, FileText, ExternalLink, MapPin, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { backChevron } from '../components/common/directionalIcons';

const OFFICIAL_WEBSITE_URL = 'TODO_OFFICIAL_WEBSITE_URL'; // fixed: replace placeholder website with an explicit TODO constant

export function HelpScreen() {
  const navigation = useNavigation();
  const BackIcon = backChevron();

  const openExternalUrl = async (url: string) => {
    if (!url.startsWith('http')) {
      Alert.alert("This link isn't ready", 'Please try again later.'); // fixed: handle TODO URLs without throwing
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Can't open this link", "This phone can't open it."); // fixed: guard unsupported URLs
        return;
      }
      await Linking.openURL(url); // fixed: await the promise so errors can be caught
    } catch {
      Alert.alert("Can't open this link", 'Please try again later.'); // fixed: surface linking failures instead of silently rejecting
    }
  };

  const EMERGENCY_CONTACTS = [
    { name: 'Rescue / Ambulance (Edhi)', number: '115' },
    { name: 'Rescue 1122', number: '1122' },
    { name: 'Police', number: '15' },
  ];

  const showFAQ = (title: string, body: string) => {
    Alert.alert(title, body, [{ text: 'Got it', style: 'default' }]);
  };

  const callNumber = (num: string) => {
    const tel = `tel:${num}`;
    Linking.canOpenURL(tel).then((ok) => {
      if (ok) Linking.openURL(tel);
      else Alert.alert('Cannot call', 'This device does not support phone calls.');
    });
  };

  const HelpItem = ({ icon: Icon, title, description, onPress }: any) => (
    <Pressable
      style={styles.helpItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}, ${description}` : title}
    >
      <View style={styles.iconContainer}>
        <Icon size={24} color="#2E7D32" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpDescription}>{description}</Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home' as never)} style={styles.backButton} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon size={28} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Common Questions</Text>
          <HelpItem
            icon={MapPin}
            title="Finding your block"
            description="Tips for locating your specific block and tent."
            onPress={() =>
              showFAQ(
                'Finding Your Block',
                'Every block has a number on the map.\n\n• Use the search box and type your block number, for example "Block 7" or "7".\n• Tap the block on the map to see its entrances.\n• Tap Directions to be guided there.\n\nUrdu names also work, for example بلاک ۷.',
              )
            }
          />
          <HelpItem
            icon={HelpCircle}
            title="How do directions work?"
            description="How the app guides you as you walk."
            onPress={() =>
              showFAQ(
                'How directions work',
                'The app shows you the way on foot inside the Ijtema ground.\n\n• Turns are spoken aloud.\n• If you go the wrong way, it finds a new way.\n• Tap the speaker icon to turn the voice on or off.\n• Tap Exit to stop whenever you like.',
              )
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          {EMERGENCY_CONTACTS.map((c) => (
            <HelpItem
              key={c.number}
              icon={Phone}
              title={c.name}
              description={`Dial ${c.number}`}
              onPress={() => callNumber(c.number)}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation Tips</Text>
          <HelpItem
            icon={HelpCircle}
            title="Finding your location"
            description="Works best outdoors with a clear view of the sky."
            onPress={() =>
              showFAQ(
                'Finding your location',
                '• Stand in an open area away from tall buildings.\n• If your position looks wrong, tap the Recenter button.\n• If it still looks wrong, choose where you are starting from.',
              )
            }
          />
          <HelpItem
            icon={MessageCircle}
            title="Contact Us"
            description="Report a map error or share feedback at your registration desk."
            onPress={() =>
              Alert.alert(
                'Contact Us',
                'To report a map error or send feedback, please contact the Ijtema tech team at your registration desk.',
                [{ text: 'OK' }],
              )
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resources</Text>
          <HelpItem
            icon={FileText}
            title="App Version"
            description="Ijtema Map, version 1.0"
            onPress={() => Alert.alert('App Info', 'Ijtema Map, version 1.0')}
          />
          <HelpItem
            icon={ExternalLink}
            title="Official Website"
            description="Visit the official Karachi Ijtema website."
            onPress={() => { void openExternalUrl(OFFICIAL_WEBSITE_URL); }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>We are here to help you have a smooth journey.</Text>
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
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: 16,
    flex: 1,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  helpDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
