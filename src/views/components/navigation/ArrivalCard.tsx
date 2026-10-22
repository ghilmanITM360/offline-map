/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { useI18n } from '../../../i18n';
import { staticColors } from '../../../theme';
import { NAV_TOUCH_TARGET_HIT_SLOP } from './navOverlayStyles';
import {
  ArrivalCard as SdkArrivalCard,
  type ArrivalCardTheme,
} from '@muslim-ummah/offline-navigation/ui';

const theme: ArrivalCardTheme = {
  PinIcon: MapPin,
  RecenterIcon: LocateFixed,
  hitSlop: NAV_TOUCH_TARGET_HIT_SLOP,
  colors: {
    scrim: 'rgba(0,0,0,0.5)',
    cardFill: staticColors.white,
    title: staticColors.textPrimary,
    accent: staticColors.arrivalGreen,
    onAccent: staticColors.white,
    muted: staticColors.iconMuted,
    secondaryFill: staticColors.neutralSurface,
    secondaryText: staticColors.routeInside,
  },
};

/** Ijtema binding for the SDK arrival card: supplies copy, the safe-area inset, icons and app colours. */
export function ArrivalCard({ visible, destination, onRecenter, onDone }: {
  visible: boolean;
  destination: string;
  onRecenter: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const labels = {
    title: t('navigation.arrived'),
    subtitle: t('navigation.arrivedSubtitle'),
    recenter: t('navigation.recenter'),
    recenterA11y: t('navigation.recenterLabel'),
    done: t('navigation.done'),
    doneA11y: t('navigation.doneLabel'),
  };
  return <SdkArrivalCard visible={visible} destination={destination} labels={labels} bottomInset={insets.bottom}
    onRecenter={onRecenter} onDone={onDone} theme={theme} />;
}
