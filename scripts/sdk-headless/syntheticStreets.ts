// B3c: two small, deliberately different street graphs for exercising the real extracted street routing.
// Each graph is built from frozen inputs into its own closure; nothing is shared or cached across graphs.
import { SpatialGrid } from '../../packages/offline-navigation/src/domain/geo/SpatialGrid';
import type { StreetConnector, StreetEdge, StreetNode, StreetRoutingGraph } from '../../packages/offline-navigation/src/domain/street';

interface Way { from: string; to: string; distanceM: number; oneWay?: boolean; geometry?: { lat: number; lng: number }[]; name?: string }

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Returns the graph plus how often each accessor was hit, to prove which graph a calculation actually read. */
export const createSyntheticStreetGraph = (spec: { nodes: StreetNode[]; ways: Way[]; connectors: Record<string, StreetConnector> }) => {
  const input = deepFreeze(spec);
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, StreetEdge[]>();
  const add = (from: string, edge: StreetEdge) => adjacency.set(from, [...(adjacency.get(from) ?? []), deepFreeze(edge)]);
  for (const w of input.ways) {
    add(w.from, { to: w.to, distanceM: w.distanceM, geometry: w.geometry, name: w.name });
    if (!w.oneWay) add(w.to, { to: w.from, distanceM: w.distanceM, geometry: w.geometry && [...w.geometry].reverse(), name: w.name });
  }
  const index = new SpatialGrid(input.nodes);
  const reads = { edgesFrom: 0 };
  const graph: StreetRoutingGraph = {
    getNode: (id) => nodes.get(id),
    edgesFrom: (id) => { reads.edgesFrom++; return adjacency.get(id) ?? []; },
    nearestNode: (p) => {
      const hit = index.nearest(p.lat, p.lng);
      return hit && { node: nodes.get(hit.point.id)!, distanceM: hit.distanceM };
    },
    connectorFor: (placeId) => (Object.prototype.hasOwnProperty.call(input.connectors, placeId) ? input.connectors[placeId] : undefined),
  };
  return { graph, reads, input };
};

// Graph A: a1 - x - a3 two-way (300 m), plus a one-way detour a1 -> a4 -> a3 (400 m); a9 is an island.
export const streetGraphA = () => createSyntheticStreetGraph({
  nodes: [
    { id: 'a1', lat: 0, lng: 0 }, { id: 'x', lat: 0, lng: 0.001 }, { id: 'a3', lat: 0, lng: 0.002 },
    { id: 'a4', lat: 0.001, lng: 0.001 }, { id: 'a9', lat: 0.01, lng: 0.01 },
  ],
  ways: [
    { from: 'a1', to: 'x', distanceM: 150, name: 'Alpha Rd' },
    { from: 'x', to: 'a3', distanceM: 150, geometry: [{ lat: 0.0001, lng: 0.0015 }] },
    { from: 'a1', to: 'a4', distanceM: 200, oneWay: true },
    { from: 'a4', to: 'a3', distanceM: 200, oneWay: true },
  ],
  connectors: { P: { nodeId: 'a3', distanceM: 10 }, Q: { nodeId: 'a4', distanceM: 5 }, Lost: { nodeId: 'a9', distanceM: 1 } },
});

// Graph B: same node id 'x' but elsewhere and wired differently; x -> b2 is one-way.
export const streetGraphB = () => createSyntheticStreetGraph({
  nodes: [{ id: 'x', lat: 1, lng: 1 }, { id: 'b2', lat: 1, lng: 1.001 }, { id: 'b3', lat: 1.001, lng: 1 }],
  ways: [
    { from: 'x', to: 'b2', distanceM: 500, oneWay: true },
    { from: 'x', to: 'b3', distanceM: 120 },
  ],
  connectors: { P: { nodeId: 'b2', distanceM: 7 }, R: { nodeId: 'b3', distanceM: 3 } },
});
