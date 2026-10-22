/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localizeInstruction } from '../../../i18n/instructions';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { V2NavigationInstruction } from '../../../models/types';
import { useI18n } from '../../../i18n';
import { staticColors } from '../../../theme';
import {
  ActiveDirectionsPanel as SdkActiveDirectionsPanel,
  type ActiveDirectionsPanelTheme,
} from '@muslim-ummah/offline-navigation/ui';

const theme: ActiveDirectionsPanelTheme = {
  Container: SafeAreaView,
  colors: {
    panelFill: staticColors.white,
    text: staticColors.textPrimary,
    closeFill: staticColors.neutralSurface,
    stepBorder: staticColors.iconMuted,
    currentAccent: staticColors.routeInside,
  },
};

/** Ijtema binding for the SDK step list: localizes the engine's instructions and supplies copy, direction and app colours; same props as before B4c-1. */
export function ActiveDirectionsPanel({ visible, destination, instructions, currentStepIndex, onClose }: {
  visible: boolean;
  destination: string;
  instructions: V2NavigationInstruction[];
  currentStepIndex: number;
  onClose: () => void;
}) {
  const { t, isRTL } = useI18n();
  const steps = instructions.map((step, index) => ({ key: `${step.id}:${index}`, text: localizeInstruction(step) }));
  const labels = {
    title: t('navigation.directions'),
    close: t('navigation.closeDirections'),
    noSteps: t('navigation.noSteps'),
    currentStep: t('navigation.currentStep'),
  };
  return <SdkActiveDirectionsPanel visible={visible} destination={destination} steps={steps} currentStepIndex={currentStepIndex}
    labels={labels} isRTL={isRTL} onClose={onClose} theme={theme} />;
}
