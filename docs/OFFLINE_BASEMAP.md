# Offline basemap (#140)

The Ijtema app ships its own visual map. It renders with **no network** and needs **no Download Map step**.
Renderer decision: [ADR 0001](adr/0001-offline-visual-map-renderer.md).

## What is bundled

| Item | Value (see `assets/offline-map/BASEMAP_PROVENANCE.json` for the authoritative record) |
|---|---|
| Archive | `assets/offline-map/ijtema-basemap.pmtiles` — PMTiles v3, MVT (vector), gzip |
| Source | OpenStreetMap **data** snapshot `data/offline-map/ijtema-osm-extract.osm.pbf` (Overpass API, timestamp in `EXTRACT_PROVENANCE.json`) |
| Licence | ODbL 1.0 — attribution **© OpenStreetMap contributors** |
| Bounds | lat 24.943–25.000, lon 66.976–67.037 (covers the whole bundled street graph; the venue is ≈1.4 × 1.8 km inside it) |
| Zoom | z12–z16 stored; the renderer overzooms for navigation (~z18) |
| Layers | roads (major z12, minor z14, paths z15), landuse z13, water z12, buildings z15, places z14 |

Never derived from `tile.openstreetmap.org` / `vector.openstreetmap.org` (bulk tile prefetch is prohibited by the OSM Foundation) nor from Google data.
`npm run test:offline-basemap` enforces this, plus archive checksum/size, PMTiles header, venue coverage and a 5 MiB size budget.

## Rebuild

Tools (dev machine only, not CI): `brew install osmium-tool tippecanoe pmtiles`.

```bash
node scripts/offline-map/fetch-osm-extract.mjs   # only to refresh the snapshot (network, polite single query)
node scripts/offline-map/build-basemap.mjs       # offline, deterministic content from the committed snapshot
npm run test:offline-basemap
```

The archive is reproducible in content, not bit-for-bit (tippecanoe/pmtiles embed build metadata), so the committed file and its recorded SHA-256 are the source of truth.

## Size control

Archive size is recorded in provenance and capped at 5 MiB by the test. Grow bounds, zoom range or layers only with a stated need; each layer's reason is in `build-basemap.mjs`.
Baseline APK (all ABIs, before MapLibre): 87,972,032 bytes. Total APK impact is reported in the renderer-migration PR.
