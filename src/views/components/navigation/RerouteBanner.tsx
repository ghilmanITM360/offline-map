/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { staticColors } from '../../../theme';
import {
  RerouteBanner as SdkRerouteBanner,
  type RerouteBannerTheme,
} from '../../../../packages/offline-navigation/src/ui/RerouteBanner';

const theme: RerouteBannerTheme = {
  // #8D6E63 on #FFF8E1 failed AA (4.35:1); warningText #7C4A03 passes (6.97:1).
  colors: { fill: staticColors.warningBackground, border: staticColors.warning, text: staticColors.warningText },
};

/** Ijtema binding for the SDK reroute status banner: supplies app colours. */
export function RerouteBanner({ message }: { message: string }) {
  return <SdkRerouteBanner message={message} theme={theme} />;
}
