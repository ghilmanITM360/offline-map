/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface LocalizedLabel {
  en: string;
  ur?: string;
  romanUrdu?: string;
}

export interface BlockCorners {
  c1: Coordinate;
  c2: Coordinate;
  c3: Coordinate;
  c4: Coordinate;
}

export interface Block {
  id: `B${number}`;
  number: number;
  name: LocalizedLabel;
  center: Coordinate;
  corners: BlockCorners;
  entryPoints: BlockCorners;
  polygon: Coordinate[];
  aliases: string[];
  category: 'block';
  status: 'provided' | 'needs_verification';
  visual: {
    label: string;
    fillKey: string;
    showLabelByDefault: boolean;
  };
  sourceNotes?: string[];
}

export interface Gate {
  id: `GATE_${string}`;
  number: number;
  name: LocalizedLabel;
  coordinate?: Coordinate;
  aliases: string[];
  category: 'gate';
  status: 'provided' | 'missing_coordinate' | 'needs_verification';
  entryRole: 'official_entry_exit';
  routingStatus: 'routable' | 'missing_coordinate';
  isOfficialEntry: true;
  canStartRouteFromOutside: boolean;
  connectorStatus: 'verified_by_geometry' | 'ground_truth_required';
  userFacingBehavior: {
    normalSearch: 'searchable' | 'unavailable';
    mapDisplay: 'visible' | 'unavailable';
    routeSelection: 'enabled' | 'disabled';
    unavailableReason?: string;
  };
  sourceNotes?: string[];
}

export interface RastaPoint {
  id: `R${number}-${string}`;
  rastaId: `R${number}`;
  rastaNumber: number;
  sequence: number;
  coordinate: Coordinate;
  name: LocalizedLabel;
  developerLabel?: string;
}

export interface RastaSegment {
  id: string;
  pointIds: Array<RastaPoint['id']>;
}

export interface RastaJunction {
  fromPointId: RastaPoint['id'];
  toPointId: RastaPoint['id'];
}

export interface Rasta {
  id: `R${number}`;
  number: number;
  name: LocalizedLabel;
  points: RastaPoint[];
  /** Independently surveyed polylines. Adjacent points connect only inside a segment. */
  segments: RastaSegment[];
  /** Explicit surveyed links between nearby points on separate segments of the same Rasta. */
  junctions: RastaJunction[];
  aliases: string[];
  category: 'rasta';
  visual: {
    label: string;
    strokeKey: string;
    showLabelByDefault: boolean;
  };
}

export type SpecialRouteGroup =
  | 'shahr_e_pindal_north'
  | 'shahr_e_pindal_south'
  | 'shahr_e_pindal_west'
  | 'prp';

export interface SpecialRoutePoint {
  id: string;
  group: SpecialRouteGroup;
  sequence: number;
  coordinate: Coordinate;
  name: LocalizedLabel;
  developerLabel?: string;
}

export interface SpecialRoute {
  id: string;
  name: LocalizedLabel;
  points: SpecialRoutePoint[];
  aliases: string[];
  category: 'special_route';
  visual: {
    label: string;
    strokeKey: string;
    showLabelByDefault: boolean;
  };
}

export interface CentralPoint {
  id: `P${number}`;
  coordinate: Coordinate;
  name: LocalizedLabel;
  developerLabel: string;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface DataIssue {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'missing_coordinate' | 'source_typo' | 'duplicate_source_id' | 'near_duplicate' | 'geometry' | 'source_gap';
  affectedIds: string[];
  summary: string;
  resolution: string;
}
