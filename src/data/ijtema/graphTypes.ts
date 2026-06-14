/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, LocalizedLabel } from './types';

export type GraphNodeType = 'rasta_point' | 'gate' | 'block_entry' | 'special_route_point' | 'central_point' | 'intersection';

export type GraphEdgePathType =
  | 'rasta'
  | 'perimeter_connector'
  | 'gate_connector'
  | 'block_connector'
  | 'special_route'
  | 'central_connector'
  | 'intersection_connector';

export interface GraphNode {
  id: string;
  coordinate: Coordinate;
  type: GraphNodeType;
  name: LocalizedLabel;
  developerLabel: string;
  sourceId?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  distanceM: number;
  bidirectional: boolean;
  pathType: GraphEdgePathType;
  name: LocalizedLabel;
  developerLabel: string;
  weightMultiplier?: number;
}

export interface NavigationGraphV2 {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  adjacency: Record<string, GraphEdge[]>;
  metadata: {
    version: string;
    source: 'ijtema_v2';
    generatedAt?: string;
  };
}

export interface GateConnectorReport {
  gateId: string;
  gateNumber: number;
  connected: boolean;
  nearestNodeId?: string;
  distanceM?: number;
  warning?: string;
}

export interface BlockEntryConnectorReport {
  blockId: string;
  entryId: string;
  connected: boolean;
  nearestNodeId?: string;
  distanceM?: number;
  warning?: string;
}

export interface IntersectionConnectorReport {
  from: string;
  to: string;
  distanceM: number;
  name: string;
}

export interface NavigationGraphV2Report {
  nodeCountByType: Record<GraphNodeType, number>;
  edgeCountByPathType: Record<GraphEdgePathType, number>;
  gateConnectors: GateConnectorReport[];
  blockEntryConnectors: BlockEntryConnectorReport[];
  intersectionConnectors: IntersectionConnectorReport[];
  warnings: string[];
}
