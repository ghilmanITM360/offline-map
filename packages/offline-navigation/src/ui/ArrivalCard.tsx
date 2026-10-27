/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type Insets } from 'react-native';
import { Text } from './Text';
import { useAccessibilityFocus } from './useAccessibilityFocus';

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

/** The host's design system: icons, touch slop and colour tokens. */
export interface ArrivalCardTheme {
  PinIcon: IconComponent;
  RecenterIcon: IconComponent;
  hitSlop: Insets;
  colors: {
    scrim: string;
    cardFill: string;
    title: string;
    accent: string;
    onAccent: string;
    muted: string;
    secondaryFill: string;
    secondaryText: string;
  };
}

export interface ArrivalCardProps {
  visible: boolean;
  /** Already-localized destination name. */
  destination: string;
  labels: { title: string; subtitle: string; recenter: string; recenterA11y: string; done: string; doneA11y: string };
  /** Host safe-area bottom inset: the Modal window draws under the system nav bar (#301). */
  bottomInset: number;
  onRecenter: () => void;
  /** Done and Android back both finish the journey. */
  onDone: () => void;
  theme: ArrivalCardTheme;
}

// Presentation only: the host owns when arrival latches, the announcement and what Done/Recenter do.
export function ArrivalCard({ visible, destination, labels, bottomInset, onRecenter, onDone, theme }: ArrivalCardProps) {
  const { ref: titleRef } = useAccessibilityFocus(visible ? 'arrival' : null);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // At large text the two buttons no longer fit side by side (both were clipped at the screen edges on iOS at the largest size): stack them
  // full width, and let the card scroll if it ever outgrows the screen.
  const stacked = useWindowDimensions().fontScale >= 1.5;
  const { PinIcon, RecenterIcon, hitSlop, colors } = theme;
  return (
    <Modal testID="nav-arrival-modal" visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.overlay} accessibilityViewIsModal>
        <View testID="nav-arrived-card" style={[styles.card, { paddingBottom: Math.max(36, bottomInset + 24) }]}>
          <ScrollView testID="nav-arrived-scroll" bounces={false} contentContainerStyle={styles.cardContent}>
          <PinIcon size={52} color={colors.accent} />
          <Text ref={titleRef} accessible accessibilityRole="header" style={styles.title}>{labels.title}</Text>
          <Text style={styles.subtitle}>{labels.subtitle}</Text>
          <Text style={styles.destination}>{destination}</Text>
          <View style={[styles.actionsRow, stacked && styles.actionsColumn]}>
            <Pressable testID="nav-arrived-recenter-button" style={[styles.secondaryButton, stacked && styles.buttonStacked]} onPress={onRecenter}
              hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel={labels.recenterA11y}>
              <RecenterIcon size={18} color={colors.secondaryText} />
              <Text style={styles.secondaryButtonText}>{labels.recenter}</Text>
            </Pressable>
            <Pressable testID="nav-arrived-done-button" style={[styles.button, stacked && styles.buttonStacked]} onPress={onDone}
              hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel={labels.doneA11y}>
              <Text style={styles.buttonText}>{labels.done}</Text>
            </Pressable>
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = ({ colors }: ArrivalCardTheme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.cardFill, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 36, elevation: 20, maxHeight: '92%',
  },
  cardContent: { alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: colors.title, marginTop: 16, textAlign: 'center' },
  subtitle: { fontSize: 18, color: colors.accent, marginTop: 4, textAlign: 'center' },
  destination: { fontSize: 16, color: colors.muted, marginTop: 6, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', marginTop: 28, gap: 12 },
  actionsColumn: { flexDirection: 'column', alignSelf: 'stretch' },
  buttonStacked: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  button: { backgroundColor: colors.accent, borderRadius: 28, paddingHorizontal: 48, paddingVertical: 16 },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: 'bold' },
  secondaryButton: {
    backgroundColor: colors.secondaryFill, borderRadius: 28, paddingHorizontal: 24, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  secondaryButtonText: { color: colors.secondaryText, fontSize: 15, fontWeight: '600' },
});
