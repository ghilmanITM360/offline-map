import React from 'react';
import type { ManualLiveUpgrade } from '../../../viewmodels/useManualLiveUpgrade';
import { useI18n } from '../../../i18n/useI18n';
import { directionsSheetColors, spacing, typography } from '../../../theme';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import {
  ManualLiveUpgradeCard as SdkManualLiveUpgradeCard,
  type ManualLiveUpgradeCardTheme,
} from '../../../../packages/offline-navigation/src/ui/ManualLiveUpgradeCard';

const theme: ManualLiveUpgradeCardTheme = {
  Card,
  Button,
  text: { ...typography.sheet.body, color: directionsSheetColors.headingText },
  spinnerColor: directionsSheetColors.brand,
  gap: spacing.md,
};

/** Ijtema binding for the SDK card: supplies copy, direction and the app design system; same props as before B4b-1. */
export function ManualLiveUpgradeCard(props: {
  upgrade: ManualLiveUpgrade;
  destination: string;
  onConfirm: () => void;
  onCancel: () => void;
  onStart: () => void;
  recoveryLabel?: string;
  onRecover?: () => void;
}) {
  const { t, isRTL } = useI18n();
  const labels = {
    confirm: t('routeGuide.upgrade.confirm'),
    acquiring: t('routeGuide.upgrade.acquiring'),
    routing: t('routeGuide.upgrade.routing'),
    preview: t('routeGuide.upgrade.preview'),
    failed: t('routeGuide.upgrade.failed'),
    preserved: t('routeGuide.upgrade.preserved'),
    start: t('routeGuide.upgrade.start'),
    continue: t('routeGuide.upgrade.continue'),
    retry: t('routeGuide.upgrade.retry'),
    cancel: t('routeGuide.upgrade.cancel'),
    destination: (destination: string) => t('routeGuide.upgrade.destination', { destination }),
    summary: (minutes: number, distance: number) => t('routeGuide.upgrade.summary', { minutes, distance }),
  };
  return <SdkManualLiveUpgradeCard {...props} labels={labels} isRTL={isRTL} theme={theme} />;
}
