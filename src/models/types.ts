/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
  heading?: number;
  accuracy?: number;
  /** Native GPS fix timestamp (epoch ms, from Expo LocationObject.timestamp) — set only on
   * live-navigation fixes published by GPSManagerService. Identifies the physical sensor
   * observation so duplicate deliveries (e.g. forceFix racing the ambient watch subscription)
   * can be deduped by sensor identity instead of JS object reference. */
  observedAtMs?: number;
}

export type LocationSource = 'live' | 'device_last_known' | 'remembered' | 'manual';

// Renamed from `MapMode` (Phase 8A.5 task 3) — collided in name with the unrelated
// navigation-mode state machine `MapMode` in viewmodels/useMapMode.ts (HOME/SEARCH/
// NAVIGATION/...). This one is strictly the Google Maps render/mapType setting.
export type MapDisplayType = 'standard' | 'satellite' | 'hybrid';

export interface Node {
  id: string;
  lat: number;
  lng: number;
  type: 'corner' | 'intersection' | 'road_end' | 'gate' | 'masjid' | 'landmark';
  name?: string;
  urduName?: string;
  /** nearest road node for routing — used by landmark nodes that are off-graph */
  nearestRoadNode?: string;
}

export interface Edge {
  from: string;
  to: string;
  distance_m: number;
  isRasta?: boolean;
  name?: string;
  type?: 'main_rasta' | 'connector' | 'boundary' | 'debug_only';
  rastaId?: string;
  weightMultiplier?: number;
}

export interface Gate {
  id: string;
  name: string;
  urduName?: string;
  coordinate: Coordinate;
  blockId?: string;
}

export interface Block {
  id: string;
  name: string;
  urduName?: string;
  center: Coordinate;
  polygon: Coordinate[];
  gates: string[]; // Node IDs
  connectedRastas: string[]; // Edge IDs or similar
  neighboringBlocks: string[]; // Block IDs
  aliases: string[];
  entry_nodes: string[];
  corners?: Coordinate[];
  role?: string;
}

/**
 * Fields shared by every Place regardless of source version. `sourceVersion`
 * (and, for v2, `sourceKind`) are deliberately excluded here and required on
 * each variant below — this is what makes silent v1-fallback impossible to
 * construct: every Place literal must explicitly declare which map system it
 * came from.
 */
export interface PlaceCommon {
  id: string;
  name: string;
  urduName?: string;
  category:
    | 'Block'
    | 'Masjid'
    | 'Gate'
    | 'Rasta'
    | 'SpecialRoute'
    | 'Terminal'
    | 'Help'
    | 'Intersection'
    | 'RoadEndpoint'
    | 'Landmark'
    | 'CustomPoint';
  description: string;
  coordinate: Coordinate;
  /** Preferred graph node for routing (e.g., chosen block entry). */
  routingNodeId?: string;
  /** Explicitly selected block entry node for UI diagnostics. */
  selectedEntryNodeId?: string;
  /** Final graph node chosen by the planner after snapping/entry selection. */
  resolvedRoutingNodeId?: string;
  /** Final graph coordinate for markers, arrival, and diagnostics. */
  resolvedRoutingCoordinate?: Coordinate;
  /** Optional snapped coordinate on graph/road for custom points. */
  snappedCoordinate?: Coordinate;
  thumbnail?: string;
  aliases?: string[];
  secondaryLabel?: string;
  polygon?: Coordinate[];
  polyline?: Coordinate[];
  routingStatus?: 'routable' | 'missing_coordinate' | 'needs_connector_verification' | 'visual_only';
  isRoutable?: boolean;
  isStartRoutable?: boolean;
  unavailableReason?: string;
  /**
   * Presentational-only warning shown when this place is selected (e.g. a gate
   * whose source coordinate is flagged `needs_verification`). Must never be used
   * to gate routing/navigation logic — that stays on `routingStatus` /
   * `isRoutable` / `canStartRouteFromOutside`. See docs/OFFLINE_NAVIGATION_AND_ROUTING.md.
   */
  verificationWarning?: string;
  developerLabel?: string;
  /** Gate-only: official gate number, from source data (see src/data/ijtema/gates.ts). */
  gateNumber?: number;
  /** Gate-only: true for gates prioritized as always-visible orientation landmarks
   * (src/data/ijtema/gateMeta.ts) — surfaced as a "recommended entry point" hint. */
  isMajorGate?: boolean;
  /** Rasta/SpecialRoute-only: names of blocks whose entry node is graph-connected to this
   * path, derived from the same navigation graph adjacency routing already relies on (see
   * V2PlaceAdapter). Empty/omitted rather than guessed when nothing is graph-connected. */
  connectedBlockNames?: string[];
}

/** Place sourced from the legacy `IJTEMA_DATA` / `LANDMARK_PLACES` (v1) map data. */
export interface V1Place extends PlaceCommon {
  sourceVersion: 'v1';
}

/** What kind of v2 focused-data entity a V2Place was adapted from. */
export type V2PlaceSourceKind = 'block' | 'gate' | 'rasta' | 'special_route';

/** Place sourced from the authoritative `src/data/ijtema/*` (v2) map data. */
export interface V2Place extends PlaceCommon {
  sourceVersion: 'v2';
  sourceKind: V2PlaceSourceKind;
}

export type Place = V1Place | V2Place;

