/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { staticColors } from '../../../theme';
import {
  MapUnavailableBanner as SdkMapUnavailableBanner,
} from '@muslim-ummah/offline-navigation/ui';

import type { MapUnavailableBannerTheme } from '@muslim-ummah/offline-navigation/ui';

const theme: MapUnavailableBannerTheme = {
  colors: { fill: staticColors.bannerTranslucentWhite, border: staticColors.border, text: staticColors.iconMuted },
};

/** Ijtema binding for the SDK basemap-unavailable banner: supplies app colours. */
export function MapUnavailableBanner({ message }: { message: string }) {
  return <SdkMapUnavailableBanner message={message} theme={theme} />;
}
