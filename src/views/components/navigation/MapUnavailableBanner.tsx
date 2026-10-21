/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { staticColors } from '../../../theme';
import {
  MapUnavailableBanner as SdkMapUnavailableBanner,
  type MapUnavailableBannerTheme,
} from '../../../../packages/offline-navigation/src/ui/MapUnavailableBanner';

const theme: MapUnavailableBannerTheme = {
  colors: { fill: staticColors.bannerTranslucentWhite, border: staticColors.border, text: staticColors.iconMuted },
};

/** Ijtema binding for the SDK basemap-unavailable banner: supplies app colours. */
export function MapUnavailableBanner({ message }: { message: string }) {
  return <SdkMapUnavailableBanner message={message} theme={theme} />;
}
