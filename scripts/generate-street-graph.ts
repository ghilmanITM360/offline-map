/**
 * One-time / rerunnable data-pipeline tool. Pulls a real OSM extract around
 * the Karachi Ijtema venue via the Overpass API, filters + simplifies it into
 * a routable pedestrian street graph, synthesizes gate connectors, and writes
 * the result to src/data/ijtema/streetGraph.ts as a committed TS source file
 * (same "no generated/checksum source, this file is truth" convention as the
 * rest of src/data/ijtema/*  — this script is the *tool* that produced it,
 * not something run at build/runtime).
 *
 * Re-run this script (`node --import tsx scripts/generate-street-graph.ts`)
 * if the roads near the venue change and the extract needs a fresh pull.
 *
 * See docs/OFFLINE_MAP_AND_DATA.md for the validated methodology this
 * mirrors (same query, same center point, same 3km radius).
 */
import { writeFileSync } from 'node:fs';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { haversineM } from '../src/utils/SpatialGrid';
import type { StreetGraphData, StreetGraphPoint } from '../src/data/ijtema/streetGraphTypes';
import {
  evaluatePedestrianWay,
  PEDESTRIAN_PROFILE_VERSION,
  type PedestrianDirection,
} from './pedestrianProfile';

const VENUE_CENTER_LAT = 24.971698;
const VENUE_CENTER_LNG = 67.006464;
const RADIUS_M = 3000;
const GATE_CONNECTOR_MAX_M = 320; // same convention as src/data/ijtema/graphBuilder.ts

interface OverpassWay {
  type: 'way';
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  nodes?: number[];
  tags?: Record<string, string>;
}

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: Array<OverpassWay | OverpassNode>;
}

const roundCoord = (value: number): number => Math.round(value * 1e6) / 1e6;
const vertexKey = (lat: number, lng: number): string => `${roundCoord(lat)}:${roundCoord(lng)}`;

