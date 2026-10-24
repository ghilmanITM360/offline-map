/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { Text } from './Text';
import { useAccessibilityFocus } from './useAccessibilityFocus';

/** One already-localized step. `key` must stay stable for the same step across locale changes. */
export interface ActiveDirectionsStep {
  key: string;
  text: string;
}

/** The host's design system: the safe-area container and colour tokens. */
export interface ActiveDirectionsPanelTheme {
  /** Wraps the panel inside the Modal; safe areas stay host-owned. */
  Container: React.ComponentType<ViewProps>;
  colors: {
    panelFill: string;
    text: string;
    closeFill: string;
    stepBorder: string;
    currentAccent: string;
  };
}

export interface ActiveDirectionsPanelProps {
  visible: boolean;
  destination: string;
  steps: ActiveDirectionsStep[];
  currentStepIndex: number;
  labels: { title: string; close: string; noSteps: string; currentStep: string };
  isRTL: boolean;
  onClose: () => void;
  theme: ActiveDirectionsPanelTheme;
}

// Presentation only: the host owns the instructions, progress and when the panel opens. Opening/closing never changes progress or camera.
export function ActiveDirectionsPanel({ visible, destination, steps, currentStepIndex, labels, isRTL, onClose, theme }: ActiveDirectionsPanelProps) {
  const { ref: headingRef } = useAccessibilityFocus(visible ? 'active-directions' : null);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { Container } = theme;
  const textDirection = { writingDirection: isRTL ? 'rtl' as const : 'ltr' as const, textAlign: isRTL ? 'right' as const : 'left' as const };
  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <Container style={styles.panel} accessibilityViewIsModal>
        <Text ref={headingRef} style={[styles.title, textDirection]} accessibilityRole="header">{labels.title}</Text>
        <Text style={[styles.destination, textDirection]}>{destination}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={labels.close}
          onPress={onClose} style={styles.close}>
          <Text style={[styles.closeText, textDirection]}>{labels.close}</Text>
        </Pressable>
        <ScrollView contentContainerStyle={styles.steps}>
          {steps.length === 0 ? <Text style={[styles.stepText, textDirection]}>{labels.noSteps}</Text> :
            steps.map((step, index) => (
              <View key={step.key} style={[styles.step, index === currentStepIndex && styles.current]}
                accessibilityState={{ selected: index === currentStepIndex }}>
                {index === currentStepIndex && <Text style={[styles.currentLabel, textDirection]}>{labels.currentStep}</Text>}
                <Text style={[styles.stepText, textDirection]}>{step.text}</Text>
              </View>
            ))}
        </ScrollView>
      </Container>
    </Modal>
  );
}

const makeStyles = ({ colors }: ActiveDirectionsPanelTheme) => StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.panelFill, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 16 },
  destination: { fontSize: 18, color: colors.text, marginVertical: 12 },
  close: { minHeight: 48, padding: 12, backgroundColor: colors.closeFill, borderRadius: 12 },
  closeText: { fontSize: 18, color: colors.text, fontWeight: '600' },
  steps: { paddingVertical: 16, gap: 12 },
  step: { padding: 16, borderWidth: 1, borderColor: colors.stepBorder, borderRadius: 12 },
  current: { borderColor: colors.currentAccent, borderWidth: 2 },
  currentLabel: { fontSize: 16, fontWeight: '700', color: colors.currentAccent, marginBottom: 8 },
  stepText: { fontSize: 18, color: colors.text },
});
