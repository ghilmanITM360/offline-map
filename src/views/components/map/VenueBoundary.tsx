/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Polygon } from 'react-native-maps';

import { Coordinate } from '../../../models/types';

export function VenueBoundary({ coordinates }: { coordinates: Coordinate[] }) {
  return (
    <Polygon
      coordinates={coordinates}
      fillColor="rgba(232,245,233,0.06)"
      strokeColor="rgba(46,125,50,0.48)"
      strokeWidth={2}
      zIndex={0}
    />
  );
}