async function fetchOverpass(): Promise<OverpassResponse> {
  const query = `[out:json][timeout:90];\nway(around:${RADIUS_M},${VENUE_CENTER_LAT},${VENUE_CENTER_LNG})["highway"];\n(._;>;);\nout body geom;`;

  const maxAttempts = 4;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'User-Agent': 'KarachiIjtemaOfflineNav-DataPipeline/1.0',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass request failed: HTTP ${response.status}`);
      }

      return (await response.json()) as OverpassResponse;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Overpass attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
      if (attempt < maxAttempts) {
        const backoffMs = attempt * 15000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError ?? new Error('Overpass request failed for an unknown reason');
}

// ─── Union-Find ──────────────────────────────────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();

  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id);
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cursor = id;
    while (this.parent.get(cursor) !== root) {
      const next = this.parent.get(cursor)!;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

// ─── Pipeline ────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching OSM extract: ${RADIUS_M}m around (${VENUE_CENTER_LAT}, ${VENUE_CENTER_LNG})...`);
  const raw = await fetchOverpass();
  const allWays = raw.elements.filter((element): element is OverpassWay => element.type === 'way');
  const allNodes = raw.elements.filter((element): element is OverpassNode => element.type === 'node');
  console.log(`Fetched ${allWays.length} ways and ${allNodes.length} referenced nodes.`);

  const excludedWayReasonCounts: Record<string, number> = {};
  const decisionByWayId = new Map<number, ReturnType<typeof evaluatePedestrianWay>>();
  const ways = allWays.filter((way) => {
    if (!way.geometry || way.geometry.length < 2) return false;
    const decision = evaluatePedestrianWay(way.tags ?? {});
    decisionByWayId.set(way.id, decision);
    if (!decision.include) {
      excludedWayReasonCounts[decision.reason] = (excludedWayReasonCounts[decision.reason] ?? 0) + 1;
    }
    return decision.include;
  });
  const excludedConstructionWayCount = excludedWayReasonCounts['inactive-highway'] ?? 0;
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const isBlockingBarrierNode = (nodeId: number | undefined): boolean => {
    if (nodeId === undefined) return false;
    const tags = nodeById.get(nodeId)?.tags;
    if (!tags?.barrier) return false;
    const foot = tags.foot?.toLowerCase();
    if (['yes', 'designated', 'permissive'].includes(foot ?? '')) return false;
    if (['bollard', 'cycle_barrier', 'kerb'].includes(tags.barrier.toLowerCase()) && tags.access !== 'no' && tags.access !== 'private') {
      return false;
    }
    return true;
  };
  const barrierNodeCount = allNodes.filter((node) => Boolean(node.tags?.barrier)).length;

  // Raw graph: every OSM vertex is a node, consecutive way-geometry points are edges.
  // Overpass's `around:` filter matches a *way* if any part of its geometry
  // touches the radius disk — it does not clip the geometry itself, so ways
  // can extend arbitrarily far beyond RADIUS_M. Clip here: drop any edge with
  // either endpoint outside RADIUS_M of the venue center, so a long road that
  // merely grazes the disk doesn't drag in a multi-kilometer tail (this
  // produced a real ~3km outlier edge before this clip was added — the exact
  // failure class `dataIssues.ts`'s RASTA_06 check already guards against for
  // the venue graph).
  const rawVertices = new Map<string, StreetGraphPoint>();
  interface RawEdge {
    from: string;
    to: string;
    distanceM: number;
    name?: string;
    profile: string;
    allowsForward: boolean;
    allowsReverse: boolean;
  }
  const rawEdgeSet = new Map<string, RawEdge>();
  const rawAdjacency = new Map<string, Set<string>>();

  const addRawAdjacency = (a: string, b: string) => {
    if (!rawAdjacency.has(a)) rawAdjacency.set(a, new Set());
    if (!rawAdjacency.has(b)) rawAdjacency.set(b, new Set());
    rawAdjacency.get(a)!.add(b);
    rawAdjacency.get(b)!.add(a);
  };

  const isWithinRadius = (point: StreetGraphPoint): boolean =>
    haversineM(VENUE_CENTER_LAT, VENUE_CENTER_LNG, point.lat, point.lng) <= RADIUS_M;

  let clippedEdgeCount = 0;
  let excludedBarrierEdgeCount = 0;

  for (const way of ways) {
    const name = way.tags?.name;
    const decision = decisionByWayId.get(way.id)!;
    const profile = `${decision.highway ?? 'unknown'}:${decision.reason}`;
    const points = way.geometry!;
    let previousKey: string | undefined;
    let previousNodeId: number | undefined;
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      const nodeId = way.nodes?.[pointIndex];
      const key = vertexKey(point.lat, point.lon);
      const coord = { lat: roundCoord(point.lat), lng: roundCoord(point.lon) };
      if (!rawVertices.has(key)) rawVertices.set(key, coord);

      if (previousKey && previousKey !== key) {
        if (isBlockingBarrierNode(previousNodeId) || isBlockingBarrierNode(nodeId)) {
          excludedBarrierEdgeCount += 1;
          previousKey = key;
          previousNodeId = nodeId;
          continue;
        }
        if (!isWithinRadius(rawVertices.get(previousKey)!) || !isWithinRadius(coord)) {
          clippedEdgeCount += 1;
          // Boundary crossing: stop walking this way past the clip edge
          // rather than silently reconnecting across the gap.
          previousKey = undefined;
          previousNodeId = undefined;
          continue;
        }
        const distanceM = haversineM(
          rawVertices.get(previousKey)!.lat,
          rawVertices.get(previousKey)!.lng,
          coord.lat,
          coord.lng,
        );
        const edgeKey = previousKey < key ? `${previousKey}|${key}` : `${key}|${previousKey}`;
        const wayAllowsForward = decision.direction === 'both' || decision.direction === 'forward';
        const wayAllowsReverse = decision.direction === 'both' || decision.direction === 'reverse';
        const existing = rawEdgeSet.get(edgeKey);
        if (!existing) {
          rawEdgeSet.set(edgeKey, {
            from: previousKey,
            to: key,
            distanceM,
            name,
            profile,
            allowsForward: wayAllowsForward,
            allowsReverse: wayAllowsReverse,
          });
        } else if (existing.from === previousKey) {
          existing.allowsForward ||= wayAllowsForward;
          existing.allowsReverse ||= wayAllowsReverse;
        } else {
          existing.allowsForward ||= wayAllowsReverse;
          existing.allowsReverse ||= wayAllowsForward;
        }
        addRawAdjacency(previousKey, key);
      }
      previousKey = key;
      previousNodeId = nodeId;
    }
  }

  // Only count vertices actually used by an in-radius edge — a vertex parsed
  // from a way's geometry but always on the excluded side of the clip is not
  // a real graph node.
  const rawNodeCount = rawAdjacency.size;
  const rawEdgeCount = rawEdgeSet.size;
  console.log(`Raw graph: ${rawNodeCount} nodes, ${rawEdgeCount} edges (clipped ${clippedEdgeCount} edges crossing the ${RADIUS_M}m boundary).`);

  // Connectivity: keep only the largest component.
  const uf = new UnionFind();
  for (const [a, neighbors] of rawAdjacency) {
    for (const b of neighbors) uf.union(a, b);
  }
  const componentSizes = new Map<string, number>();
  for (const key of rawAdjacency.keys()) {
    const root = uf.find(key);
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
  }
  let largestRoot = '';
  let largestSize = 0;
  for (const [root, size] of componentSizes) {
    if (size > largestSize) {
      largestRoot = root;
      largestSize = size;
    }
  }
  const keepSet = new Set([...rawAdjacency.keys()].filter((key) => uf.find(key) === largestRoot));
  const excludedDisconnectedNodeCount = rawNodeCount - keepSet.size;
  console.log(
    `Connectivity: ${componentSizes.size} components. Keeping largest (${keepSet.size} nodes), excluding ${excludedDisconnectedNodeCount} disconnected nodes.`,
  );

  // Degree-2 simplification: collapse chains of degree-2 pass-through nodes
  // into a single edge carrying the intermediate geometry, keeping only
  // intersections / dead-ends / cycle-break points as routing-graph nodes.
  const keptAdjacency = new Map<string, Set<string>>();
  for (const key of keepSet) {
    const neighbors = new Set([...(rawAdjacency.get(key) ?? [])].filter((n) => keepSet.has(n)));
    keptAdjacency.set(key, neighbors);
  }

  const rawEdgeFor = (a: string, b: string): RawEdge | undefined =>
    rawEdgeSet.get(a < b ? `${a}|${b}` : `${b}|${a}`);
  const isDirectionalEdge = (edge: RawEdge | undefined): boolean =>
    Boolean(edge && (!edge.allowsForward || !edge.allowsReverse));
  const isTopologyNode = (key: string): boolean =>
    (keptAdjacency.get(key)?.size ?? 0) !== 2 ||
    [...(keptAdjacency.get(key) ?? [])].some((neighbor) => isDirectionalEdge(rawEdgeFor(key, neighbor)));

  interface SimplifiedEdge {
    from: string;
    to: string;
    distanceM: number;
    name?: string;
    geometry: StreetGraphPoint[];
    direction: Exclude<PedestrianDirection, 'none'>;
    profile: string;
  }
  const simplifiedEdges: SimplifiedEdge[] = [];

  const walkChain = (startKey: string, firstStep: string) => {
    const geometry: StreetGraphPoint[] = [];
    let distanceM = 0;
    let previous = startKey;
    let current = firstStep;
    let name: string | undefined;
    let profile: string | undefined;
    let allowsForward = true;
    let allowsReverse = true;

    const edgeDistance = (a: string, b: string): number => {
      const edge = rawEdgeFor(a, b);
      if (edge?.name && !name) name = edge.name;
      if (edge?.profile && !profile) profile = edge.profile;
      if (edge && edge.from === a) {
        allowsForward &&= edge.allowsForward;
        allowsReverse &&= edge.allowsReverse;
      } else if (edge) {
        allowsForward &&= edge.allowsReverse;
        allowsReverse &&= edge.allowsForward;
      }
      return edge?.distanceM ?? haversineM(rawVertices.get(a)!.lat, rawVertices.get(a)!.lng, rawVertices.get(b)!.lat, rawVertices.get(b)!.lng);
    };

    distanceM += edgeDistance(previous, current);

    // Walk forward while `current` is a pass-through (degree-2) node.
    while (!isTopologyNode(current)) {
      const neighbors = [...(keptAdjacency.get(current) ?? [])];
      const next = neighbors.find((n) => n !== previous);
      if (!next) break; // dead-end inside a chain (shouldn't happen, defensive)
      geometry.push(rawVertices.get(current)!);
      distanceM += edgeDistance(current, next);
      previous = current;
      current = next;
      if (current === startKey) break; // closed loop of degree-2 nodes, break here
    }

    const direction: Exclude<PedestrianDirection, 'none'> =
      allowsForward && allowsReverse ? 'both' : allowsForward ? 'forward' : 'reverse';
    return { to: current, distanceM, geometry, name, direction, profile: profile ?? 'unknown:included' };
  };

  // Every topology-node-to-neighbor pair is walked exactly once here (each
  // key's adjacency Set has no duplicates, and each key is visited once by
  // the outer loop) — but the same topology-to-topology edge is naturally
  // walked from both ends across different outer-loop iterations. That's
  // intentional: it's simpler and cheap at this scale, and the canonical-key
  // dedup below collapses both directions into one edge.
  for (const key of keepSet) {
    if (!isTopologyNode(key)) continue;
    for (const neighbor of keptAdjacency.get(key) ?? []) {
      const result = walkChain(key, neighbor);
      simplifiedEdges.push({ from: key, to: result.to, distanceM: result.distanceM, name: result.name, geometry: result.geometry, direction: result.direction, profile: result.profile });
    }
  }

  // Dedup undirected simplified edges (each topology-to-topology walk was
  // attempted from both ends above; keep one canonical direction per pair+path).
  const dedupedEdges = new Map<string, SimplifiedEdge>();
  for (const edge of simplifiedEdges) {
    if (edge.from === edge.to) continue; // degenerate loop, skip
    const canonicalKey =
      edge.from < edge.to
        ? `${edge.from}|${edge.to}|${Math.round(edge.distanceM)}`
        : `${edge.to}|${edge.from}|${Math.round(edge.distanceM)}`;
    if (!dedupedEdges.has(canonicalKey)) dedupedEdges.set(canonicalKey, edge);
  }

  const topologyNodeKeys = [...keepSet].filter(isTopologyNode);
  console.log(`Simplified (degree-2 collapsed): ${topologyNodeKeys.length} nodes, ${dedupedEdges.size} edges.`);

  // Assign 0-based array-index ids.
  const indexByKey = new Map<string, number>();
  topologyNodeKeys.forEach((key, index) => indexByKey.set(key, index));

  const nodeLat = topologyNodeKeys.map((key) => rawVertices.get(key)!.lat);
  const nodeLng = topologyNodeKeys.map((key) => rawVertices.get(key)!.lng);

  const names: string[] = [];
  const nameIndexOf = (name: string | undefined): number => {
    if (!name) return -1;
    const existing = names.indexOf(name);
    if (existing >= 0) return existing;
    names.push(name);
    return names.length - 1;
  };

  const edgeList = [...dedupedEdges.values()];
  const edgeFrom = edgeList.map((edge) => indexByKey.get(edge.from)!);
  const edgeTo = edgeList.map((edge) => indexByKey.get(edge.to)!);
  const edgeDistanceM = edgeList.map((edge) => Math.round(edge.distanceM * 100) / 100);
  const edgeNameIndex = edgeList.map((edge) => nameIndexOf(edge.name));
  const edgeGeometry = edgeList.map((edge) => {
    const flat: number[] = [];
    for (const point of edge.geometry) {
      flat.push(point.lat, point.lng);
    }
    return flat;
  });
  const edgeDirection = edgeList.map((edge) => edge.direction === 'forward' ? 1 : edge.direction === 'reverse' ? 2 : 0);
  const profiles: string[] = [];
  const profileIndexOf = (profile: string): number => {
    const existing = profiles.indexOf(profile);
    if (existing >= 0) return existing;
    profiles.push(profile);
    return profiles.length - 1;
  };
  const edgeProfileIndex = edgeList.map((edge) => profileIndexOf(edge.profile));

  // Gate connectors: nearest topology node for each of the 17 known gates.
  const gateConnectorGateIds: string[] = [];
  const gateConnectorNodeIndex: number[] = [];
  const gateConnectorDistanceM: number[] = [];
  for (const gate of IJTEMA_GATES) {
    if (!gate.coordinate || !gate.canStartRouteFromOutside) continue;
    let best: { key: string; distanceM: number } | undefined;
    for (const key of topologyNodeKeys) {
      const point = rawVertices.get(key)!;
      const distanceM = haversineM(gate.coordinate.lat, gate.coordinate.lng, point.lat, point.lng);
      if (!best || distanceM < best.distanceM) best = { key, distanceM };
    }
    if (best && best.distanceM <= GATE_CONNECTOR_MAX_M) {
      gateConnectorGateIds.push(gate.id);
      gateConnectorNodeIndex.push(indexByKey.get(best.key)!);
      gateConnectorDistanceM.push(Math.round(best.distanceM * 100) / 100);
    } else {
      console.warn(`Gate ${gate.id}: no street-graph node within ${GATE_CONNECTOR_MAX_M}m (nearest: ${best?.distanceM ?? 'none'}m).`);
    }
  }
  console.log(`Gate connectors: ${gateConnectorGateIds.length}/${IJTEMA_GATES.filter((g) => g.coordinate).length} gates connected.`);

  const data: StreetGraphData = {
    nodeLat,
    nodeLng,
    edgeFrom,
    edgeTo,
    edgeDistanceM,
    edgeNameIndex,
    edgeGeometry,
    edgeDirection,
    edgeProfileIndex,
    profiles,
    names,
    gateConnectorGateIds,
    gateConnectorNodeIndex,
    gateConnectorDistanceM,
    metadata: {
      version: '1.0.0',
      source: 'osm_overpass',
      centerLat: VENUE_CENTER_LAT,
      centerLng: VENUE_CENTER_LNG,
      radiusM: RADIUS_M,
      generatedAt: new Date().toISOString(),
      rawNodeCount,
      rawEdgeCount,
      simplifiedNodeCount: nodeLat.length,
      simplifiedEdgeCount: edgeFrom.length,
      excludedDisconnectedNodeCount,
      excludedConstructionWayCount,
      pedestrianProfileVersion: PEDESTRIAN_PROFILE_VERSION,
      excludedWayReasonCounts,
      barrierNodeCount,
      excludedBarrierEdgeCount,
      directionalEdgeCount: edgeDirection.filter((direction) => direction !== 0).length,
    },
  };

  writeStreetGraphSource(data);
  console.log('Wrote src/data/ijtema/streetGraph.ts');
}

