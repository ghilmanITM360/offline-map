/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { V2NavigationInstruction } from '../../../models/types';
import { useI18n } from '../../../i18n';
import { staticColors } from '../../../theme';

/** Reads the active engine's instructions. Opening/closing never changes progress or camera. */
export function ActiveDirectionsPanel({ visible, destination, instructions, currentStepIndex, onClose }: {
  visible: boolean;
  destination: string;
  instructions: V2NavigationInstruction[];
  currentStepIndex: number;
  onClose: () => void;
}) {
  const { t, isRTL } = useI18n();
  const textDirection = { writingDirection: isRTL ? 'rtl' as const : 'ltr' as const, textAlign: isRTL ? 'right' as const : 'left' as const };
  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={styles.panel} accessibilityViewIsModal>
        <Text style={[styles.title, textDirection]} accessibilityRole="header">{t('navigation.directions')}</Text>
        <Text style={[styles.destination, textDirection]}>{destination}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.closeDirections')}
          onPress={onClose} style={styles.close}>
          <Text style={[styles.closeText, textDirection]}>{t('navigation.closeDirections')}</Text>
        </Pressable>
        <ScrollView contentContainerStyle={styles.steps}>
          {instructions.length === 0 ? <Text style={[styles.stepText, textDirection]}>{t('navigation.noSteps')}</Text> :
            instructions.map((step, index) => (
              <View key={`${step.id}:${index}`} style={[styles.step, index === currentStepIndex && styles.current]}
                accessibilityState={{ selected: index === currentStepIndex }}>
                {index === currentStepIndex && <Text style={[styles.currentLabel, textDirection]}>{t('navigation.currentStep')}</Text>}
                <Text style={[styles.stepText, textDirection]}>{step.text}</Text>
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: staticColors.white, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: '700', color: staticColors.textPrimary, marginTop: 16 },
  destination: { fontSize: 18, color: staticColors.textPrimary, marginVertical: 12 },
  close: { minHeight: 48, padding: 12, backgroundColor: staticColors.neutralSurface, borderRadius: 12 },
  closeText: { fontSize: 18, color: staticColors.textPrimary, fontWeight: '600' },
  steps: { paddingVertical: 16, gap: 12 },
  step: { padding: 16, borderWidth: 1, borderColor: staticColors.iconMuted, borderRadius: 12 },
  current: { borderColor: staticColors.routeInside, borderWidth: 2 },
  currentLabel: { fontSize: 16, fontWeight: '700', color: staticColors.routeInside, marginBottom: 8 },
  stepText: { fontSize: 18, color: staticColors.textPrimary },
});
