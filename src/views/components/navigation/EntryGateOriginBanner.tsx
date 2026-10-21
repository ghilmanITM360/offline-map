/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { staticColors } from '../../../theme';
import {
  EntryGateOriginBanner as SdkEntryGateOriginBanner,
  type EntryGateOriginBannerTheme,
} from '../../../../packages/offline-navigation/src/ui/EntryGateOriginBanner';

const theme: EntryGateOriginBannerTheme = {
  colors: { fill: staticColors.entryGateBackground, border: staticColors.entryGateBorder, text: staticColors.focusedBlock },
};

/** Ijtema binding for the SDK entry-gate origin banner: supplies app colours. */
export function EntryGateOriginBanner({ message }: { message: string }) {
  return <SdkEntryGateOriginBanner message={message} theme={theme} />;
}
