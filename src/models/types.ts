/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
  heading?: number;
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

export interface RouteSegment {
  from: Coordinate;
  to: Coordinate;
  distance: number;
  instruction: string;
}

export interface NavigationInstruction {
  id: string;
  text: string;
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
  polyline: Coordinate[];
  totalDistance: number;
  totalTime: number;
  instructions: NavigationInstruction[];
  coordinates: Coordinate[];
  nodes: string[];
  id: string;
}
