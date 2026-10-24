import { useI18n } from '../../../i18n/useI18n';
import { StyleSheet, View } from 'react-native';
import { Text } from '@muslim-ummah/offline-navigation/ui';
import { AlertTriangle, Route } from 'lucide-react-native';

import type { NormalizedOutsideCandidate } from '../../../models/outsideRouting';
import {
  outsideRouteMessage,
  outsideRouteProviderLabel,
} from '../../../services/OutsideRouteLocalizationService';
import { directionsSheetColors, radii, spacing, staticColors, typography } from '../../../theme';
import { Button } from '../common/Button';

export interface OutsideRouteStatusCardProps {
  route: NormalizedOutsideCandidate;
  gateLabel: string;
  retrying?: boolean;
  onRetry?: () => void;
  onChooseGate?: () => void;
}

export function OutsideRouteStatusCard({
  route,
  gateLabel,
  retrying = false,
  onRetry,
  onChooseGate,
}: OutsideRouteStatusCardProps) {
  const { t, locale, isRTL } = useI18n();
  const direction = { textAlign: isRTL ? 'right' as const : 'left' as const, writingDirection: isRTL ? 'rtl' as const : 'ltr' as const };
  const directGuide = route.provider === 'direct-guide';
  const googleFallback = route.provider === 'offline-osm' && route.fallbackHistory.some((failure) => failure.provider === 'google');

  return (
    <View
      style={[styles.container, directGuide && styles.directContainer]}
    >
      <View style={[styles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {directGuide
          ? <AlertTriangle size={20} color={staticColors.warningText} />
          : <Route size={20} color={directionsSheetColors.brand} />}
        <Text style={[styles.providerLabel, direction, directGuide && styles.directTitle]}>
          {directGuide
            ? outsideRouteMessage('direct.notRoadRoute', locale)
            : outsideRouteProviderLabel(route.provider, locale)}
        </Text>
      </View>

      {!directGuide && <Text style={[styles.gateText, direction]}>{t('outside.entry', { gate: gateLabel })}</Text>}

      {googleFallback && (
        <Text style={[styles.fallbackText, direction]}>{outsideRouteMessage('fallback.googleUnavailable', locale)}</Text>
      )}

      {directGuide && (
        <>
          <Text
            style={[styles.warningEnglish, direction]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {outsideRouteMessage('direct.warning', locale)}
          </Text>
          <Text style={[styles.gateText, direction]}>{t('outside.selectedGate', { gate: gateLabel })}</Text>
          {retrying && <Text style={[styles.retryingText, direction]}>{outsideRouteMessage('retrying', locale)}</Text>}
          <View style={styles.actions}>
            {onRetry && (
              <Button
                variant="brandTint"
                label={outsideRouteMessage('action.retryRoadRoute', locale)}
                accessibilityLabel={outsideRouteMessage('action.retryRoadRoute', locale)}
                disabled={retrying}
                onPress={onRetry}
              />
            )}
            {onChooseGate && (
              <Button
                variant="outline"
                label={outsideRouteMessage('action.chooseGate', locale)}
                accessibilityLabel={outsideRouteMessage('action.chooseGate', locale)}
                onPress={onChooseGate}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: directionsSheetColors.innerCardBorder,
    backgroundColor: directionsSheetColors.innerCardFill,
    padding: spacing.md,
    gap: spacing.sm,
  },
  directContainer: {
    borderColor: staticColors.warning,
    backgroundColor: staticColors.warningBackground,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  providerLabel: {
    ...typography.sheet.subtitle,
    color: directionsSheetColors.brand,
    flexShrink: 1,
  },
  directTitle: {
    color: staticColors.warningText,
  },
  gateText: {
    ...typography.sheet.body,
    color: staticColors.textSecondaryStrong,
  },
  fallbackText: {
    ...typography.sheet.body,
    fontSize: 13,
    color: directionsSheetColors.brand,
  },
  warningEnglish: {
    ...typography.sheet.body,
    color: staticColors.warningText,
  },
  warningUrdu: {
    ...typography.sheet.body,
    color: staticColors.warningText,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  retryingText: {
    ...typography.sheet.body,
    fontSize: 13,
    color: staticColors.warningText,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
