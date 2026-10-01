# Data, GIS, and Field Requirements

## Source of truth

Venue entities are maintained as TypeScript under `src/data/ijtema/*`. The outside street graph is the exception: `scripts/generate-street-graph.ts` generates the committed `streetGraph.ts` from Overpass. No general GeoJSON/Excel importer or runtime data-update pipeline exists. Owner authoring/versioning decisions remain #133; do not infer an admin workflow from the street generator.

## Coordinate shapes

Two different shapes coexist by design (see `docs/ARCHITECTURE.md` for why v1/v2 stay separate):
- v1 (`src/constants/data.ts`): `{ lat, lng }`
- v2/UI boundary (`src/data/ijtema/*` and components): `{ latitude, longitude }`

Do not assume one shape when reading unfamiliar code — check which system the file belongs to first.

## Street graph

The committed graph identifies its source as `osm_overpass`, generated on
2026-09-17T21:21:01.400Z from a 3,000 m radius around
`24.971698, 67.006464`. Its recorded counts are 13,014 raw nodes / 17,069
raw edges, simplified to 7,952 nodes / 11,987 edges. These are metadata
for this committed extract, not a fresh survey or an assertion that every gate
is eligible for internal routing.

### OSM provenance, licensing and tile policy (#125)

The reproducible extraction method is in `scripts/generate-street-graph.ts`:
POST `https://overpass-api.de/api/interpreter`, selecting `highway` ways within
the radius, their referenced nodes and geometry (`out body geom`). The
pedestrian profile filters access/construction, preserves directional rules,
simplifies the graph and emits columnar TypeScript. This is vector data
extraction, not raster tile scraping. No public `tile.openstreetmap.org`
requests are made by this generator. `OfflineMapService` has no hardcoded/default
public OSM tile endpoint; its tile source is configured through
`EXPO_PUBLIC_TILE_BASE_URL`, so any future configured source must be checked
separately. These source facts do not certify unrelated historical/manual downloads.

OSM-derived database content is © OpenStreetMap contributors, licensed under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Application/generator code licensing does not replace the OSM data license;
the Apache header on generated TypeScript is not permission to relicense the
underlying database. Keep attribution and ODbL notice with redistributed data,
including future SDK packaging. See [OSM copyright and attribution](https://www.openstreetmap.org/copyright).
Existing `OsmAttribution` displays “© OpenStreetMap contributors · ODbL” and
links to that page when OSM routes/local tiles are shown; Claude owns any layout
or visibility acceptance. This documentation makes no runtime visibility claim.

The [OSMF public tile policy](https://operations.osmfoundation.org/policies/tiles/)
prohibits bulk/offline prefetch from its standard raster tile service. This
restriction is distinct from use of licensed vector OSM extracts. Any future
visual-map strategy under #140 must choose an explicitly permitted provider or
self-hosted/bundled source before enabling downloads. #141 remains blocked.

Refresh only as an explicit data change, never during app builds:

```bash
node --import tsx scripts/generate-street-graph.ts
npm run test:street-graph-v2
npm run test:street-graph-direction
npm run test:v2-structural-validation
npm run test:osm-attribution
```

The generator writes `src/data/ijtema/streetGraph.ts`; review its diff and metadata,
run required routing regressions, commit the reviewed artifact and retain its Git
commit/checksum as the release provenance. Live Overpass changes over time;
original raw response is not archived, so rerunning cannot promise byte-identical
historical reconstruction. A Git checkout reproduces the exact committed artifact.
Rollback is selecting a previously validated commit/artifact, not regenerating
from current Overpass. Do not fabricate Gate18/19 or Mimbar survey data.

## Editing procedures

Adding or changing a block/gate/rasta requires editing the corresponding `src/data/ijtema/*.ts` file plus the matching v1 constant if rollback parity matters, and running the routing/gate test suite (`npm run test:all-gates-v2`, `npm run test:core-provider-routing-contract-v2`) before merging — see `AGENTS.md` for the full required-validation list.

## Not built (do not assume it exists)

A general venue-data authoring/import pipeline (GeoJSON/Excel → validated versioned output) is not implemented. The existing Overpass street-graph generator is narrower and must not be represented as that proposed workflow.

## Field verification status

Gate connector geometry for two gates has not been field-surveyed (#43, #44) and must not be assumed routable from map data alone. Location-capability runtime behavior across the full LOC-01..12 matrix has been emulator-verified only for LOC-01..05, 07 (partial), 12; LOC-06/08/09/10/11 (remainder of closed #45, tracked in #46) remain PHYSICAL DEVICE REQUIRED. Do not report GIS or location facts as confirmed beyond what's actually been surveyed or device-tested — see the evidence-level rule in `AGENTS.md`.
