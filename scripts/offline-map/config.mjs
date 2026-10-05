// Shared constants for the offline basemap pipeline (#140).
// BBOX covers the full bundled street-graph extent (lat 24.9448–24.9986, lon 66.9768–67.0362)
// with a small margin; the Ijtema venue itself (≈1.4 km × 1.8 km) sits well inside it.
export const BBOX = { south: 24.943, west: 66.976, north: 25.0, east: 67.037 };
export const ZOOM = { min: 12, max: 16 };
export const OUT_EXTRACT = 'data/offline-map/ijtema-osm-extract.osm.pbf';
export const EXTRACT_META = 'data/offline-map/EXTRACT_PROVENANCE.json';
export const OUT_ARCHIVE = 'assets/offline-map/ijtema-basemap.pmtiles';
export const OUT_PROVENANCE = 'assets/offline-map/BASEMAP_PROVENANCE.json';
