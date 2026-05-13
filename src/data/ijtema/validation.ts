/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Block, Edge, Node } from '../../models/types';

export interface IjtemaGraphData {
  nodes: Record<string, Node>;
  edges: Edge[];
  blocks: Record<string, Block>;
}

export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function isConnectedGraph(data: IjtemaGraphData): boolean {
  const nodeIds = Object.keys(data.nodes);
  if (nodeIds.length === 0) return false;

  const adjacency: Record<string, Set<string>> = {};
  for (const nodeId of nodeIds) adjacency[nodeId] = new Set<string>();

  for (const edge of data.edges) {
    adjacency[edge.from]?.add(edge.to);
    adjacency[edge.to]?.add(edge.from);
  }

  const start = nodeIds[0];
  const seen = new Set<string>([start]);
  const queue: string[] = [start];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const next of adjacency[curr] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return seen.size === nodeIds.length;
}

function hasAnyPath(data: IjtemaGraphData, fromIds: string[], toIds: string[]): boolean {
  if (fromIds.length === 0 || toIds.length === 0) return false;

  const targetSet = new Set(toIds);
  const adjacency: Record<string, string[]> = {};
  for (const edge of data.edges) {
    (adjacency[edge.from] ||= []).push(edge.to);
    (adjacency[edge.to] ||= []).push(edge.from);
  }

  const seen = new Set<string>(fromIds);
  const queue = [...fromIds];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (targetSet.has(curr)) return true;

    for (const next of adjacency[curr] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

function resolveRouteTestNodes(data: IjtemaGraphData, id: string): string[] {
  if (data.blocks[id]) return data.blocks[id].entry_nodes;
  if (data.nodes[id]) return [id];
  return [];
}

export function validateIjtemaGraph(data: IjtemaGraphData): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const edge of data.edges) {
    if (!data.nodes[edge.from]) errors.push(`Edge from '${edge.from}' points to missing node.`);
    if (!data.nodes[edge.to]) errors.push(`Edge to '${edge.to}' points to missing node.`);
    if (edge.distance_m < 0) errors.push(`Edge ${edge.from} -> ${edge.to} has negative distance.`);
    if (edge.distance_m === 0) errors.push(`Edge ${edge.from} -> ${edge.to} has zero distance.`);
  }

  for (const [blockId, block] of Object.entries(data.blocks)) {
    if (!block.center) errors.push(`Block '${blockId}' is missing center.`);
    if (!block.corners || block.corners.length !== 4) {
      errors.push(`Block '${blockId}' must have exactly 4 corners.`);
    }

    for (const entryId of block.entry_nodes) {
      if (!data.nodes[entryId]) {
        errors.push(`Block '${blockId}' entry node '${entryId}' does not exist.`);
      }
    }
  }

  if (!data.nodes.S7) {
    errors.push('Required node S7 is missing.');
  }

  if (data.nodes.S2 && data.nodes.S7) {
    const sameCoords =
      data.nodes.S2.lat === data.nodes.S7.lat && data.nodes.S2.lng === data.nodes.S7.lng;
    if (sameCoords) {
      errors.push('S2 and S7 have identical coordinates (S2/S7 confusion not fixed).');
    }
  }

  if (!isConnectedGraph(data)) {
    errors.push('Graph is not fully connected.');
  }

  const smokeTests: Array<[string, string]> = [
    ['B1', 'B24'],
    ['B24', 'B1'],
    ['B6', 'B18'],
    ['B3', 'B21'],
    ['S13', 'S16'],
    ['S14', 'S15'],
    ['S13', 'S15'],
    ['T1', 'B21'],
  ];

  for (const [fromId, toId] of smokeTests) {
    const ok = hasAnyPath(
      data,
      resolveRouteTestNodes(data, fromId),
      resolveRouteTestNodes(data, toId),
    );
    if (!ok) errors.push(`No graph path found for validation route ${fromId} -> ${toId}.`);
  }

  if (data.edges.length < 20) {
    warnings.push('Edge count is unusually low for base navigation graph.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
