/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { radii, spacing, staticColors, typography } from '../../../theme';
import { useI18n } from '../../../i18n';

interface SheetHeaderProps {
  title: string;
  icon?: React.ReactNode;
  onClose?: () => void;
}

/** Shared sheet title row (Phase 8A task 6) — icon + title left, close button right. */
export function SheetHeader({ title, icon, onClose }: SheetHeaderProps) {
  const { t } = useI18n();
  return (
    <View style={styles.header}>
      <View style={styles.titleWrap}>
        {icon}
        <Text style={styles.title}>{title}</Text>
      </View>
      {onClose && (
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('directions.closeSheet', { title })}
        >
          <X size={20} color={staticColors.iconMuted} />
        </Pressable>
      )}
    </View>
  );
}

// Shared corner radius for the outer sheet container — both LayersSheet (Modal) and
// HomeScreen's BottomSheetModal apply this explicitly so they match regardless of
// each library's own default.
export const SHEET_CORNER_RADIUS = radii.xl;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.sheet.title,
    fontSize: 18,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F3F4',
  },
});
