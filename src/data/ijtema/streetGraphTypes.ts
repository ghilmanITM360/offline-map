/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StreetGraphPoint {
  lat: number;
  lng: number;
}

export interface StreetGraphMetadata {
  version: string;
  source: 'osm_overpass';
  centerLat: number;
  centerLng: number;
  radiusM: number;
  generatedAt: string;
  rawNodeCount: number;
  rawEdgeCount: number;
  simplifiedNodeCount: number;
  simplifiedEdgeCount: number;
  excludedDisconnectedNodeCount: number;
  excludedConstructionWayCount: number;
  pedestrianProfileVersion?: string;
  excludedWayReasonCounts?: Record<string, number>;
  barrierNodeCount?: number;
  excludedBarrierEdgeCount?: number;
  directionalEdgeCount?: number;
}

/**
 * On-disk / committed shape. Columnar (parallel-array, no repeated object
 * keys) to keep the generated file compact — see docs/OSM_DATA_VALIDATION_REPORT.md
 * for why size matters here (~14k raw nodes bundled for a mobile app).
 * Node ids are array indices (0..nodeLat.length-1). Names are deduplicated
 * into a shared `names` table since only ~1% of edges carry one.
 * `streetGraphBuilder.ts` expands this into the friendlier
 * `StreetNavigationGraph` runtime shape once, at module load.
 */
export interface StreetGraphData {
  nodeLat: number[];
  nodeLng: number[];
  /** Node index for each edge's start point. */
  edgeFrom: number[];
  /** Node index for each edge's end point. */
  edgeTo: number[];
  edgeDistanceM: number[];
  /** Index into `names`, or -1 if this edge has no OSM name tag. */
  edgeNameIndex: number[];
  /**
   * Intermediate polyline points between `from` and `to` (excludes both
   * endpoints), flattened as [lat0,lng0,lat1,lng1,...] — present when this
   * edge was formed by collapsing a chain of degree-2 pass-through OSM
   * nodes, empty for edges that were already a single OSM segment.
   */
  edgeGeometry: number[][];
  /** 0 = both, 1 = stored from->to only, 2 = stored to->from only. */
  edgeDirection?: number[];
  /** Deduplicated pedestrian-profile diagnostic for each edge. */
  edgeProfileIndex?: number[];
  profiles?: string[];
  names: string[];
  gateConnectorGateIds: string[];
  /** Node index nearest each gate in `gateConnectorGateIds` (same order). */
  gateConnectorNodeIndex: number[];
  gateConnectorDistanceM: number[];
  metadata: StreetGraphMetadata;
}

export interface StreetGraphNode {
  id: string;
  lat: number;
  lng: number;
}

export interface StreetGraphEdge {
  id: string;
  from: string;
  to: string;
  distanceM: number;
  /** Present only for the ~1% of OSM ways in this extract that carry a name tag. */
  name?: string;
  geometry?: StreetGraphPoint[];
  direction?: 'both' | 'forward' | 'reverse';
  profile?: string;
}

export interface StreetGateConnector {
  gateId: string;
  nodeId: string;
  distanceM: number;
}

/** Runtime shape, expanded once from `StreetGraphData` by streetGraphBuilder.ts. */
export interface StreetNavigationGraph {
  nodes: Record<string, StreetGraphNode>;
  edges: StreetGraphEdge[];
  adjacency: Record<string, StreetGraphEdge[]>;
  gateConnectors: Record<string, StreetGateConnector>;
  metadata: StreetGraphMetadata;
}
