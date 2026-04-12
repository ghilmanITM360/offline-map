/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Updates from 'expo-updates'; // fixed: allow the fallback UI to restart the app safely

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }; // fixed: track whether a render error has been caught

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }; // fixed: switch the tree into the fallback UI after a render error
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] render failure:', error, errorInfo); // fixed: log the full render failure for debugging
  }

  private handleRestart = async (): Promise<void> => {
    try {
      await Updates.reloadAsync(); // fixed: reload the app to recover from unrecoverable render failures
    } catch (error) {
      console.error('[ErrorBoundary] restart failed:', error); // fixed: avoid swallowing restart errors
      this.setState({ hasError: false }); // fixed: at least retry the render tree if reload is unavailable
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.message}>Please restart the app to continue using Karachi Ijtema Navigation.</Text>
          <Pressable
            style={styles.button}
            onPress={() => { void this.handleRestart(); }} // fixed: expose a one-tap recovery action from the fallback UI
            accessibilityRole="button" // fixed: expose the restart control correctly to assistive technologies
            accessibilityLabel="Restart app" // fixed: provide an accessible label for the recovery action
          >
            <Text style={styles.buttonText}>Restart</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#202124',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#5F6368',
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
