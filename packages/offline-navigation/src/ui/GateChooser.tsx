/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

export interface GateChooserOption {
  id: string;
  /** Already-localized gate name. */
  label: string;
  /** Already-localized "use {gate}" action label. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/** The host's design system: its button and colour tokens. */
export interface GateChooserTheme {
  Button: React.ComponentType<{
    label: string;
    accessibilityLabel: string;
    variant: 'secondary' | 'outline';
    disabled?: boolean;
    onPress: () => void;
  }>;
  colors: { fill: string; border: string; title: string };
}

export interface GateChooserProps {
  /** Already-localized heading. */
  title: string;
  /** Rendered in the order given; the host decides which gates are eligible. */
  options: GateChooserOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: GateChooserTheme;
}

// Presentation only: the host owns eligibility, open/close, and what selecting a gate starts.
export function GateChooser({ title, options, selectedId, onSelect, theme }: GateChooserProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { Button } = theme;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {options.map((option) => (
        <Button
          key={option.id}
          variant={selectedId === option.id ? 'secondary' : 'outline'}
          label={option.label}
          accessibilityLabel={option.accessibilityLabel}
          disabled={option.disabled}
          onPress={() => onSelect(option.id)}
        />
      ))}
    </View>
  );
}

const makeStyles = ({ colors }: GateChooserTheme) => StyleSheet.create({
  container: {
    marginHorizontal: 12, padding: 12, gap: 8, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fill, zIndex: 12,
  },
  title: { color: colors.title, fontSize: 16, fontWeight: '700' },
});
