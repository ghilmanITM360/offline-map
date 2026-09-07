import type { GpsSignalStateV2 } from '../services/V2NavigationRuntimeService';

export type MapWarningKind =
  | 'navigation_safety'
  | 'rerouting'
  | 'basemap_degradation'
  | 'route_context'
  | 'offline';

export interface MapWarning {
  kind: MapWarningKind;
  message: string;
}

export interface MapWarningInputs {
  gpsSignalState?: GpsSignalStateV2;
  isWeakGps?: boolean;
  reroutePending?: boolean;
  rerouteStatusMessage?: string | null;
  basemapDegraded?: boolean;
  basemapMessage?: string;
  routeContextMessage?: string | null;
  offline?: boolean;
}

const GPS_LOST_MESSAGE = 'Searching for GPS signal. Your position may be out of date.';
const GPS_WEAK_MESSAGE = 'Weak GPS signal detected. Route updates may be slower.';
const REROUTING_MESSAGE = 'Recalculating your route…';

/** Pure priority policy. It reads existing state and never owns mutable banner state. */
export function selectMapWarning(inputs: Readonly<MapWarningInputs>): MapWarning | null {
  if (inputs.gpsSignalState === 'GPS_LOST') {
    return { kind: 'navigation_safety', message: GPS_LOST_MESSAGE };
  }
  if (inputs.isWeakGps || inputs.gpsSignalState === 'GPS_WEAK') {
    return { kind: 'navigation_safety', message: GPS_WEAK_MESSAGE };
  }
  if (inputs.reroutePending) {
    return { kind: 'rerouting', message: REROUTING_MESSAGE };
  }
  if (inputs.rerouteStatusMessage) {
    return { kind: 'rerouting', message: inputs.rerouteStatusMessage };
  }
  if (inputs.basemapDegraded && inputs.basemapMessage) {
    return { kind: 'basemap_degradation', message: inputs.basemapMessage };
  }
  if (inputs.routeContextMessage) {
    return { kind: 'route_context', message: inputs.routeContextMessage };
  }
  if (inputs.offline) {
    return { kind: 'offline', message: 'Offline' };
  }
  return null;
}
