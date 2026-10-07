import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Route } from 'lucide-react-native';

import type { NormalizedOutsideCandidate } from '../../../models/outsideRouting';
import {
  outsideRouteMessage,
  outsideRouteProviderLabel,
} from '../../../services/OutsideRouteLocalizationService';
import { directionsSheetColors, radii, spacing, staticColors, typography } from '../../../theme';
import { Button } from '../common/Button';
import { useI18n } from '../../../i18n';
import { localizeVenueName } from '../../../i18n/venueNames';

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
  const { t, locale } = useI18n();
  const gate = localizeVenueName(gateLabel);
  const directGuide = route.provider === 'direct-guide';
  const googleFallback = route.provider === 'offline-osm' && route.fallbackHistory.some((failure) => failure.provider === 'google');

  return (
    <View
      style={[styles.container, directGuide && styles.directContainer]}
    >
      <View style={styles.titleRow}>
        {directGuide
          ? <AlertTriangle size={20} color={staticColors.warningText} />
          : <Route size={20} color={directionsSheetColors.brand} />}
        <Text style={[styles.providerLabel, directGuide && styles.directTitle]}>
          {directGuide
            ? outsideRouteMessage('direct.notRoadRoute')
            : outsideRouteProviderLabel(route.provider)}
        </Text>
      </View>

      {!directGuide && <Text style={styles.gateText}>{t('navigation.outsideEntry', { gate })}</Text>}

      {googleFallback && (
        <Text style={styles.fallbackText}>{outsideRouteMessage('fallback.googleUnavailable')}</Text>
      )}

      {directGuide && (
        <>
          <Text
            style={styles.warningEnglish}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {outsideRouteMessage('direct.warning')}
          </Text>
          {locale === 'en' && <Text style={styles.warningUrdu}>{outsideRouteMessage('direct.warning', 'ur')}</Text>}
          <Text style={styles.gateText}>{t('navigation.outsideSelectedGate', { gate })}</Text>
          {retrying && <Text style={styles.retryingText}>{outsideRouteMessage('retrying')}</Text>}
          <View style={styles.actions}>
            {onRetry && (
              <Button
                variant="brandTint"
                label={outsideRouteMessage('action.retryRoadRoute')}
                accessibilityLabel={outsideRouteMessage('action.retryRoadRoute')}
                disabled={retrying}
                onPress={onRetry}
              />
            )}
            {onChooseGate && (
              <Button
                variant="outline"
                label={outsideRouteMessage('action.chooseGate')}
                accessibilityLabel={outsideRouteMessage('action.chooseGate')}
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
