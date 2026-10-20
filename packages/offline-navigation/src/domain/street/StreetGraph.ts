/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// B3c: read-only outside-street graph contract. Kept separate from VenueRoutingGraph on purpose: street nodes
// are flat {id, lat, lng} records (wrapping them as VenueNode would copy every node), edges carry rendering
// geometry and names, and outside routing needs a nearest-node lookup and per-place connectors that an
// internal venue graph has no use for. IDs are opaque; no node count, ID grammar or venue is assumed.

export interface StreetPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface StreetNode extends StreetPoint {
  readonly id: string;
}

/**
 * Directed edge out of the node it is listed under; cost = distanceM. A two-way street appears under both
 * endpoints, and the host must supply the reverse copy with its geometry already reversed.
 */
export interface StreetEdge {
  readonly to: string;
  readonly distanceM: number;
  /** Intermediate polyline points between the two endpoints (both excluded), in travel order. */
  readonly geometry?: readonly StreetPoint[];
  readonly name?: string;
}

/** Last hop from a street node to a place that is not itself on the street graph (e.g. a venue gate). */
export interface StreetConnector {
  readonly nodeId: string;
  readonly distanceM: number;
}

export interface StreetRoutingGraph<E extends StreetEdge = StreetEdge, N extends StreetNode = StreetNode> {
  getNode(id: string): N | undefined;
  /** Outgoing edges; empty for unknown or dead-end nodes. Must not be mutated by callers. */
  edgesFrom(id: string): readonly E[];
  /** Nearest street node to an arbitrary point, or undefined for an empty graph. */
  nearestNode(point: StreetPoint): { node: N; distanceM: number } | undefined;
  /** Connector for a host-defined place ID, or undefined when that place has none. */
  connectorFor(placeId: string): StreetConnector | undefined;
  /**
   * B3d-A: true when the point lies inside the area this graph was extracted for, i.e. where routing on it is
   * meaningful. Outside it the host falls back (e.g. to a beeline); the graph decides its own boundary.
   */
  covers(point: StreetPoint): boolean;
}