export interface UserSettings {
  mapMode: MapDisplayType;
  autoFollowLocation: boolean;
  keepNorthFixed: boolean;
  darkMode: boolean;
  voiceInstructions: boolean;
  walkingSpeed: number;
  autoReroute: boolean;
  distanceUnit: 'meters' | 'feet';
  language: 'en' | 'ur';
  mapSize?: number;
}

export interface OfflineData {
  isDownloaded: boolean;
  downloadDate?: string;
  sizeMB?: number;
}

export type OfflineMapStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'downloaded'
  | 'corrupt'
  | 'needs_update';

export interface OfflineMapManifest {
  version: number;
  mapId: string;
  zoomLevels: number[];
  tileCountExpected: number;
  tileCountSaved: number;
  completedAt?: string;
  status: Exclude<OfflineMapStatus, 'not_downloaded'>;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  checksum?: string;
  updatedAt: string;
  errorMessage?: string;
}

/** Granular state for the map download flow */
export type DownloadPhase = 'idle' | 'connecting' | 'downloading' | 'paused' | 'error' | 'complete';

export interface DownloadState {
  phase: DownloadPhase;
  progress: number;          // 0 – 1
  downloadedTiles: number;
  totalTiles: number;
  errorMessage: string | null;
  resumable: boolean;        // can we continue where we left off?
}

export const DEFAULT_DOWNLOAD_STATE: DownloadState = {
  phase: 'idle',
  progress: 0,
  downloadedTiles: 0,
  totalTiles: 0,
  errorMessage: null,
  resumable: false,
};

/** Labeled route alternative returned by RoutingService.calculateRoutes */
export interface RouteAlternative {
  label: string;       // 'Fastest' | 'Shortest' | 'Alternative'
  labelUr: string;     // Urdu label
  route: RoutePreview;
}

/** Typed entry point for a block */
export interface BlockEntryPoint {
  nodeId: string;
  side: 'north' | 'south' | 'east' | 'west';
  friendlyName: string;
  urduName: string;
}

/** A saved / favourite place */
export interface FavoritePlace {
  id: string;
  placeId: string;
  name: string;
  urduName?: string;
  category: string;
  coordinate: Coordinate;
  savedAt: string; // ISO timestamp
}

export interface RouteSegment {
  fromId: string;
  toId: string;
  distance: number;
  isRasta: boolean;
  name?: string;
}

export interface NavigationInstruction {
  id: string;
  text: string;
  urduText?: string;
  distance: number;
  type: 'straight' | 'left' | 'right' | 'arrival';
  coordinate: Coordinate;
  /** Road/rasta name for this step, shown as its own line in the nav banner
   * (Google Maps style hierarchy) separate from the composed `text` sentence.
   * Undefined when the underlying edge has no real name — UI falls back to
   * "Continue ahead". */
  roadName?: string;
}

export interface V2NavigationInstruction extends NavigationInstruction {
  distanceM: number;
  routeIndex: number;
  spokenText?: string;
  developerLabel?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  coordinate: Coordinate;
}

/**
 * Fields shared by every route preview regardless of source version.
 * `sourceVersion` is required on each variant below so a route can never be
 * silently treated as v1 by omission — see `Place`/`PlaceCommon` above for
 * the same pattern.
 */
export interface RoutePreviewCommon {
  id: string;
  coordinates: Coordinate[];
  nodes: string[];
  totalDistance: number;
  estimatedTimeMin: number;
  segments: RouteSegment[];
  polyline?: Coordinate[];
  totalTime?: number;
  instructions?: NavigationInstruction[];
}

/** Route preview produced by the legacy A*-based `RoutingService` (v1). */
export interface V1RoutePreview extends RoutePreviewCommon {
  sourceVersion: 'v1';
}

/** Route preview produced by the authoritative graph-based `RoutingServiceV2` (v2). */
export interface V2RoutePreview extends RoutePreviewCommon {
  sourceVersion: 'v2';
  /** Normalized selected outside leg. Added by hybrid provider/core integration; absent for inside-only and legacy routes. */
  outsideRoute?: import('./outsideRouting').NormalizedOutsideCandidate;
  /** How many leading entries of `coordinates` belong to the outside (pre-gate) leg — 0 when there is none. */
  outsideLegCoordinateCount?: number;
  outsideLegSanityCapExceeded?: boolean;
}

export type RoutePreview = V1RoutePreview | V2RoutePreview;

export interface V2ActiveRoute extends V2RoutePreview {
  routeId: string;
  origin: {
    coordinate: Coordinate;
    label: string;
    type: 'inside_snap' | 'official_gate' | 'manual_place';
    gateId?: string;
  };
  destination: {
    coordinate: Coordinate;
    label: string;
    type: 'block' | 'gate' | 'rasta' | 'special_route' | 'facility';
    blockId?: string;
    gateId?: string;
    rastaId?: string;
    facilityId?: string;
    entryNodeId?: string;
    specialRouteId?: string;
  };
  edges: Array<{
    from: string;
    to: string;
    distanceM: number;
    pathType: string;
    label: string;
  }>;
  totalDistanceM: number;
  etaMinutes: number;
  instructions: V2NavigationInstruction[];
  metadata: {
    startedOutside: boolean;
    entryGateId?: string;
    usesOfficialGateEntry: boolean;
    graphVersion: string;
  };
}
