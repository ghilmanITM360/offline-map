/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Info, RefreshCw, WifiOff } from 'lucide-react-native';

import { directionsSheetColors as c } from '../../../theme';

/**
 * Presentational pieces of the Get Directions sheet (#177). They hold no route, GPS or
 * selection logic — LocationSheet owns every handler and all copy, these only draw it.
 * Horizontal spacing uses start/end props and chevrons mirror under RTL.
 */

/** Minimum touch target for every control here (dp). */
const TARGET = 48;

export function DirectionsHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  const BackIcon = I18nManager.isRTL ? ChevronRight : ChevronLeft;
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backHit}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <View style={styles.backCircle}>
          <BackIcon size={24} color={c.headingText} />
        </View>
      </Pressable>
      <View style={styles.headerText}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

/** "Going to" / "Starting from": labelled card, one summary row, one full-width action. */
export function RouteEndpointCard({
  label,
  helper,
  headerIcon,
  icon,
  name,
  detail,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  children,
}: {
  label: string;
  helper: string;
  headerIcon: React.ReactNode;
  icon: React.ReactNode;
  name: string;
  detail?: string;
  actionLabel: string;
  actionAccessibilityLabel: string;
  onAction: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerDisc}>{headerIcon}</View>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.cardLabel}>
            {label}
          </Text>
          <Text style={styles.cardHelper}>{helper}</Text>
        </View>
      </View>
      <View style={styles.inner}>
        <View style={styles.innerDisc}>{icon}</View>
        <View style={styles.flex}>
          <Text style={styles.innerName}>{name}</Text>
          {detail ? <Text style={styles.innerDetail}>{detail}</Text> : null}
        </View>
      </View>
      {children}
      <Pressable
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        hitSlop={{ top: 2, bottom: 2 }}
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionAccessibilityLabel}
      >
        <ArrowLeftRight size={18} color={c.brand} />
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

/** One starting-location choice. `active` mirrors the real start source, never a guess. */
export function StartOptionCard({
  icon,
  title,
  subtitle,
  active,
  disabled,
  loading,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const Chevron = I18nManager.isRTL ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        disabled && styles.optionDisabled,
        pressed && !disabled && styles.optionPressed,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ selected: !!active, disabled: !!disabled, busy: !!loading }}
    >
      <View style={[styles.optionDisc, active && styles.optionDiscActive]}>
        {loading ? <RefreshCw size={22} color={active ? c.brandText : c.brand} /> : icon}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <Chevron size={20} color={c.secondaryText} />
    </Pressable>
  );
}

/** Truthful offline note: a quiet line under the CTA, or a banner in the start chooser. */
export function OfflineInfo({ text, banner }: { text: string; banner?: boolean }) {
  const Icon = banner ? Info : WifiOff;
  return (
    <View style={[styles.offline, banner && styles.offlineBanner]}>
      <Icon size={banner ? 20 : 14} color={c.secondaryText} />
      <Text style={[styles.offlineText, !banner && styles.offlineLineText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 4,
  },
  backHit: {
    width: TARGET,
    height: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircle: {
    width: 41,
    height: 41,
    borderRadius: 21,
    backgroundColor: c.backButtonFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 28, fontWeight: '800', color: c.headingText },
  subtitle: { fontSize: 14, lineHeight: 20, color: c.secondaryText },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.background,
    padding: 11,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 16, fontWeight: '800', color: c.headingText },
  cardHelper: { fontSize: 13, lineHeight: 18, color: c.secondaryText },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.innerCardBorder,
    backgroundColor: c.innerCardFill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  innerDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerName: { fontSize: 18, fontWeight: '800', color: c.headingText },
  innerDetail: { fontSize: 14, lineHeight: 20, color: c.secondaryText },
  action: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: c.actionFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionPressed: { backgroundColor: c.actionPressedFill },
  actionText: { fontSize: 15, fontWeight: '800', color: c.brand, flexShrink: 1 },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.optionBorder,
    backgroundColor: c.optionFill,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionActive: { backgroundColor: c.optionSelectedFill, borderColor: c.optionSelectedBorder },
  optionDisabled: { opacity: 0.6 },
  optionPressed: { backgroundColor: c.actionPressedFill },
  optionDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionDiscActive: { backgroundColor: c.iconDiscSolid },
  optionTitle: { fontSize: 18, fontWeight: '800', color: c.headingText },
  optionSubtitle: { fontSize: 14, lineHeight: 20, color: c.secondaryText },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  offlineBanner: {
    justifyContent: 'flex-start',
    borderRadius: 12,
    backgroundColor: c.bannerFill,
    padding: 14,
  },
  offlineText: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: c.secondaryText },
  offlineLineText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
