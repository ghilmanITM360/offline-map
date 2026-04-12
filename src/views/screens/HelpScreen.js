/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, HelpCircle, MessageCircle, FileText, ExternalLink, MapPin, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
const OFFICIAL_WEBSITE_URL = 'TODO_OFFICIAL_WEBSITE_URL'; // fixed: replace placeholder website with an explicit TODO constant
export function HelpScreen() {
    const navigation = useNavigation();
    const openExternalUrl = async (url) => {
        if (!url.startsWith('http')) {
            Alert.alert('Link unavailable', 'This link has not been configured yet.'); // fixed: handle TODO URLs without throwing
            return;
        }
        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert('Unable to open link', 'This link is not supported on this device.'); // fixed: guard unsupported URLs
                return;
            }
            await Linking.openURL(url); // fixed: await the promise so errors can be caught
        }
        catch {
            Alert.alert('Unable to open link', 'Please try again later.'); // fixed: surface linking failures instead of silently rejecting
        }
    };
    const EMERGENCY_CONTACTS = [
        { name: 'Rescue / Ambulance (Edhi)', number: '115' },
        { name: 'Rescue 1122', number: '1122' },
        { name: 'Police', number: '15' },
    ];
    const showFAQ = (title, body) => {
        Alert.alert(title, body, [{ text: 'Got it', style: 'default' }]);
    };
    const callNumber = (num) => {
        const tel = `tel:${num}`;
        Linking.canOpenURL(tel).then((ok) => {
            if (ok)
                Linking.openURL(tel);
            else
                Alert.alert('Cannot call', 'This device does not support phone calls.');
        });
    };
    const HelpItem = ({ icon: Icon, title, description, onPress }) => (<Pressable style={styles.helpItem} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Icon size={24} color="#2E7D32"/>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpDescription}>{description}</Text>
      </View>
    </Pressable>);
    return (<SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton}>
          <ChevronLeft size={28} color="#333"/>
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Common Questions</Text>
          <HelpItem icon={HelpCircle} title="How to use offline maps?" description="Learn how to download and use maps without internet." onPress={() => showFAQ('Offline Maps', '1. Go to Settings → Download Map.\n2. Tap "Download" and wait for completion.\n3. Once downloaded the map works with Airplane Mode on.\n\nNote: Tiles are saved on your device. You do not need internet for navigation after download.')}/>
          <HelpItem icon={MapPin} title="Finding your block" description="Tips for locating your specific block and tent." onPress={() => showFAQ('Finding Your Block', 'Each block is labelled B1–B24 on the map.\n\n• Tap the search bar and type your block number (e.g. "Block 7" or "7").\n• Tap the block polygon on the map for entrance options.\n• Use "Take Me There" to start turn-by-turn navigation to the nearest gate.\n\nUrdu names are also searchable (e.g. بلاک ۷).')}/>
          <HelpItem icon={HelpCircle} title="How does navigation work?" description="Understand turn-by-turn directions inside the venue." onPress={() => showFAQ('Turn-by-Turn Navigation', 'The app uses your GPS position to guide you along pre-mapped rastas (paths) inside the Ijtema ground.\n\n• Spoken instructions are announced automatically.\n• If you leave the path, the route recalculates after 3 seconds.\n• Tap the speaker icon to mute / unmute voice.\n• Tap Exit to stop navigation at any time.')}/>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          {EMERGENCY_CONTACTS.map((c) => (<HelpItem key={c.number} icon={Phone} title={c.name} description={`Dial ${c.number}`} onPress={() => callNumber(c.number)}/>))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation Tips</Text>
          <HelpItem icon={HelpCircle} title="GPS accuracy" description="For best results, use outdoors with clear sky view." onPress={() => showFAQ('GPS Accuracy', '• Stand in an open area away from large structures for best accuracy.\n• If your position looks wrong, tap the Recenter button.\n• Enable "High accuracy" GPS mode in your phone settings.\n• Low accuracy warnings are shown automatically.')}/>
          <HelpItem icon={MessageCircle} title="Send Feedback" description="Tell us about your experience or report a map error." onPress={() => Alert.alert('Send Feedback', 'To report a map error or send feedback, please contact the Ijtema tech team at your registration desk.', [{ text: 'OK' }])}/>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resources</Text>
          <HelpItem icon={FileText} title="App Version" description="Ijtema Navigator v1.0 — Karachi Ijtema Edition" onPress={() => Alert.alert('App Info', 'Ijtema Navigator v1.0\nBuilt for offline navigation inside Karachi Ijtema ground.')}/>
          <HelpItem icon={ExternalLink} title="Official Website" description="Visit the official Karachi Ijtema website." onPress={() => { void openExternalUrl(OFFICIAL_WEBSITE_URL); }}/>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>We are here to help you have a smooth journey.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>);
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
