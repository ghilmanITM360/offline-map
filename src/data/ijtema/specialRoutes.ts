/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, SpecialRoute, SpecialRouteGroup, SpecialRoutePoint } from './types';

const c = (lat: number, lng: number): Coordinate => ({ lat, lng });
const pad = (value: number): string => String(value).padStart(2, '0');

const pointName = (routeName: SpecialRoute['name'], sequence: number) => ({
  en: `${routeName.en} Point ${pad(sequence)}`,
  ur: `${routeName.ur} پوائنٹ ${pad(sequence)}`,
  romanUrdu: `${routeName.romanUrdu} Point ${pad(sequence)}`,
});

const specialRoute = (
  id: string,
  group: SpecialRouteGroup,
  prefix: string,
  name: SpecialRoute['name'],
  aliases: string[],
  coordinates: Coordinate[],
): SpecialRoute => ({
  id,
  name,
  points: coordinates.map((coordinate, index): SpecialRoutePoint => {
    const sequence = index + 1;
    const pointId = `${prefix}-${pad(sequence)}`;
    return {
      id: pointId,
      group,
      sequence,
      coordinate,
      name: pointName(name, sequence),
      developerLabel: pointId,
    };
  }),
  aliases,
  category: 'special_route',
  visual: {
    label: name.en,
    strokeKey: id.toLowerCase(),
    showLabelByDefault: true,
  },
});

export const IJTEMA_SPECIAL_ROUTES: SpecialRoute[] = [
  specialRoute(
    'SHAHR_E_PINDAL_NORTH',
    'shahr_e_pindal_north',
    'SPNP',
    {
      en: 'Shahr-e-Pindal North',
      ur: 'شہرِ پنڈال شمال',
      romanUrdu: 'Shahr-e-Pindal North',
    },
    ['Shahr-e-Pindal North', 'Shahr Pindal North', 'شہر پنڈال شمال', 'SPNP'],
    [c(24.96562, 66.999191), c(24.965633, 67.000655), c(24.965589, 67.00158), c(24.96561, 67.002618), c(24.965542, 67.004838), c(24.965593, 67.006355), c(24.965541, 67.007589)],
  ),
  specialRoute(
    'SHAHR_E_PINDAL_SOUTH',
    'shahr_e_pindal_south',
    'SPSP',
    {
      en: 'Shahr-e-Pindal South',
      ur: 'شہرِ پنڈال جنوب',
      romanUrdu: 'Shahr-e-Pindal South',
    },
    ['Shahr-e-Pindal South', 'Shahr Pindal South', 'شہر پنڈال جنوب', 'SPSP'],
    [c(24.970787, 66.999163), c(24.970755, 67.000711), c(24.970811, 67.001605), c(24.970746, 67.003914), c(24.970718, 67.005148), c(24.970784, 67.007223), c(24.97074, 67.009016), c(24.970733, 67.010503)],
  ),
  specialRoute(
    'SHAHR_E_PINDAL_WEST',
    'shahr_e_pindal_west',
    'SPWP',
    {
      en: 'Shahr-e-Pindal West',
      ur: 'شہرِ پنڈال مغرب',
      romanUrdu: 'Shahr-e-Pindal West',
    },
    ['Shahr-e-Pindal West', 'Shahr Pindal West', 'شہر پنڈال مغرب', 'SPWP'],
    [c(24.971665, 66.998982), c(24.970904, 66.999025), c(24.969414, 66.999095), c(24.967439, 66.999083), c(24.965637, 66.999134)],
  ),
];
