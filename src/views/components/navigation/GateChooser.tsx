/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useI18n } from '../../../i18n';
import { localizeVenueName } from '../../../i18n/venueNames';
import { staticColors } from '../../../theme';
import { Button } from '../common/Button';
import {
  GateChooser as SdkGateChooser,
  type GateChooserTheme,
} from '@muslim-ummah/offline-navigation/ui';

const theme: GateChooserTheme = {
  Button,
  colors: { fill: staticColors.warningBackground, border: staticColors.warning, title: staticColors.warningText },
};

/** Ijtema binding for the SDK gate chooser: supplies copy, venue names, the app Button and colours. */
export function GateChooser({ gates, selectedId, onSelect }: {
  gates: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const options = gates.map((gate) => {
    const label = localizeVenueName(gate.label);
    return { id: gate.id, label, accessibilityLabel: t('navigation.useGate', { name: label }) };
  });
  return <SdkGateChooser title={t('navigation.chooseGate')} options={options} selectedId={selectedId}
    onSelect={onSelect} theme={theme} />;
}
