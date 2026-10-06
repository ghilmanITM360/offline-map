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

## Install and integrity (#306)

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

## Map design system (PR F)

The venue overlay is styled from one token set, so the map reads the same everywhere and a restyle is a token change, not a hunt through layers.

- **Priority** — `MAP_VISUAL_PRIORITY` in `src/views/components/mapgl/mapDesign.ts` lists what must win visually: user, active route, destination, start, blocks, gates, major walking routes, secondary routes, special route (Shahr-e-Pindal), facilities, surroundings. Layer order and widths follow it (`MAP_LINE_WIDTH`, `MAP_COLORS`); static paths are always lighter than the active route.
- **Special route** — dashed (`SPECIAL_ROUTE_DASH`), solid only when selected, so it never reads as the active route.
- **Markers** — destination/start pins, the heading cone and eight facility badges are PNGs generated from Lucide glyphs by `scripts/offline-map/build-marker-images.mjs` (tokens in `src/theme/mapMarkerTokens.json`, output `markerImages.generated.ts`, ~51 KB). They are bundled in JS; no sprite URL and no network.
- **Image load order** — the core images register with the map; facility badges mount only after `onDidFinishLoadingMap`, because every image registered up front delays map-ready (16 images ≈ 1.7 s on the emulator).
- **Surface** — the map renders on a `TextureView` (`androidView="texture"`). With the default `SurfaceView` roughly one in five fresh-install offline launches came up blank or lost a late data update; with `TextureView` 8/8 emulator runs rendered (EMULATOR level, release build, airplane mode).
- **Taps** — map features are layers, not TalkBack nodes. The Directory is the accessible place chooser.

## Destination focus (PR G)

- **Priority** — active navigation or route > destination > a live fix (venue overview plus the user marker; the map does not zoom onto the dot) > the Block 2 anchor with a notice. A persisted last-known location never moves the camera by itself. A destination handed off by the Directory invalidates the launch camera (`invalidateStartupCameraIntent`), and a pending hand-off at mount is the map's *initial* region, so the first painted frame is the destination, never the venue overview.
- **Motion** — a place focus eases 600 ms (350 ms when the target is within 80 m of the last focus); it jumps (0 ms) under OS reduce-motion and whenever the map is not ready yet (nobody can watch an ease on an unpainted map). The Directory hand-off jumps while the Directory is still closing and the focus-time selection then does not animate again. A user gesture still cancels the early-replay (`cancelEarlyReplay`).
- **Pulse** — one outward ring per destination (`useDestinationPulse`): hold 400 ms while the camera settles, then a native 800 ms paint transition (`destination-pulse` layer), then idle. Reduced motion: a static ring.
- **Label** — the selected label hangs below the pin tip (`hangSelectedLabelsBelowPin`).

## Route reveal and live progress (PR H)

- **Reveal** — a preview route draws start → destination over 750 ms (`ROUTE_REVEAL_MS`, 600–900 ms target). It is presentation only: the route spec carries `reveal: {key, from, to}` (outside leg first, then inside, split by length) and `OverlayScene` runs one local timer (`useRouteReveal`, ~30 fps) that slices the line features (`revealSpecData`). Routing readiness, Start Navigation and Home's render do not wait on it. The same route geometry never replays (`routeRevealKey`); a new start or destination does. OS reduce-motion, or live progress, draws the whole route at once.
- **Progress** — during active navigation the walked part is thinner (`walkedRoute` 4.5) and faint, the remaining part keeps the full active-route weight (7 over an 11 casing). Both are layers of one source updated in place from real route progress; nothing is recreated per GPS tick.

## Reroute and arrival motion (PR I)

- **Reroute** — when an accepted reroute REPLACES the navigation route (`useRerouteRevealKey`: the route a trip starts with never reveals, each replacement does), the new route reveals start → destination (same 750 ms timeline as the preview) and the old one stays as a ghost line (`<id>-ghost`, mounted last so it never reorders the scene) that fades out over 300 ms with a native opacity transition, then is removed. Two equally active routes are never on screen: the ghost is at 45% opacity and fading. The camera is not recentred by the reroute.
- **Arrival** — the existing `arrived` latch (set once per trip, reset when navigation starts) drives ARRIVAL mode; the destination ring (`useDestinationPulse` keyed on the route) plays once while in that mode, then rests, so GPS noise cannot replay it. Reduced motion shows the static ring.
- Both apply to the v2 scene and to the legacy v1 scene used for facility destinations.
