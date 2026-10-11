import { useAccessibilityFocus } from '../../hooks/useAccessibilityFocus';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ManualLiveUpgrade } from '../../../viewmodels/useManualLiveUpgrade';
import { useI18n } from '../../../i18n/useI18n';
import { directionsSheetColors, spacing, typography } from '../../../theme';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

/** Presentation only: the ViewModel owns acquisition, candidate routing and activation. */
export function ManualLiveUpgradeCard({ upgrade, destination, onConfirm, onCancel, onStart, recoveryLabel, onRecover }: {
  upgrade: ManualLiveUpgrade;
  destination: string;
  onConfirm: () => void;
  onCancel: () => void;
  onStart: () => void;
  recoveryLabel?: string;
  onRecover?: () => void;
}) {
  const { t, isRTL } = useI18n();
  const { ref } = useAccessibilityFocus(upgrade.phase === 'idle' ? null : `manual-upgrade:${upgrade.phase}`);
  if (upgrade.phase === 'idle') return null;
  const busy = upgrade.phase === 'acquiring' || upgrade.phase === 'routing';
  const title = upgrade.phase === 'confirming' ? t('routeGuide.upgrade.confirm')
    : upgrade.phase === 'acquiring' ? t('routeGuide.upgrade.acquiring')
    : upgrade.phase === 'routing' ? t('routeGuide.upgrade.routing')
    : upgrade.phase === 'preview' ? t('routeGuide.upgrade.preview') : t('routeGuide.upgrade.failed');
  const textStyle = [styles.text, { textAlign: isRTL ? 'right' as const : 'left' as const, writingDirection: isRTL ? 'rtl' as const : 'ltr' as const }];
  return <Card variant="neutral">
    <View style={styles.content}>
      <Text ref={ref} accessibilityRole="header" accessibilityLiveRegion="polite" style={[textStyle, styles.title]}>{title}</Text>
      <Text style={textStyle}>{t('routeGuide.upgrade.preserved')}</Text>
      {busy ? <ActivityIndicator accessibilityLabel={title} color={directionsSheetColors.brand} /> : null}
      {upgrade.phase === 'preview' ? <>
        <Text style={textStyle}>{t('routeGuide.upgrade.destination', { destination })}</Text>
        <Text style={textStyle}>{t('routeGuide.upgrade.summary', { minutes: upgrade.route.estimatedTimeMin, distance: upgrade.route.totalDistance })}</Text>
        <Button label={t('routeGuide.upgrade.start')} onPress={onStart} fullWidth />
      </> : !busy ? <Button label={t(upgrade.phase === 'failed' ? 'routeGuide.upgrade.retry' : 'routeGuide.upgrade.continue')} onPress={onConfirm} fullWidth /> : null}
      {upgrade.phase === 'failed' && recoveryLabel && <Button label={recoveryLabel} variant="outline" onPress={onRecover} fullWidth />}
      <Button label={t('routeGuide.upgrade.cancel')} variant="outline" onPress={onCancel} fullWidth />
    </View>
  </Card>;
}
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  text: { ...typography.sheet.body, color: directionsSheetColors.headingText },
  title: { fontWeight: '700' },
});
