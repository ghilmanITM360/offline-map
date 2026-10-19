// TEST-ONLY synthetic venue (not a supported second venue). Deliberately unlike Ijtema: different venue ID,
// opaque place/node IDs, 6 nodes, a one-way edge, an unreachable island, and a weightMultiplier.
import type { VenueDataSource, VenueEdge, VenueNode } from '../../packages/offline-navigation/src/domain/venue';

export const SYNTH_NODES: Record<string, VenueNode> = {
  'n/1': { id: 'n/1', coordinate: { lat: 38.7000, lng: -9.1400 } },
  'n/2': { id: 'n/2', coordinate: { lat: 38.7005, lng: -9.1400 } },
  'n/3': { id: 'n/3', coordinate: { lat: 38.7005, lng: -9.1393 } },
  'n/4': { id: 'n/4', coordinate: { lat: 38.7000, lng: -9.1393 } },
  'n/5': { id: 'n/5', coordinate: { lat: 38.7010, lng: -9.1400 } },
  'island': { id: 'island', coordinate: { lat: 38.7100, lng: -9.1500 } },
};
// 1->2 (56m), 2->3 (61m), 1->4 (61m, x3 multiplier = 183), 4->3 (56m), 3->5 one-way, 5 is a dead end.
export const SYNTH_EDGES: Record<string, VenueEdge[]> = {
  'n/1': [{ to: 'n/2', distanceM: 56 }, { to: 'n/4', distanceM: 61, weightMultiplier: 3 }],
  'n/2': [{ to: 'n/1', distanceM: 56 }, { to: 'n/3', distanceM: 61 }],
  'n/3': [{ to: 'n/2', distanceM: 61 }, { to: 'n/4', distanceM: 56 }, { to: 'n/5', distanceM: 120 }],
  'n/4': [{ to: 'n/3', distanceM: 56 }],
  'n/5': [],
  'island': [],
};

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export const createSyntheticVenue = (
  nodes: Record<string, VenueNode> = SYNTH_NODES,
  edges: Record<string, VenueEdge[]> = SYNTH_EDGES,
): VenueDataSource => ({
  venueId: 'synthetic-test-venue',
  dataVersion: 'test-0',
  graph: {
    nodeIds: () => Object.keys(nodes),
    getNode: (id) => (own(nodes, id) ? nodes[id] : undefined),
    edgesFrom: (id) => (own(edges, id) ? edges[id] : []),
  },
  placeIds: () => ['lobby', 'annex'],
  getPlace: (id) =>
    id === 'lobby' ? { id, kind: 'hall', nodeIds: ['n/1'] } :
    id === 'annex' ? { id, kind: 'hall', nodeIds: ['n/5', 'n/3'] } : undefined,
});
