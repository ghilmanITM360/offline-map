import type { VenueCoordinate, VenueDataSource, VenueNode } from '@muslim-ummah/offline-navigation';

// SYNTHETIC demo venue: four corridor nodes and one turn. It is placed inside the bundled Karachi basemap only so the
// map has something to draw under it; it is not a surveyed place and follows no real path. A real app supplies its own
// surveyed VenueDataSource; the SDK ships none.
const ORIGIN = { lat: 24.97, lng: 67.005 };
const M_LAT = 1 / 111_320; // degrees per metre
const M_LNG = M_LAT / Math.cos((ORIGIN.lat * Math.PI) / 180);
const at = (northM: number, eastM: number): VenueCoordinate => ({ lat: ORIGIN.lat + northM * M_LAT, lng: ORIGIN.lng + eastM * M_LNG });

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

/** Where the map starts before there is a route: the middle of the venue. */
export const DEMO_CENTER: VenueCoordinate = at(30, 70);

/** Names are the host's: the SDK knows only ids. */
export const describeDemoPlace = (place: { id: string }) => ({
  title: place.id.charAt(0).toUpperCase() + place.id.slice(1),
  subtitle: 'Synthetic demo venue',
});