function writeStreetGraphSource(data: StreetGraphData): void {
  const header = `/**\n * @license\n * SPDX-License-Identifier: Apache-2.0\n */\n\n/**\n * Generated by scripts/generate-street-graph.ts from a live OSM Overpass\n * extract. This file IS the source of truth once generated (same convention\n * as the rest of src/data/ijtema/*) — re-run the generator script to refresh\n * it if roads near the venue change; do not hand-edit the arrays here.\n * Columnar shape (see streetGraphTypes.ts) to keep this file compact.\n *\n * Generated: ${data.metadata.generatedAt}\n * Source: Overpass API, ${data.metadata.radiusM}m radius around (${data.metadata.centerLat}, ${data.metadata.centerLng})\n * Raw: ${data.metadata.rawNodeCount} nodes / ${data.metadata.rawEdgeCount} edges -> Simplified: ${data.metadata.simplifiedNodeCount} nodes / ${data.metadata.simplifiedEdgeCount} edges\n */\n\nimport type { StreetGraphData } from './streetGraphTypes';\n\n`;

  const body = `export const IJTEMA_STREET_GRAPH_DATA: StreetGraphData = ${JSON.stringify(data)};\n`;

  writeFileSync('src/data/ijtema/streetGraph.ts', header + body, 'utf-8');
}

main().catch((error) => {
  console.error('generate-street-graph.ts failed:', error);
  process.exitCode = 1;
});
