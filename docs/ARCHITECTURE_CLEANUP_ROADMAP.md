# Architecture Cleanup Roadmap

**Status:** Planning document only. Nothing in this file has been executed — no
extraction, no consolidation, no constant changes have been made. This is a
prioritized punch list for future sessions, verified live against the
codebase on 2026-07-18 (branch `codex/ijtema-map-data-v2`).

This document does not replace `docs/MAP_DATA_ARCHITECTURE.md`,
`docs/MAP_DATA_MAINTENANCE.md`, or `docs/ROUTING_GRAPH.md` — read those first
for how the v1/v2 split works. This document is about *internal* code
duplication and file-size problems that exist independently of the v1/v2
split, plus one cross-cutting constants problem that touches both.

---

## 1. HomeScreen.tsx extraction candidates

`src/views/screens/HomeScreen.tsx` is **1927 lines** (verified via `wc -l`,
2026-07-18). The component function itself (`HomeScreen`) runs from line 102
to line 1278; `StyleSheet.create` runs from line 1281 to end of file. Line
ranges below are current as of this pass and will drift — re-verify before
executing any extraction.

The `useHomeViewModel()` destructure (line 180) already pulls the bulk of
derived state and handlers out of the component. The candidates below are
almost entirely **pure render/JSX blocks** consuming that destructured state
— the risk in each case is wiring props through cleanly, not moving logic.
Per project MVVM convention: if an extraction reveals inline derived-state
computation or event-handling logic that isn't already in
`src/viewmodels/HomeViewModel.ts`, that logic belongs in the view model, not
in the new component. Do not let extraction become an excuse to grow a "dumb"
component with its own business logic.

