import React from 'react';
import { ActivityIndicator, StyleSheet, TextStyle, View } from 'react-native';
import { Text } from './Text';
import { useAccessibilityFocus } from './useAccessibilityFocus';

/** Structural view of the host's upgrade state; the host ViewModel owns acquisition, routing and activation. */
export type ManualLiveUpgradeCardState =
  | { phase: 'idle' | 'confirming' | 'acquiring' | 'routing' | 'failed' }
  | { phase: 'preview'; route: { estimatedTimeMin: number; totalDistance: number } };

/** Resolved copy; the host owns language and wording. */
export interface ManualLiveUpgradeCardLabels {
  confirm: string;
  acquiring: string;
  routing: string;
  preview: string;
  failed: string;
  preserved: string;
  start: string;
  continue: string;
  retry: string;
  cancel: string;
  destination: (destination: string) => string;
  summary: (minutes: number, distance: number) => string;
}

/** The host's design system: card chrome, buttons and text tokens. */
export interface ManualLiveUpgradeCardTheme {
  Card: React.ComponentType<{ children?: React.ReactNode }>;
  Button: React.ComponentType<{ label: string; onPress?: () => void; variant?: 'outline'; fullWidth?: boolean }>;
  text: TextStyle;
  spinnerColor: string;
  gap: number;
}

export interface ManualLiveUpgradeCardProps {
  upgrade: ManualLiveUpgradeCardState;
  destination: string;
  onConfirm: () => void;
  onCancel: () => void;
  onStart: () => void;
  recoveryLabel?: string;
  onRecover?: () => void;
  labels: ManualLiveUpgradeCardLabels;
  isRTL: boolean;
  theme: ManualLiveUpgradeCardTheme;
}

/** Presentation only: the ViewModel owns acquisition, candidate routing and activation. */
export function ManualLiveUpgradeCard({ upgrade, destination, onConfirm, onCancel, onStart, recoveryLabel, onRecover, labels, isRTL, theme }: ManualLiveUpgradeCardProps) {
  const { ref } = useAccessibilityFocus(upgrade.phase === 'idle' ? null : `manual-upgrade:${upgrade.phase}`);
  if (upgrade.phase === 'idle') return null;
  const { Card, Button } = theme;
  const busy = upgrade.phase === 'acquiring' || upgrade.phase === 'routing';
  const title = upgrade.phase === 'confirming' ? labels.confirm
    : upgrade.phase === 'acquiring' ? labels.acquiring
    : upgrade.phase === 'routing' ? labels.routing
    : upgrade.phase === 'preview' ? labels.preview : labels.failed;
  const textStyle = [theme.text, { textAlign: 'auto' as const, writingDirection: isRTL ? 'rtl' as const : 'ltr' as const }];
  return <Card>
    <View style={{ gap: theme.gap }}>
      <Text ref={ref} accessibilityRole="header" accessibilityLiveRegion="polite" style={[textStyle, styles.title]}>{title}</Text>
      <Text style={textStyle}>{labels.preserved}</Text>
      {busy ? <ActivityIndicator accessibilityLabel={title} color={theme.spinnerColor} /> : null}
      {upgrade.phase === 'preview' ? <>
        <Text style={textStyle}>{labels.destination(destination)}</Text>
        <Text style={textStyle}>{labels.summary(upgrade.route.estimatedTimeMin, upgrade.route.totalDistance)}</Text>
        <Button label={labels.start} onPress={onStart} fullWidth />
      </> : !busy ? <Button label={upgrade.phase === 'failed' ? labels.retry : labels.continue} onPress={onConfirm} fullWidth /> : null}
      {upgrade.phase === 'failed' && recoveryLabel && <Button label={recoveryLabel} variant="outline" onPress={onRecover} fullWidth />}
      <Button label={labels.cancel} variant="outline" onPress={onCancel} fullWidth />
    </View>
  </Card>;
}
const styles = StyleSheet.create({
  title: { fontWeight: '700' },
});
