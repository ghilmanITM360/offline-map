/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RefreshCw } from 'lucide-react-native';
import { staticColors } from '../../../theme';
import { navOverlayStyles } from './navOverlayStyles';
import {
  RerouteProgressCard as SdkRerouteProgressCard,
  type RerouteProgressCardTheme,
} from '../../../../packages/offline-navigation/src/ui/RerouteProgressCard';

const theme: RerouteProgressCardTheme = { colors: { fill: staticColors.rerouteBackground, text: staticColors.white } };

/** Ijtema binding for the SDK reroute progress card: supplies the shared turn-card style, icon and colours. */
export function RerouteProgressCard({ label }: { label: string }) {
  return (
    <SdkRerouteProgressCard
      label={label}
      icon={<RefreshCw size={28} color={staticColors.white} />}
      cardStyle={navOverlayStyles.instructionCard}
      theme={theme}
    />
  );
}
