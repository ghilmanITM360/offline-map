/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localizeInstruction } from '../../../i18n/instructions';
import React, { useMemo } from 'react';
import { useI18n } from '../../../i18n';
import { useAppStore, type RouteGuideState } from '../../../store/useAppStore';
import { Button } from '../common/Button';
import { backChevron, forwardChevron } from '../common/directionalIcons';
import { directionsSheetColors, radii } from '../../../theme';
import { InstructionService } from '../../../services/InstructionService';
import {
  RouteGuideCard as SdkRouteGuideCard,
  type RouteGuideCardTheme,
} from '../../../../packages/offline-navigation/src/ui/RouteGuideCard';

const colors = {
  brand: directionsSheetColors.brand,
  brandText: directionsSheetColors.brandText,
  headingText: directionsSheetColors.headingText,
  secondaryText: directionsSheetColors.secondaryText,
  innerCardFill: directionsSheetColors.innerCardFill,
  innerCardBorder: directionsSheetColors.innerCardBorder,
};

// The Route Guide card (#307). Ijtema binding for the SDK card: supplies copy, localized steps, distance units,
// direction and the app design system; same props as before B4b-2.
export function RouteGuideCard({
  guide,
  ...props
}: {
  guide: RouteGuideState;
  onPrevious: () => void;
  onNext: () => void;
  /** Omitted when live guidance cannot help (the live position is already known and there is no walking route). */
  onLive?: () => void;
  onEnd: () => void;
  liveBusy?: boolean;
  /** One plain sentence when a live attempt could not start. */
  message?: string | null;
}) {
  const { t, dir } = useI18n();
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);
  // lucide's chevrons are fixed glyphs: pick them per reading direction.
  const theme = useMemo<RouteGuideCardTheme>(
    () => ({ Button, BackIcon: backChevron(), ForwardIcon: forwardChevron(), colors, radius: radii.xl }),
    [dir],
  );
  const step = guide.steps[guide.stepIndex];
  const labels = {
    stepCount: (step: number, total: number) => t('routeGuide.stepCount', { step, total }),
    stepSummary: (count: string, instruction: string, distance: string | null) =>
      t('routeGuide.stepSummary', { count, instruction, distance: distance ? `, ${distance}` : '' }),
    previous: t('routeGuide.previous'),
    previousStep: t('routeGuide.previousStep'),
    next: t('routeGuide.next'),
    nextStep: t('routeGuide.nextStep'),
    useLocation: t('routeGuide.useLocation'),
    acquiring: t('routeGuide.upgrade.acquiring'),
    end: t('routeGuide.end'),
  };
  return (
    <SdkRouteGuideCard
      {...props}
      step={{
        instruction: localizeInstruction(step),
        distance: step.distanceM > 0 ? InstructionService.formatDistance(step.distanceM, distanceUnit) : null,
      }}
      stepIndex={guide.stepIndex}
      stepTotal={guide.steps.length}
      labels={labels}
      isRTL={dir === 'rtl'}
      theme={theme}
    />
  );
}
