/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { staticColors } from '../../../theme';
import {
  GpsSignalBanner as SdkGpsSignalBanner,
  type GpsSignalBannerProps,
  type GpsSignalBannerTheme,
} from '@muslim-ummah/offline-navigation/ui';

const theme: GpsSignalBannerTheme = { colors: { fill: staticColors.weakGpsBackground, text: staticColors.white } };

/** Ijtema binding for the SDK weak/lost GPS banner: supplies app colours. */
export function GpsSignalBanner({ status, message }: Omit<GpsSignalBannerProps, 'theme'>) {
  return <SdkGpsSignalBanner status={status} message={message} theme={theme} />;
}
