/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CentralPoint, Coordinate } from './types';

const c = (lat: number, lng: number): Coordinate => ({ lat, lng });

const centralPoint = (number: number, coordinate: Coordinate): CentralPoint => ({
  id: `P${number}`,
  coordinate,
  name: {
    en: `Central Junction ${number}`,
    ur: `مرکزی جنکشن ${number}`,
    romanUrdu: `Central Junction ${number}`,
  },
  developerLabel: `P${number}`,
});

export const IJTEMA_CENTRAL_POINTS: CentralPoint[] = [
  centralPoint(1, c(24.9693889, 67.0006944)),
  centralPoint(2, c(24.9693889, 67.0016389)),
  centralPoint(3, c(24.9693889, 67.0027222)),
  centralPoint(4, c(24.9694167, 67.0039444)),
  centralPoint(5, c(24.9693889, 67.0048611)),
  centralPoint(6, c(24.9684167, 67.0016111)),
  centralPoint(7, c(24.9684167, 67.0048611)),
  centralPoint(8, c(24.9674167, 67.0006667)),
  centralPoint(9, c(24.9674167, 67.0016111)),
  centralPoint(10, c(24.9674167, 67.0026944)),
  centralPoint(11, c(24.9674167, 67.0039167)),
  centralPoint(12, c(24.9674167, 67.0048611)),
];
