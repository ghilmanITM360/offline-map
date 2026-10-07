# Offline Map and Data

The Ijtema app ships its own visual map and its own venue data. Both work with **no network** and there is no map-download step (a tile-download feature does not exist in the product; the earlier WIP is preserved only in draft PR #178). This doc covers the bundled basemap (#140), the venue data and its maintenance workflow (#133), OSM provenance/licensing, and the field-survey gaps. Statements are SOURCE level unless an evidence label says otherwise.

Renderer decision: [ADR 0001](adr/0001-offline-visual-map-renderer.md) (MapLibre Native on a bundled PMTiles vector archive; implemented, with the Google Maps SDK and `react-native-maps` removed). The map has no Google SDK and no key; Google appears in this project only as the optional walking-routes proxy provider ([`NAVIGATION_AND_ROUTING.md`](NAVIGATION_AND_ROUTING.md)).

## Basemap

### What is bundled

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

### Install and integrity (#306)

MapLibre opens `pmtiles://file://...` but not `pmtiles://asset://...`, so the archive is copied from the APK into app-private storage as `map/ijtema-basemap-<sha12>.pmtiles` (`BundledBasemap.ts`, `BundledBasemapService.ts`). `App` starts the install at app launch in parallel with Splash; Home awaits the same single-flight promise and shows a plain land-coloured placeholder until it resolves. Nothing waits on it before the Directory.

Trust is by **content, not size**. The manifest (`BASEMAP_PROVENANCE.json`) records the SHA-256 and byte length:

| Situation | Result |
|---|---|
| Copy valid (size and SHA-256 match) | Reused; a stale `.partial` is discarded; older-version archives are pruned |
| Copy missing | Copied from the bundled asset to `.partial`, size- and SHA-256-checked, then moved into place |
| Wrong size, or same size with different bytes | Removed and reinstalled from the bundle |
| Unreadable copy | Treated as invalid and reinstalled |
| Interrupted or failed copy | The `.partial` is removed; nothing incomplete is ever promoted; the next attempt starts clean |
| Bundled asset itself bad | The install throws; the map shows a plain canvas with the venue overlays (no crash, no download prompt) |
| New app version with a new archive | New file name; the old archive is deleted only after the new one is in place |

The hash is computed once per install call (so once per app start; pure-JS SHA-256 of the ~0.4 MB archive, a few tens of milliseconds in Node), never per render. There is no network recovery: the APK asset is the only source.

### Rebuild

Tools (dev machine only, not CI): `brew install osmium-tool tippecanoe pmtiles`.

```bash
node scripts/offline-map/fetch-osm-extract.mjs   # only to refresh the snapshot (network, polite single query)
node scripts/offline-map/build-basemap.mjs       # offline, deterministic content from the committed snapshot
npm run test:offline-basemap
```

The archive is reproducible in content, not bit-for-bit (tippecanoe/pmtiles embed build metadata), so the committed file and its recorded SHA-256 are the source of truth.

### Size control

Archive size is recorded in provenance and capped at 5 MiB by the test. Grow bounds, zoom range or layers only with a stated need; each layer's reason is in `build-basemap.mjs`.
Baseline APK (all ABIs, before MapLibre): 87,972,032 bytes. Total APK impact is reported in the renderer-migration PR.

### Map design system

The venue overlay is styled from one token set, so the map reads the same everywhere and a restyle is a token change, not a hunt through layers.

- **Priority** — `MAP_VISUAL_PRIORITY` in `src/views/components/mapgl/mapDesign.ts` lists what must win visually: user, active route, destination, start, blocks, gates, major walking routes, secondary routes, special route (Shahr-e-Pindal), facilities, surroundings. Layer order and widths follow it (`MAP_LINE_WIDTH`, `MAP_COLORS`); static paths are always lighter than the active route.
- **Special route** — dashed (`SPECIAL_ROUTE_DASH`), solid only when selected, so it never reads as the active route.
- **Markers** — destination/start pins, the heading cone and eight facility badges are PNGs generated from Lucide glyphs by `scripts/offline-map/build-marker-images.mjs` (tokens in `src/theme/mapMarkerTokens.json`, output `markerImages.generated.ts`, ~51 KB). They are bundled in JS; no sprite URL and no network.
- **Image load order** — the core images register with the map; facility badges mount only after `onDidFinishLoadingMap`, because every image registered up front delays map-ready (16 images ≈ 1.7 s on the emulator).
- **Surface** — the map renders on a `TextureView` (`androidView="texture"`). With the default `SurfaceView` roughly one in five fresh-install offline launches came up blank or lost a late data update; with `TextureView` 8/8 emulator runs rendered (EMULATOR level, release build, airplane mode).
- **Taps** — map features are layers, not TalkBack nodes. The Directory is the accessible place chooser.

### Destination focus

- **Priority** — active navigation or route > destination > a live fix (venue overview plus the user marker; the map does not zoom onto the dot) > the Block 2 anchor with a notice. A persisted last-known location never moves the camera by itself. A destination handed off by the Directory invalidates the launch camera (`invalidateStartupCameraIntent`), and a pending hand-off at mount is the map's *initial* region, so the first painted frame is the destination, never the venue overview.
- **Motion** — a place focus eases 600 ms (350 ms when the target is within 80 m of the last focus); it jumps (0 ms) under OS reduce-motion and whenever the map is not ready yet (nobody can watch an ease on an unpainted map). The Directory hand-off jumps while the Directory is still closing and the focus-time selection then does not animate again. A user gesture still cancels the early-replay (`cancelEarlyReplay`).
- **Pulse** — one outward ring per destination (`useDestinationPulse`): hold 400 ms while the camera settles, then a native 800 ms paint transition (`destination-pulse` layer), then idle. Reduced motion: a static ring.
- **Label** — the selected label hangs below the pin tip (`hangSelectedLabelsBelowPin`).

### Route reveal and live progress

- **Reveal** — a preview route draws start → destination over 750 ms (`ROUTE_REVEAL_MS`, 600–900 ms target). It is presentation only: the route spec carries `reveal: {key, from, to}` (outside leg first, then inside, split by length) and `OverlayScene` runs one local timer (`useRouteReveal`, ~30 fps) that slices the line features (`revealSpecData`). Routing readiness, Start Navigation and Home's render do not wait on it. The same route geometry never replays (`routeRevealKey`); a new start or destination does. OS reduce-motion, or live progress, draws the whole route at once.
- **Progress** — during active navigation the walked part is thinner (`walkedRoute` 4.5) and faint, the remaining part keeps the full active-route weight (7 over an 11 casing). Both are layers of one source updated in place from real route progress; nothing is recreated per GPS tick.

### Reroute and arrival motion

- **Reroute** — when an accepted reroute REPLACES the navigation route (`useRerouteRevealKey`: the route a trip starts with never reveals, each replacement does), the new route reveals start → destination (same 750 ms timeline as the preview) and the old one stays as a ghost line (`<id>-ghost`, mounted last so it never reorders the scene) that fades out over 300 ms with a native opacity transition, then is removed. Two equally active routes are never on screen: the ghost is at 45% opacity and fading. The camera is not recentred by the reroute.
- **Arrival** — the existing `arrived` latch (set once per trip, reset when navigation starts) drives ARRIVAL mode; the destination ring (`useDestinationPulse` keyed on the route) plays once while in that mode, then rests, so GPS noise cannot replay it. Reduced motion shows the static ring.
- Both apply to the v2 scene and to the legacy v1 scene used for facility destinations.

## Attribution and licensing (OSM)

All OSM-derived content (the basemap archive and the street graph) is © OpenStreetMap contributors under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); the Apache header on generated TypeScript is not permission to relicense the underlying database. Keep attribution and the ODbL notice with any redistributed data, including a future SDK package. See [OSM copyright](https://www.openstreetmap.org/copyright).

In the app (SOURCE; visibility on a device is PHYSICAL DEVICE REQUIRED):

- The basemap style carries `© OpenStreetMap contributors` (`BASEMAP_ATTRIBUTION`) and the map's own attribution control shows it, positioned bottom-left and kept clear of sheets and the navigation bar.
- `OsmAttribution` ("© OpenStreetMap contributors · ODbL", linking to the OSM copyright page) additionally shows while the displayed route came from the bundled OSM street graph.
- About shows "Map data © OpenStreetMap contributors".

The [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/) prohibits bulk/offline prefetch from `tile.openstreetmap.org`. Nothing in this project does that: the archive is built from an OSM **data** extract, never from the standard tile servers, and nothing is derived from Google data. Privacy/Terms text is owner-provided and unwritten (see `KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`).

## Venue data (v2)

Venue entities are TypeScript under `src/data/ijtema/*`; the repository is the only authoring surface (no admin backend, spreadsheet or GIS tool, and no runtime data-update pipeline).

| Data | Files | Kind |
|---|---|---|
| Gates, blocks, rastas, special routes, central points, perimeter connectors, bounds, entry policy, data issues (ids, names/aliases, coordinates, status) | `src/data/ijtema/{gates,gateMeta,blocks,rastas,specialRoutes,centralPoints,perimeterConnectors,mapBounds,entryPolicy,dataIssues}.ts` | **human-edited, canonical** |
| Outside street graph (OSM, columnar) | `src/data/ijtema/streetGraph.ts` | **generated** by `scripts/generate-street-graph.ts` (+ `pedestrianProfile.ts`), committed |
| Venue route graph, connector reports | `graphBuilder.ts`, `navigationGraph.ts` | **derived** at import time, never edited |
| Checksums + provenance | `src/data/ijtema/DATA_MANIFEST.json` | machine fields generated, `provenance` block human-edited |
| Legacy v1 dataset | `src/constants/data.ts` | see below; do not extend |

Current counts (from `DATA_MANIFEST.json`): 18 gates, 42 blocks, 11 rastas, 3 special routes, 12 central points; street graph 7,952 nodes / 11,987 edges. Two coordinate shapes coexist by design: v1 uses `{ lat, lng }`, v2 and the UI boundary use `{ latitude, longitude }`; check which system a file belongs to before assuming one.

Gate and survey facts come only from confirmed sources. Never invent a coordinate, connector or graph edge.

### Street graph provenance

The committed graph identifies its source as `osm_overpass`, generated 2026-09-17T21:21:01Z from a 3,000 m radius around `24.971698, 67.006464`, pedestrian profile `2026-08-15-v2`: 13,014 raw nodes / 17,069 raw edges simplified to 7,952 nodes / 11,987 edges. These are metadata of the committed extract, not a fresh survey and not an assertion that every gate is eligible for routing. Method: POST `https://overpass-api.de/api/interpreter` selecting `highway` ways within the radius (`out body geom`); the profile filters access/construction, preserves directional rules, simplifies the graph and emits columnar TypeScript. This is vector data extraction, not raster tile scraping. The raw response is not archived, so rerunning cannot reproduce the committed file byte for byte; a checkout reproduces it exactly, and rollback means selecting a previously validated commit.

### Maintenance workflow

1. **Edit source** in one branch: the human-edited file(s) above. For a street-graph refresh run `node --import tsx scripts/generate-street-graph.ts` (live Overpass; only as an explicit data change, never during app builds).
2. **Validate:** `npm run data:check`. It runs the v2 structural validator (unique ids/aliases, finite in-bounds coordinates, names, orphan segment/junction refs, disconnected destinations), supported categories, undocumented near-duplicate points, special-route references, street-graph structure (dangling edges, index ranges, metadata counts, connectors), street and venue graph reachability for verified gates and every block, and manifest drift.
3. **Regenerate the manifest:** `npm run data:manifest`, then edit `provenance` by hand (`dataVersion`, `updatedOn`, `editor`, `note`: who changed what and why).
4. **Test:** `npm test` (includes `test:venue-data-maintenance`, `test:map-data-v2`, `test:street-graph-v2` and the routing suites) and `npm run typecheck`. A street-graph refresh also runs `test:street-graph-direction`, `test:v2-structural-validation` and `test:osm-attribution`; adding or changing a block, gate or rasta also needs `npm run test:all-gates-v2` and `npm run test:core-provider-routing-contract-v2`.
5. **Inspect the diff:** data files, manifest hashes and counts must move together; a data change without a manifest change fails `data:check`.
6. **Commit, push, open a PR.** The reviewer checks the data diff against the survey source and the provenance note; CI repeats the check; rollback is reverting the merge commit.

`data:check` is deterministic (hashes are CRLF-normalised and the manifest build is a pure function of the committed files); only the live Overpass fetch is not, which is why the artifact is committed and hash-pinned rather than regenerated in CI. The current manifest baseline is `baseline-2026-10-05` (checksums of the data as merged; no data content changed).

Not built: non-developer authoring (Excel/GeoJSON import), event/year versioning, a visual editor. The admin-data questionnaire in #133 is superseded by this repo-controlled flow unless the owner asks for more.

## Legacy v1 dataset (#117)

`src/constants/data.ts` (`IJTEMA_DATA`, `LANDMARK_PLACES`) is the original v1 dataset. It is **retained, not deleted**: it is the rollback path behind the V2 feature flags, and it still supplies the facility landmarks drawn on the map (`LM_*` masjids and landmarks), which are routed through the V2 graph via a nearest-node mapping (`V2DirectionsService.destinationFromPlace`). A facility can be a destination but never a start. #117 (retire or reconcile v1) is open; until the owner decides, do not extend or "clean up" v1. Rationale and the one dead function: `KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`.

## Field-required GIS gaps

Never report GIS or location facts as confirmed beyond what has actually been surveyed or device-tested (evidence levels in `AGENTS.md`).

- **Gate 18** (#43): no valid graph connector within 320 m of any internal path; `connectorStatus: ground_truth_required`, not routable from outside, disabled in route selection. FIELD REQUIRED.
- **Gate 19** (#44): status `needs_verification`, field connectivity deferred pending physical ground truth. FIELD REQUIRED.
- **Mimbar** (#116): no record exists anywhere in the project history, so there is no entity, coordinate or connector for it. FIELD REQUIRED survey; must not be fabricated.
- **Gates 12, 13, 14** have owner-confirmed official coordinates (see `NAVIGATION_AND_ROUTING.md`); Gate 13 and 14 were near-duplicates in the originally supplied dataset (recorded in `dataIssues.ts`).
- **Walking acceptance at the venue** (#46) and the physical-device remainder of the location-capability matrix (LOC-06/08/09/10/11) are not run: PHYSICAL DEVICE REQUIRED / FIELD REQUIRED. LOC-01..05, 07 (partial) and 12 were emulator-verified only.
- No walkability or crowd-flow modelling exists (closures, one-way flow on the day); see #136.
