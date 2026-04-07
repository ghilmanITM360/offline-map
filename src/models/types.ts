/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
  heading?: number;
  accuracy?: number;
}

export type MapMode = 'standard' | 'satellite' | 'hybrid';

export interface Node {
  id: string;
  lat: number;
  lng: number;
  type: 'corner' | 'intersection' | 'road_end' | 'gate' | 'masjid';
  name?: string;
  urduName?: string;
}

export interface Edge {
  from: string;
  to: string;
  distance_m: number;
  isRasta?: boolean;
  name?: string;
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
}

export interface Place {
  id: string;
  name: string;
  urduName?: string;
  category: 'Block' | 'Masjid' | 'Gate' | 'Rasta' | 'Landmark';
  description: string;
  coordinate: Coordinate;
  thumbnail?: string;
  aliases?: string[];
}

export interface UserSettings {
  mapMode: MapMode;
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

/** One alternative route for a destination */
export interface RouteAlternative {
  id: string;
  label: string;
  entryNodeId: string;
  entryFriendlyName: string;
  distanceM: number;
  durationMin: number;
  route: RoutePreview;
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
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  coordinate: Coordinate;
}

export interface RecentSearch {
  id: string;
  title: string;
  timestamp: number;
}

export interface PlaceDetails {
  id: string;
  name: string;
  urduName?: string;
  description: string;
  category: string;
  coordinate: Coordinate;
  image?: string;
  gates?: Gate[];
}

export interface OfflineTile {
  z: number;
  x: number;
  y: number;
  path: string;
}

export interface RoutePreview {
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
