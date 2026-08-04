/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, Gate } from './types';

const c = (lat: number, lng: number): Coordinate => ({ lat, lng });
const pad = (value: number): string => String(value).padStart(2, '0');

const gateName = (number: number) => ({
  en: `Gate ${pad(number)}`,
  ur: `گیٹ ${pad(number)}`,
  romanUrdu: `Gate ${pad(number)}`,
});

const gateAliases = (number: number): string[] => [
  `Gate ${pad(number)}`,
  `Gate ${number}`,
  `G${number}`,
  `G${pad(number)}`,
  `گیٹ ${number}`,
  `گیٹ ${pad(number)}`,
];

const gate = (
  number: number,
  coordinate: Coordinate | undefined,
  status: Gate['status'] = coordinate ? 'provided' : 'missing_coordinate',
  sourceNotes?: string[],
): Gate => {
  const hasCoordinate = Boolean(coordinate);

  return {
    id: `GATE_${pad(number)}`,
    number,
    name: gateName(number),
    ...(coordinate ? { coordinate } : {}),
    aliases: gateAliases(number),
    category: 'gate',
    status,
    entryRole: 'official_entry_exit',
    routingStatus: hasCoordinate ? 'routable' : 'missing_coordinate',
    isOfficialEntry: true,
    canStartRouteFromOutside: hasCoordinate,
    userFacingBehavior: hasCoordinate
      ? {
          normalSearch: 'searchable',
          mapDisplay: 'visible',
          routeSelection: 'enabled',
        }
      : {
          normalSearch: 'unavailable',
          mapDisplay: 'unavailable',
          routeSelection: 'disabled',
          unavailableReason: 'Gate coordinate is not available in the supplied dataset.',
        },
    ...(sourceNotes ? { sourceNotes } : {}),
  };
};

export const IJTEMA_GATES: Gate[] = [
  gate(1, c(24.975054, 67.006408)),
  gate(2, c(24.975056, 67.005542)),
  gate(3, c(24.974729, 67.001319)),
  gate(4, c(24.973804, 66.998749)),
  gate(5, c(24.969435, 66.997967)),
  gate(7, c(24.967438, 66.998054)),
  gate(8, c(24.964727, 66.999026)),
  gate(12, c(24.963676, 67.006339)),
  gate(13, c(24.963718, 67.006862)),
  gate(14, c(24.965516, 67.007675)),
  gate(15, c(24.968126, 67.008578)),
  gate(16, c(24.970886, 67.010603)),
  gate(17, c(24.972517, 67.01325)),
  gate(18, c(24.975395, 67.014922)),
  gate(19, c(24.975367, 67.012898)),
  gate(20, c(24.975164, 67.011027)),
  gate(21, c(24.975087, 67.008953)),
  gate(22, c(24.975062, 67.007182)),
];