| # | Component | Proposed file | Current line range | Risk | Depends on |
|---|---|---|---|---|---|
| 1 | `SearchHeader` | `src/views/components/home/SearchHeader.tsx` | 835–926 (search bar, results dropdown, recent searches, chip row via `renderChips()` at 420–449) | Low | Pure props: `searchQuery`, `searchResults`, `recentSearches`, `isSearchFocused`, `searchPlaceholder`, `theme`, plus handlers `handleSearch`, `clearSearch`, `handleSearchResultSelect`, `setIsSearchFocused`. All already returned by `useHomeViewModel()`/local hooks — no logic to relocate. |
| 2 | `MapStatusBanners` | `src/views/components/home/MapStatusBanners.tsx` | 928–997 (offline indicator, missing/failed Google Maps key warnings, outside-venue banner, dev-only diagnostics banner, empty-offline-state CTA) | Low | Pure props: `isOffline`, `hasGoogleMapsKey`, `mapLoadFailed`, `showOutsideBanner`, `offlineData.isDownloaded`, animation values (`warningAnim`), plus `__DEV__ && developerModeEnabled && showRouteDiagnostics` gate. The diagnostics text calls `RoutingService.runRouteDiagnostics()` directly (line 985) — this is a v1-only call already inside a dev-only branch; preserve the guard exactly, don't hoist the call above the `__DEV__` check. |
| 3 | `MapControls` | `src/views/components/home/MapControls.tsx` | 999–1082 (right-side layer/compass/zoom cluster, bottom recenter button, dev toggle card) | Low | Pure props/handlers: `openLayerOptions`, `handleCompassReset`, `handleZoomIn/Out`, `handleRecenter`, `settings.keepNorthFixed`, plus dev-only `showGraphNodes`/`showRastaNames`/`showRouteDiagnostics` setters. All handlers already exist in the view model or as local `useCallback`s in HomeScreen — verify each is already view-model-owned before extracting; if any zoom/compass math lives inline in HomeScreen rather than in `HomeViewModel.ts`, move the logic first, then extract the dumb component. |
| 4 | `RoutePreviewCard` | `src/views/components/home/RoutePreviewCard.tsx` | 1084–1115 | Low | Pure props: `activePreviewRoute`, `previewDestination`, `previewRouteSummary`, `settings.distanceUnit`, handlers `handleStartPreviewNavigation`, `handleChangePreviewStart`, `handleClearPreviewRoute`. Self-contained conditional block, single style namespace (`routePreviewCard*`). |
| 5 | `PlaceDetailSheet` | `src/views/components/home/PlaceDetailSheet.tsx` | 1117–1275 (`BottomSheet` + `BottomSheetScrollView` content: place header, info chips, entrance list, Member Masjid gate chips, directions/save/share actions) | Medium | Pure props but a *large* prop surface: `selectedPlace`, `walkingTimeMin`, `entryPoints`, `blockGates`, `selectedEntryIdx`, `isFav`, plus handlers `handlePlaceSelect`, `handleOpenDirections`, `handleToggleFav`, and `bottomSheetRef`/`snapPoints` (ref must be forwarded or kept in parent — decide before extracting). Also reaches into legacy `IJTEMA_DATA.blocks`/`IJTEMA_DATA.nodes` directly (lines 1135–1136, 1211) — this is v1-only fallback logic for `sourceVersion !== 'v2'` places; keep it, but it means this component is not purely v2-clean and needs both `IJTEMA_DATA` and v2 place shape awareness. |
| 6 | `DevDebugPanel` | `src/views/components/home/DevDebugPanel.tsx` | **Scattered, not contiguous** — diagnostics banner text (974–988, overlaps candidate #2), debug toggle card (1068–1080, subset of candidate #3), dev-only map markers/labels inside the map tree (473, 670–685, 730–745, 745–768), dev gate-id text in the bottom sheet (1215) | Medium | Because this is scattered across `__DEV__ && developerModeEnabled` guards in at least 5 separate places rather than one block, "extraction" here is really "introduce a single `DevDebugPanel` render-prop or a `useDevDebugOverlay()` hook that HomeScreen composes in each of those 5 spots" — not a single cut-paste. Do this **after** #2 and #3 land, since it currently straddles both of their line ranges; extracting it first would fight with those extractions. |
| 7 | `RastaLayers` | `src/views/components/home/map-layers/RastaLayers.tsx` | ~510–548 (rasta polylines, focus/selected polyline overlay, label markers) inside the `<MapView>` tree | High | v2 map-layer props from `v2MapLayers.rastas` plus `mapZoomLevel`-driven `focused` boolean and `zIndex` values (2–9, see §3). Sits inside the single `<MapView>` — must not break marker `tracksViewChanges={false}` perf behavior or z-ordering relative to sibling layers. |
| 8 | `BlockMarkers` | `src/views/components/home/map-layers/BlockMarkers.tsx` | ~582–613 (block polygons + fill color by selection/focus state + block label markers) | High | v2 map-layer props from `v2MapLayers.blocks`, `zIndex` 8, selection/focus-driven `fillColor` logic (currently inline JSX conditional, line 585 — arguably view-model territory if it grows past a one-liner). |
| 9 | `GateMarkers` | `src/views/components/home/map-layers/GateMarkers.tsx` | ~615–668 (gate markers with `showFull`/`showCompact`/`showNumber` zoom-dependent label logic, connector polylines) | High | Contains the **zoom-threshold mismatch bug** described in §3 (`showFull` at 16.5, `showCompact` at 14, vs. `MEDIUM_ZOOM=15` elsewhere) — do not extract-and-forget; extracting this component is the natural place to also fix the constant, but that fix is explicitly out of scope for *this* documentation pass. `zIndex` 12–16. |
| 10 | `IjtemaMapView` (the `<MapView>` root + all layers + place/current-location markers) | `src/views/components/home/IjtemaMapView.tsx` | 458–833 (full map: `LocalTile`, v2 rasta/special-route/block/gate layers, dev developer labels, legacy v1 polyline/polygon/graph-node/rasta-name layers, `PlaceMarkers` — selected place, preview destination, current location, preview start) | **Highest — do last** | This is the single `<MapView>` instance straddling both v1 (`IJTEMA_DATA`, `useV2Map` false branch, lines 689–768) and v2 (`v2MapLayers`, lines 505–685) rendering. It owns `mapRef`, camera/region callbacks, `onMapReady`, tile loading, and all zIndex/z-ordering interplay between layers 1–9 above. Splitting it into sub-components (#7–#9) is a prerequisite; splitting the `<MapView>` container itself out of `HomeScreen` requires on-device QA per `docs/PRODUCTION_RUNTIME_QA_PLAN.md` — TypeScript/lint passing is not sufficient evidence of correctness here (marker click targets, z-ordering, tile rendering, and GPU marker recycling are all runtime-only concerns react-native-maps does not surface at compile time). |

**Note on candidate #6 (PlaceMarkers as separate from IjtemaMapView):** the
original audit pass listed `PlaceMarkers` as a distinct candidate from
`IjtemaMapView`. Live inspection shows the four place-related markers
(selected place, preview destination, current location, preview start;
lines ~786–832) are short, terminal leaf markers with no internal layering
complexity of their own — they can be extracted as a `PlaceMarkers`
sub-component of `IjtemaMapView` (row 10) rather than needing their own
top-level roadmap row. Revisit this when row 10 is actually executed.

---

## 2. Duplicate-algorithm consolidation plan

### 2a. Point-in-polygon / venue-containment (`src/utils/GeoUtils.ts`)

Confirmed **four** call sites implementing byte-for-byte-equivalent ray-casting
point-in-polygon, in two coordinate shapes:

| File | Function | Coordinate shape | Visibility |
|---|---|---|---|
| `src/services/RoutingService.ts:51` | `pointInPolygon` (private static) | `{latitude, longitude}` | v1 |
| `src/services/SnapToRoadService.ts:163` | `pointInPolygon` (private static) | `{latitude, longitude}` | v1 |
| `src/data/ijtema/graphBuilder.ts:298` | `pointInPolygon` (module-private) | `{lat, lng}` | v2 |
| `src/services/EntryGateRoutingService.ts:112` | `isPointInPolygon` (module-private) | `{lat, lng}` (imported `V2Coordinate`) | v2 |

Additionally, `isInsideVenue` (bounding-box check against `MAP_BOUNDS`) and
`getBlockContaining` (iterate blocks, call point-in-polygon) are each
duplicated verbatim between `RoutingService.ts` (lines 27–48) and
`SnapToRoadService.ts` (lines 144–161) — same body, same variable names,
clearly copy-pasted.

**Proposal:** `src/utils/GeoUtils.ts` exporting:
- `pointInPolygon(point, polygon)` — pick **`{lat, lng}`** as the canonical
  shape (it's already used by the v2/graph side, which is the "authoritative"
  system per `CLAUDE.md`). v1 call sites (`RoutingService.ts`,
  `SnapToRoadService.ts`) use `{latitude, longitude}` and need a thin adapter
  (`toGeoUtilsCoordinate({latitude, longitude}) => {lat, lng}`) at the call
  site, or GeoUtils exposes an overload accepting either shape via a small
  normalizer — decide at execution time, not in this doc.
- `isInsideVenue(coord, bounds)` — de-duplicate `RoutingService.ts` /
  `SnapToRoadService.ts`.
- `getBlockContaining(coord, blocks)` — de-duplicate `RoutingService.ts` /
  `SnapToRoadService.ts`; note `EntryGateRoutingService.findContainingBlockId`
  (line 175–178) is functionally the v2 equivalent of this and should also
  route through the same `pointInPolygon`.

**New finding not in the original audit — a fourth duplicate, haversine
distance:** `distanceMeters` (great-circle distance in meters) is defined
independently in two v2 files with near-identical bodies:
- `src/data/ijtema/graphBuilder.ts:71` — `export const distanceMeters`, used
  throughout `graphBuilder.ts` and re-exported/imported by
  `RoutingServiceV2.ts` (`import { distanceMeters } from ...` line 16) and
  `EntryGateRoutingService.ts` (line 13).
- `src/data/ijtema/entryPolicy.ts:59` — a **second, private, unexported**
  `distanceMeters` with the same formula (Haversine, `earthRadiusMeters =
  6371000`), differing only in that it computes `c` as an inline
  `2 * Math.atan2(...)` instead of the two-step `a`/`c` split used in
  `graphBuilder.ts` — same output, redundant implementation.

This should fold into the same `GeoUtils.ts` consolidation as
`distanceMeters(from, to)` (canonical `{lat, lng}` shape, matching its
existing v2 callers), with `entryPolicy.ts` switched to import it from
`graphBuilder.ts` or `GeoUtils.ts` instead of reimplementing it. This is a
one-line-body function so the risk of consolidating it is low, but it's real
duplication that was missed in the original audit pass and should be folded
into the same PR as the point-in-polygon work since it touches the same two
files.

Also worth noting for whoever executes this (not a new duplicate, just a
related observation): `graphBuilder.ts` additionally has
`orientation`/`onSegment`/`segmentsIntersect`/`segmentCrossesPolygonInterior`
(lines 311–345+) — a general segment-intersection toolkit used for
edge-crosses-block-polygon validation. No duplicate of this was found
elsewhere in the codebase; it does not need to move into `GeoUtils.ts` in
this pass, but if `GeoUtils.ts` is created, it's a natural future home given
it's polygon/geometry logic of the same flavor.

### 2b. Duplicate Dijkstra (`src/services/GraphPathService.ts`)

Confirmed near-identical single-source shortest-path (Dijkstra over
`IJTEMA_NAVIGATION_GRAPH_V2`, O(V²) linear-scan "find min unvisited" instead
of a priority queue) in:

- `src/services/RoutingServiceV2.ts:276` — `calculateShortestPath(startNodeId,
  destinationNodeId)`, returns full `{nodes, edges, distanceM, costM}` with
  path reconstruction via `previousNode`/`previousEdge` back-pointers.
- `src/services/EntryGateRoutingService.ts:76` — `dijkstraCost(startNodeId,
  destinationNodeId)`, returns only the scalar cost (no path reconstruction,
  no back-pointers), with an early-exit guard for missing nodes that
  `calculateShortestPath` doesn't have (lines 78).

Both operate on the same global `IJTEMA_NAVIGATION_GRAPH_V2.nodes` /
`.adjacency`, both use `edge.distanceM * (edge.weightMultiplier ?? 1)` as the
edge weight, both use the identical "scan `unvisited` set for min distance"
inner loop (this is the O(V²) part — a binary-heap priority queue would be
the natural follow-up optimization once consolidated, though that's a
separate, larger change and not part of this consolidation).

**Proposal:** `src/services/GraphPathService.ts` exporting a single
`dijkstra(graph, startNodeId, destinationNodeId, { needsPath: boolean })` (or
two thin wrappers — `shortestPathCost` and `shortestPath`, both delegating to
one internal implementation) parameterized over the graph object so it isn't
hard-coded to the module-level `IJTEMA_NAVIGATION_GRAPH_V2` import (useful
for testability and in case a future graph variant needs the same
algorithm). `RoutingServiceV2.calculateShortestPath` and
`EntryGateRoutingService.dijkstraCost` both become thin callers. Preserve
`EntryGateRoutingService`'s missing-node guard (line 78) in the shared
implementation — `RoutingServiceV2`'s version doesn't currently guard against
it and should probably gain that safety for free.

---

## 3. Constants consolidation (`src/constants/MapLayerConstants.ts`)

Zoom-level thresholds are defined **independently in three places**, verified
live:

| File | Constant | Value |
|---|---|---|
| `src/services/V2MapRenderingService.ts:90-93` | `LOW_ZOOM` / `MEDIUM_ZOOM` / `HIGH_ZOOM` / `DEFAULT_ZOOM` | `13` / `15` / `16.5` / `15` |
| `src/viewmodels/HomeViewModel.ts:23` | `DEFAULT_HOME_MAP_ZOOM` | `15.5` |
| `src/views/screens/HomeScreen.tsx:615-616` | inline `showFull`/`showCompact` thresholds | `16.5` / `14` |

**Confirmed known-bug (flagging only, not fixing in this pass):**
`HomeScreen.tsx:616` — `const showCompact = !showFull && mapZoomLevel >= 14;`
— uses a hardcoded `14` where the semantically equivalent constant elsewhere
in the codebase is `MEDIUM_ZOOM = 15` (`V2MapRenderingService.ts:91`). This
means gate labels switch from "full" to "compact" to "number-only" on a
different zoom schedule than blocks/rastas/special-routes switch their own
detail level (which key off `MEDIUM_ZOOM`/`LOW_ZOOM` in
`V2MapRenderingService.pickByZoom`). Whether `14` or `15` is "correct" needs a
product/design decision (on-device QA per
`docs/PRODUCTION_RUNTIME_QA_PLAN.md`, not a code-only fix) — this doc is
flagging the inconsistency as a real, user-visible bug candidate (gate label
density flips at a different zoom level than everything else on the map),
not a style nit. **Do not silently "fix" this by picking one value during
constants consolidation** — surface it as a decision point, since changing
gate label density thresholds is a visual/UX change that needs the same
on-device QA gate as any other map-rendering change.

Also independently defined: `DEFAULT_HOME_MAP_ZOOM = 15.5` in
`HomeViewModel.ts` doesn't match `DEFAULT_ZOOM = 15` in
`V2MapRenderingService.ts` — both are "default zoom" concepts but for
different purposes (initial camera zoom vs. default zoom used when
`pickByZoom` is called without an explicit `zoomLevel`), so this may not be a
bug so much as two constants that happen to be named similarly and drifted —
still worth unifying under one named constant with a comment distinguishing
the two use cases if they're kept distinct on purpose.

### zIndex — two independent numbering scales

Verified live in `HomeScreen.tsx`:

- **Map-layer zIndex** (inside the `<MapView>` JSX tree, lines 502–699):
  range **-1 to 16** — `LocalTile` background at `-1`, venue boundary
  `Polygon` at `0`, rasta polylines `2–9`, special-route polylines `4–11`,
  block polygons/labels `8`, gate markers/connectors `12–16`.
- **UI-overlay zIndex** (in `StyleSheet.create`, lines 1327–1816): range **5
  to 20** — `rightControls`/`bottomControls` at `5`, various card/banner
  styles at `8`, `10`, `11`, `12`, `18`, `20`.

These two scales don't collide in practice because one applies to
`react-native-maps` children (native map layer compositing) and the other to
regular React Native `View`s stacked via CSS-like `zIndex` in the JS overlay
— they're rendered in genuinely different stacking contexts. But there is
**no shared constant or naming convention** between them, and the overlap in
raw numbers (both scales use `8`, `10`, `12`) makes it easy for a future
change to assume they interact when they don't, or to accidentally pick a
value that means something different in the sibling scale. Consolidating
them under one file with two clearly separated exports
(`MAP_LAYER_Z_INDEX.*` and `UI_OVERLAY_Z_INDEX.*`) would remove the ambiguity
without changing any actual value.

**Proposal:** `src/constants/MapLayerConstants.ts` exporting:
- `ZOOM_THRESHOLDS = { LOW: 13, MEDIUM: 15, HIGH: 16.5, DEFAULT: 15 }` (names
  TBD at execution time — could keep existing names as re-exports for
  minimal call-site churn).
- `HOME_MAP_DEFAULT_ZOOM = 15.5` (or unify with `ZOOM_THRESHOLDS.DEFAULT` if
  the product decision in the flagged bug above concludes they should be the
  same value).
- `MAP_LAYER_Z_INDEX = { TILE: -1, BOUNDARY: 0, RASTA_BASE: 2, ..., GATE_SELECTED: 16 }`.
- `UI_OVERLAY_Z_INDEX = { CONTROLS: 5, CARD: 10, BANNER: 18, DIAGNOSTICS: 20 }`.

`V2MapRenderingService.ts`, `HomeViewModel.ts`, and `HomeScreen.tsx` (both
inline JSX and `StyleSheet.create`) all become importers instead of each
defining their own copy.

---

## 4. Risk-ranked execution sequencing

Recommended order across future sessions, low-risk/high-value first. Each row
assumes the prior rows are merged and tested (`npm run typecheck`, `npm run
lint`, and the relevant `npm run test:*` scripts per `CLAUDE.md`) before
starting the next.

1. **Constants consolidation minus the bug fix** (§3) — create
   `MapLayerConstants.ts`, migrate `V2MapRenderingService.ts` and
   `HomeViewModel.ts` to import from it, leave `HomeScreen.tsx`'s
   `showFull`/`showCompact` inline `16.5`/`14` as-is (or migrate to imported
   constants that *preserve* the current `14` value rather than silently
   changing it to `15`). Lowest risk: pure rename/re-export, no behavior
   change if done carefully. Run `npm run typecheck` + `npm run lint`.
2. **GeoUtils.ts consolidation** (§2a) — `pointInPolygon`, `isInsideVenue`,
   `getBlockContaining`, `distanceMeters`. Low-medium risk: pure functions,
   easy to unit-test in isolation via existing `scripts/test-map-data-v2.ts`
   / `scripts/test-navigation-graph-v2.ts` style scripts, but touches four
   call sites across v1 and v2 services simultaneously, so regressions would
   show up in `npm run test:routing`, `npm run test:entry-gate-routing`,
   `npm run test:map-data-v2`. Do this before GraphPathService since the two
   Dijkstra implementations both indirectly depend on correct
   containment/distance semantics and you want one axis of change at a time.
3. **GraphPathService.ts consolidation** (§2b) — shared Dijkstra. Medium
   risk: both call sites are on the hot path for route calculation
   (`RoutingServiceV2` for Directions/Navigation, `EntryGateRoutingService`
   for outside-venue gate selection) — a subtle bug here silently produces
   wrong routes rather than a crash. Run `npm run test:route-smoke-v2`, `npm
   run test:entry-gate-routing`, `npm run test:navigation-graph-v2` at
   minimum; per `CLAUDE.md` these are already the required gate for any v2
   routing change.
4. **Resolve the zoom-threshold bug flagged in §3** as its own deliberate,
   product-reviewed change (not bundled into the constants file creation) —
   decide whether gate-label density should key off `14` or `15`, update
   `HomeScreen.tsx`, and treat it as a visual change requiring on-device QA
   per `docs/PRODUCTION_RUNTIME_QA_PLAN.md`, not just a typecheck-and-ship.
5. **HomeScreen.tsx extraction, rows 1–4 in §1 table** (`SearchHeader`,
   `MapStatusBanners`, `MapControls`, `RoutePreviewCard`) — low risk, pure
   props, no map-layer interaction, mechanical extraction with prop-drilling
   from the existing view model. Good candidates to parallelize across
   separate small PRs since they don't overlap in the JSX tree once #6's
   scattering issue is understood.
6. **`PlaceDetailSheet` extraction** (row 5) — medium risk, largest pure-prop
   surface, mixed v1/v2 fallback logic to preserve carefully.
7. **`DevDebugPanel` consolidation** (row 6) — medium risk, mechanically
   different from the others since it's scattered rather than contiguous;
   do this only after rows 5 and above 3 (MapControls) have landed so the
   diagnostics-banner and debug-toggle-card pieces it depends on aren't
   mid-refactor.
8. **Map-layer extraction: `RastaLayers`, `BlockMarkers`, `GateMarkers`**
   (rows 7–9) — high risk, each is a `<MapView>` child with zoom-dependent
   rendering and shared `zIndex` ordering constants (from step 1). Do these
   one at a time, each behind its own on-device visual check (marker
   density, label switching at zoom thresholds, tap targets) even though
   TypeScript/lint will pass — per `CLAUDE.md`'s "Runtime status" section,
   passing local gates does not mean Android visual QA has passed.
9. **`IjtemaMapView` extraction (the `<MapView>` root itself)** (row 10) —
   **do this last, in its own dedicated session with a full on-device QA
   pass** per `docs/PRODUCTION_RUNTIME_QA_PLAN.md` (and
   `docs/V2_ANDROID_RUNTIME_QA_CHECKLIST.md` /
   `docs/ANDROID_DEVICE_QA_CHECKLIST.md` for the existing checklist format).
   This sits directly on the v1/v2 rendering boundary (`useV2Map` branch),
   owns the map ref and camera lifecycle, and is the one place where a
   silent regression (marker z-ordering, tile load timing, GPS blue-dot
   snap) would not be caught by any existing `npm run test:*` script — those
   are all pure-logic/data scripts per `CLAUDE.md`, none of them render an
   actual `MapView`.

Steps 1–4 are pure logic/constants and can be validated with the existing
`npm test` script suite. Steps 5–7 are prop-plumbing and can be validated
with `npm run typecheck` + `npm run lint` plus a quick manual smoke check.
Steps 8–9 require the on-device QA process — do not merge those two based on
script/typecheck results alone.
