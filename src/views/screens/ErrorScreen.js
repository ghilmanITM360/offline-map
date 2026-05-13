/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
export function ErrorScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { title, message, type } = route.params || {
        title: 'Error',
        message: 'An unexpected error occurred.',
        type: 'general'
    };
    const handleRetry = () => {
        navigation.replace('Splash');
    };
    return (<SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {type === 'connectivity' ? (<WifiOff size={64} color="#D32F2F"/>) : (<AlertTriangle size={64} color="#D32F2F"/>)}
        </View>
        
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <Pressable style={styles.retryButton} onPress={handleRetry}>
          <RefreshCw size={20} color="#FFFFFF"/>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')}>
          <Text style={styles.backText}>Go Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>);
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#FFEBEE',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
    },
    retryButton: {
        backgroundColor: '#2E7D32',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 10,
        width: '100%',
        marginBottom: 16,
    },
    retryText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 10,
    },
    backButton: {
        padding: 12,
    },
    backText: {
        color: '#666',
        fontSize: 16,
    },
});
