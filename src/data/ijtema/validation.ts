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

function shortestPathNodes(data: IjtemaGraphData, fromIds: string[], toIds: string[]): string[] | null {
  if (fromIds.length === 0 || toIds.length === 0) return null;
  const targetSet = new Set(toIds);
  const parent: Record<string, string | null> = {};
  const queue: string[] = [];
  const seen = new Set<string>();

  for (const node of fromIds) {
    if (!data.nodes[node]) continue;
    queue.push(node);
    seen.add(node);
    parent[node] = null;
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (targetSet.has(curr)) {
      const out: string[] = [];
      let step: string | null = curr;
      while (step) {
        out.unshift(step);
        step = parent[step] ?? null;
      }
      return out;
    }

    for (const edge of data.edges) {
      const next = edge.from === curr ? edge.to : edge.to === curr ? edge.from : null;
      if (!next || seen.has(next)) continue;
      if (!data.nodes[next]) continue;
      seen.add(next);
      parent[next] = curr;
      queue.push(next);
    }
  }

  return null;
}

function pathDistance(data: IjtemaGraphData, nodes: string[]): number {
  if (nodes.length < 2) return 0;
  let distance = 0;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const edge = data.edges.find((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
    distance += edge?.distance_m ?? 0;
  }
  return distance;
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

  const blockIds = Object.keys(data.blocks);
  for (const fromId of blockIds) {
    for (const toId of blockIds) {
      if (fromId === toId) continue;

      const fromNodes = resolveRouteTestNodes(data, fromId).filter((nodeId) => data.nodes[nodeId]);
      const toNodes = resolveRouteTestNodes(data, toId).filter((nodeId) => data.nodes[nodeId]);
      if (fromNodes.length === 0 || toNodes.length === 0) {
        errors.push(`Missing route entry nodes for ${fromId} -> ${toId}.`);
        continue;
      }

      let path: string[] | null = null;
      for (const fromNode of fromNodes) {
        for (const toNode of toNodes) {
          if (fromNode === toNode) continue;
          const candidate = shortestPathNodes(data, [fromNode], [toNode]);
          if (!candidate || candidate.length < 2) continue;
          const candidateDistance = pathDistance(data, candidate);
          if (candidateDistance <= 0) continue;
          if (!path || candidateDistance < pathDistance(data, path)) {
            path = candidate;
          }
        }
      }

      if (!path) {
        errors.push(`No non-degenerate route found for ${fromId} -> ${toId} using entry nodes.`);
        continue;
      }

      const distance = pathDistance(data, path);
      if (distance <= 0) {
        errors.push(`Route distance must be > 0 for ${fromId} -> ${toId}.`);
      }

      for (const nodeId of path) {
        const node = data.nodes[nodeId];
        if (!node) {
          errors.push(`Route node '${nodeId}' missing for ${fromId} -> ${toId}.`);
          continue;
        }
        if (typeof node.lat !== 'number' || typeof node.lng !== 'number') {
          errors.push(`Route coordinate missing for node '${nodeId}' in ${fromId} -> ${toId}.`);
        }
      }
    }
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
