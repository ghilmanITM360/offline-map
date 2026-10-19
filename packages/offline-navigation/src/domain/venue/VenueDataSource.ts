/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// B3a: venue-independent, read-only data contract. IDs are opaque strings: no venue ID grammar
// (GATE_xx, Bxx_Cn, ...) and no venue cardinality is assumed here. Consumers get accessors, never the
// backing records, so a hostile ID such as '__proto__' can never reach an object-prototype lookup.

export interface VenueCoordinate {
  readonly lat: number;
  readonly lng: number;
}

export interface VenueNode {
  readonly id: string;
  readonly coordinate: VenueCoordinate;
}

/** Directed edge out of the node it is listed under. Cost = distanceM * (weightMultiplier ?? 1). */
export interface VenueEdge {
  readonly to: string;
  readonly distanceM: number;
  readonly weightMultiplier?: number;
}

export interface VenueRoutingGraph<E extends VenueEdge = VenueEdge> {
  nodeIds(): readonly string[];
  getNode(id: string): VenueNode | undefined;
  /** Outgoing edges; empty for unknown or dead-end nodes. Must not be mutated by callers. */
  edgesFrom(id: string): readonly E[];
}

/** A named destination/origin and the graph nodes a route may start or end at. */
export interface VenuePlace {
  readonly id: string;
  /** Venue-defined label (e.g. 'gate', 'block'); opaque to the SDK. */
  readonly kind: string;
  readonly nodeIds: readonly string[];
}

export interface VenueDataSource<E extends VenueEdge = VenueEdge> {
  readonly venueId: string;
  /** Data pack/version label, for diagnostics and cache keys. */
  readonly dataVersion: string;
  readonly graph: VenueRoutingGraph<E>;
  placeIds(): readonly string[];
  getPlace(id: string): VenuePlace | undefined;
}

export const edgeCostM = (edge: VenueEdge): number => edge.distanceM * (edge.weightMultiplier ?? 1);
