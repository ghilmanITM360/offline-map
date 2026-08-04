import { Polyline } from 'react-native-maps';

import type { Coordinate } from '../../../models/types';
import { staticColors } from '../../../theme';

export interface OutsideRoutePolylineProps {
  coordinates: readonly Coordinate[];
  roadFollowing: boolean;
  zIndex: number;
}

export function OutsideRoutePolyline({ coordinates, roadFollowing, zIndex }: OutsideRoutePolylineProps) {
  if (coordinates.length < 2) return null;
  return (
    <>
      <Polyline
        testID="outside-route-casing"
        coordinates={[...coordinates]}
        strokeColor={staticColors.routeCasing}
        strokeWidth={9}
        zIndex={zIndex}
      />
      <Polyline
        testID="outside-route-line"
        coordinates={[...coordinates]}
        strokeColor={staticColors.routeOutside}
        strokeWidth={5}
        lineDashPattern={roadFollowing ? undefined : [8, 6]}
        zIndex={zIndex + 1}
      />
    </>
  );
}
