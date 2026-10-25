import type { VenueCoordinate, VenueDataSource, VenueNode } from '@muslim-ummah/offline-navigation';

// SYNTHETIC demo venue: four corridor nodes, one turn, near (0, 0) in open ocean so it cannot be mistaken for a real
// place. A real app supplies its own surveyed VenueDataSource; the SDK ships none.
const M = 1 / 111_320; // degrees per metre, exact enough at the equator
const at = (northM: number, eastM: number): VenueCoordinate => ({ lat: 0.001 + northM * M, lng: 0.001 + eastM * M });

const NODES: Record<string, VenueNode> = {
  a: { id: 'a', coordinate: at(0, 0) },
  b: { id: 'b', coordinate: at(60, 0) },
  c: { id: 'c', coordinate: at(60, 70) },
  d: { id: 'd', coordinate: at(60, 140) },
};
const EDGES: Record<string, { to: string; distanceM: number }[]> = {
  a: [{ to: 'b', distanceM: 60 }],
  b: [{ to: 'a', distanceM: 60 }, { to: 'c', distanceM: 70 }],
  c: [{ to: 'b', distanceM: 70 }, { to: 'd', distanceM: 70 }],
  d: [{ to: 'c', distanceM: 70 }],
};
const PLACES = { entrance: 'a', courtyard: 'b', hall: 'c', annex: 'd' } as const;

export const demoVenue: VenueDataSource = {
  venueId: 'synthetic-demo-venue',
  dataVersion: 'demo-0',
  graph: {
    nodeIds: () => Object.keys(NODES),
    getNode: (id) => NODES[id],
    edgesFrom: (id) => EDGES[id] ?? [],
  },
  placeIds: () => Object.keys(PLACES),
  getPlace: (id) => (id in PLACES ? { id, kind: 'room', nodeIds: [PLACES[id as keyof typeof PLACES]] } : undefined),
};

/** Names are the host's: the SDK knows only ids. */
export const describeDemoPlace = (place: { id: string }) => ({
  title: place.id.charAt(0).toUpperCase() + place.id.slice(1),
  subtitle: 'Synthetic demo venue',
});
