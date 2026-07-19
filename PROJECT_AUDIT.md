# Project Audit — Karachi Ijtema Offline Navigation App

Senior-engineer source-level audit. Read-only; no code modified. Scope: `src/`, `scripts/`, `docs/`, `ios/`, `android/`, root config. Findings are backed by direct file reads and three parallel deep-dive passes over map/routing, navigation/offline, and testing/tech-debt.

Date: 2026-07-18. Branch: `codex/ijtema-map-data-v2`.

---

## 1. Architecture

MVVM: `views/screens` + `views/components` → `viewmodels` → `services` → `data`/`models`. Single Zustand store (`src/store/useAppStore.ts`, 348 lines) persisted to AsyncStorage via `persist` middleware, with an explicit `partialize` allowlist (offline status, settings, favorites, recent searches, last-known location, dev toggles) — GPS and other transient state correctly excluded. `RootNavigator.tsx` (95 lines) wires GPS and connectivity polling into the store once at app root and defines the stack/drawer topology (Splash → Permission → DownloadMap → Main drawer, plus Directions/Navigation/AppGuide/Error stack screens).

**Defining trait: two complete, parallel map/routing/navigation systems coexist in the same codebase** — v1 (legacy, `src/constants/data.ts`, 922 lines, single hardcoded object, A* routing) and v2 (authoritative, `src/data/ijtema/*`, ~1700 lines across 12 focused files, graph-based routing). Every layer — data model, coordinate shape (`{lat,lng}` vs `{latitude,longitude}`), routing service, place adapter, navigation viewmodel, rendering service — has a v1 and v2 implementation living side by side, selected at runtime by three independent feature flags (`MapFeatureFlagsService.ts`, 29 lines) plus a per-route `sourceVersion: 'v1'|'v2'` tag threaded through `Place`/`RoutePreview`/`V2ActiveRoute`.

This is architecturally sound as a rollback strategy but is a permanent tax: every routing/nav change is a candidate for silent v1/v2 divergence, and there is no compiler-level guarantee that a `Place` without `sourceVersion` doesn't silently fall through to the legacy pipeline (see §4, §9).

Services layer is large (5,333 LOC across 24 files) and mostly single-responsibility, though a few files do multiple jobs (see §3, §5, §8).

---

## 2. Data Flow

```
v1: src/constants/data.ts → SearchService/RoutingService → RoutePointService → RoutePreview → Directions/Navigation screens
v2: src/data/ijtema/* → V2PlaceAdapter/RoutingServiceV2 → V2DirectionsService → V2ActiveRoute → V2NavigationAdapter → NavigationScreen (v2 branch)
```

Both funnel into the same Zustand store slices (`activeRoute`, `routeInstructions`, `selectedPlace`, etc.), typed as unions (`RoutePreview | V2ActiveRoute`) — components branch on `sourceVersion` at render/logic time rather than the type system enforcing it.

Coordinate shape is genuinely two different formats in-repo (`docs/COORDINATE_SYSTEM.md`): v1 `{lat,lng}`, v2 and UI `{latitude,longitude}`. Conversion is manual and scattered across `RoutingService`, `RoutePointService`, `SearchService`, `SnapToRoadService`, and map screens — a documented, accepted source of friction, not a bug, but real ongoing maintenance cost.

Data itself is 100% static TypeScript — no GeoJSON, no generated files, no checksum, no remote config (confirmed, `docs/MAP_DATA_ARCHITECTURE.md`). All 42 blocks, gates, rastas, and special routes are hand-typed literal objects. This means routing/search logic is fully offline-capable by construction (no data fetch involved), but any data edit is a manual, unchecked TypeScript diff with no schema validation beyond what the test scripts assert.

---

## 3. Map Rendering Pipeline

`src/data/ijtema/{blocks,gates,rastas,specialRoutes}.ts` → `V2MapRenderingService.getBaseLayers()` (memoized static caches, `V2MapRenderingService.ts:136-194`) → `getHomeLayers()` (`:226-296`) → `HomeScreen.tsx` `useMemo` (`:254-262`) → JSX (`:513-677`). `MapConfigService`/`MapConfigResolver` are unrelated to this pipeline — they only resolve the platform Google Maps API key.

**Findings:**
- **Duplicated, inconsistent zoom thresholds.** `V2MapRenderingService.ts:90-93` defines `LOW_ZOOM=13, MEDIUM_ZOOM=15, HIGH_ZOOM=16.5` for block/rasta/special-route label switching. Gate marker zoom logic is reimplemented independently in `HomeScreen.tsx:615-618` with its own literals `16.5` and `14` — `14` doesn't match `MEDIUM_ZOOM=15`, so gate labels and block labels switch density at different zoom levels. Easy to miss, easy to make worse when either constant is tuned in isolation.
- **Hardcoded gate allowlist.** `MAJOR_GATE_IDS = new Set(['GATE_05','GATE_08','GATE_13','GATE_21','GATE_22'])` (`V2MapRenderingService.ts:94`) controls which gates always render at low zoom. Silently stale if gates are renumbered or added without updating this set.
- **Manual z-index stacking, no shared constant/enum.** `HomeScreen.tsx:523,529,538,554,561,571,602,625,658,665` — selected rasta outline 8/9, special route 10/11, block label 8, gate marker 12/14/16, route polyline 14/15. Any new layer is a collision risk with no compile-time check.
- **v1 render path still lives inside the same component.** `HomeScreen.tsx` (1,927 lines) contains both v1 (`!useV2Map` branches from line 678) and v2 render logic, plus search, bottom sheet, and developer-mode overlays, all in one file. Justified in part by dual-system support, but a strong split candidate regardless.

---

## 4. Routing Pipeline

- **v1 (`RoutingService.ts`, 533 lines):** real **A\*** (`:323-386`) with a geolib straight-line heuristic, plus a Yen's-style alternative-route generator (comment at `:242-245`), against `src/constants/data.ts`'s node/edge graph.
- **v2 (`RoutingServiceV2.ts`, 524 lines):** `calculateShortestPath` (`:276-340`) and `EntryGateRoutingService.dijkstraCost` (`:76-110`) are both **plain Dijkstra with O(V²) node-scan, no priority queue** — not A*, despite v1 having a working A* implementation next to it. Two near-identical Dijkstra implementations exist in two separate files.
- **Graph construction** (`graphBuilder.ts`, 579 lines): assembles nodes/edges from rastas, perimeter connectors, special routes, central points, gates, and block entries, then auto-generates connector edges via nearest-neighbor search bounded by hardcoded thresholds (`INTERSECTION_THRESHOLD_M=12`, `CENTRAL_CONNECTOR_THRESHOLD_M=18`, `GATE_CONNECTOR_MAX_M=320`, `BLOCK_CONNECTOR_MAX_M=230`, `:35-38`). `addIntersectionConnectors` is O(n²) over all walkable nodes (`:249-250`) — fine at current scale (dozens of nodes), a latent cost if the venue graph grows materially.
- **Point-in-polygon ray-casting is reimplemented four separate times** with no shared utility: `graphBuilder.ts:298`, `EntryGateRoutingService.ts:112`, `SnapToRoadService.ts:163`, `RoutingService.ts:51`.
- **Entry-gate policy correctly matches the documented rule** (`docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`): `EntryGateRoutingService.isGateRoutable` requires `routingStatus==='routable' && canStartRouteFromOutside` (`:62-63`) and `hasGateGraphConnection` checks real adjacency (`:65-66`); disconnected/missing-coordinate gates are correctly excluded from nearest-gate resolution (`:187-258`).
- **Fragile v1/v2 dispatch.** `DirectionsViewModel.ts` branches per-request on `destination.sourceVersion === 'v2'` at 7 separate call sites (`:65,111,121,346,358,373,401`). If a `Place` is ever constructed or persisted without `sourceVersion`, routing silently falls through to the **legacy v1 A\* pipeline** against `IJTEMA_DATA` — no compile-time enforcement catches this. The legacy fallback also gates outside/inside classification on `RoutingService.isInsideVenue`, a **rectangular bounding box** (`:188,198`), contradicting the doc's requirement that outside/inside use precise v2 polygon/rasta geometry — that precise check exists only on the v2 path (`EntryGateRoutingService.ts:156-168`).
- `src/constants/data.ts` (922 lines) duplicates venue geometry that already exists, remodeled, across `blocks.ts/gates.ts/rastas.ts/specialRoutes.ts` (~500 lines combined) — the real cost of keeping both systems live.

---

## 5. Navigation Pipeline

Flow: route selection (Home/Directions) → `NavigationScreen.tsx` (1,193 lines) branches v1 vs v2 → GPS from `GPSManagerService` (singleton, wired once in `RootNavigator.tsx:69`) → snap-to-road → instruction stepping → reroute evaluation → arrival/exit.

- **Flag/version gating is defense-in-depth, not a single point of failure.** `DirectionsViewModel.ts:401-409` blocks starting v2 nav unless all three flags are true; `NavigationScreen.tsx:44-53` independently re-checks `activeRoute.sourceVersion==='v2' && useIjtemaV2Navigation()` at render time and falls back to an explicit disabled screen rather than silently running v1 logic against v2 route data. No mismatch risk found here.
- **Reroute logic is duplicated in declaration but not in behavior.** Both `NavigationViewModel.ts` (v1) and `NavigationViewModelV2.ts:31` redeclare the same constants (`MIN_MOVEMENT_FOR_REROUTE_M=12`, `REROUTE_COOLDOWN_MS=25000`), but both ultimately delegate to shared `RerouteService.shouldTriggerReroute` (`RerouteService.ts:19-27`, same hardcoded 12m/25s/3-count/9s values) and a shared dynamic off-route threshold (30–80m band, `:10-13`). So the actual behavior is consistent between v1/v2 — the constant duplication is a DRY violation, not a functional bug.
- **GPS wiring is a legitimate decoupling, but easy to misread.** `NavigationViewModelV2.ts:96-115` registers a location listener whose callback (`handleLiveLocation`, `:96-98`) is a no-op — real location flows through the Zustand store subscription instead. The listener's only job is to raise GPS tracking cadence to `'navigation'` mode (1s/2m). Looks like dead code on first read; it isn't.
- v1 navigation (`docs/ROUTING_GRAPH.md`): clamps backward progress jumps, detects arrival within 20m, holds route stable above 50m GPS accuracy. v2 (`NavigationViewModelV2`): monotonic remaining-distance under jitter, stabilized ETA while stationary, reroute gated by threshold + consecutive evidence + cooldown, and keeps the previous route visible on reroute failure — reasonable, if unverified on-device (§9).

---

## 6. Offline Behavior

"Offline" in this app has two independent meanings that are easy to conflate:

1. **Routing/nav logic is unconditionally offline** — v2 map/graph data is static bundled TypeScript, imported directly with zero network calls at runtime. This holds regardless of connectivity.
2. **The visual basemap is the only thing that needs network**, and only when live Google/Apple tiles are shown. `NavigationScreen.tsx:207` sets `mapType='none'` (falls back to the app's own polygon/graph rendering) when offline or when tiles are pre-downloaded; otherwise it renders a live basemap requiring internet.

`OfflineMapService.ts` (672 lines) downloads OSM raster tiles (default `https://tile.openstreetmap.org`, `:259-265`) into SQLite + filesystem, with retry/backoff and a 3-stage network-diagnostics probe (`runNetworkDiagnostics`, `:371-448`) that duplicates part of `ConnectivityService`'s job at greater depth.

**Findings:**
- **Dead code masquerading as a feature.** `OfflineMapService.saveMapData()`/`getMapData()` (`:81-94, 232-252`) re-serialize already-bundled static data into SQLite — but `getMapData()` is never called anywhere in the app (repo-wide grep confirmed). Pure overhead with no read path.
- **Two tile-source modes are unimplemented stubs that fail by design.** `OfflineMapService.ts:492-497` (`'bundled'`) and `:498-503` (`'package'`) immediately return `errorMessage: 'Bundled/Package tile source is not implemented for production yet.'` if `EXPO_PUBLIC_OFFLINE_TILE_SOURCE` is ever set to either value — surfaced through the normal-looking failure path, not a startup crash, so this could ship unnoticed if that env var is ever touched.
- **`hasInternet: true` default causes a real, if narrow, race.** `useAppStore.ts:225` defaults to online; `RootNavigator.tsx:73-81` fires the connectivity check on mount but it's async. In the window before the first poll resolves, `DownloadMapScreen.tsx:226` can show a "Skip – use online mode" affordance, and `NavigationScreen.tsx:207` can pick live Google tiles instead of the offline graph-only render, purely from stale default state. Does not affect routing correctness, does affect what the user sees.
- Mock tile mode (`:77-78, 474-491`, writes a 1px transparent PNG) is correctly gated behind `__DEV__` — not a production risk.

`OfflineMapService.ts`'s 672 lines mix SQLite lifecycle, tile download/retry, network diagnostics, and dead static-data persistence — splitting diagnostics out and deleting `saveMapData`/`getMapData` would meaningfully shrink it without losing functionality.

---

## 7. Testing Strategy

No Jest/test framework. 71 standalone scripts under `scripts/`, each run via `node --import tsx`, one `npm run test:*` per file, `npm test` chains ~65 sequentially. `@testing-library/react-native` and `test-renderer` are listed in `devDependencies` (`package.json:117,126`) but **are never imported anywhere in the repo** — confirmed dead dependencies.

**Two genuinely different categories of script exist, and the naming does not distinguish them:**

- **Real functional tests** (import and execute app code, assert on live computed output): `test-map-data-v2.ts` imports live data constants and asserts structural/coordinate invariants; `test-route-smoke-v2.ts` calls `RoutingServiceV2.calculateRoute` for 17 real pairs and asserts on computed distance/ETA/instructions; `test-entry-gate-routing.ts` calls `EntryGateRoutingService.resolveRouteStartForUser` with real coordinates. These are legitimate automated regression tests.
- **Testing-theater** (grep the source file for a substring, never render or execute anything): `test-home-buttons-v2.ts` (22 lines) `readFileSync`s `HomeScreen.tsx` and asserts `.includes('handleZoomIn')`, `.includes('Start Navigation')`, etc. — no React import, no render, no simulated tap. `test-navigation-ui.ts` and `test-battery-v2.ts` follow the identical pattern (the latter, despite its name, never measures battery or GPS behavior — it string-matches `GPSManagerService.ts` for `'timeInterval: 5000'`). **35 of 65 test scripts use `readFileSync` as their primary or sole assertion mechanism** (confirmed via grep), and zero scripts render a component tree — consistent with the two unused rendering-library dependencies above. `test-performance-v2.ts` and `test-stability-v2.ts` are hybrids: part real timed micro-benchmark over `SearchService`/`V2DirectionsService` (real, if crude — a synchronous 75-iteration loop under a hardcoded ms threshold), part the same string-presence pattern.

**Practical consequence:** data and routing-logic correctness is genuinely covered by automated tests. UI correctness — the actual rendered layout, tap targets, visual regressions the app's own `docs/FULL_UI_COMPONENT_AUDIT.md` and `docs/*QA_CHECKLIST.md` explicitly flag as unverified — is not covered by anything in `scripts/`, despite `npm test` reporting pass/fail for files named `test-home-buttons`, `test-navigation-ui`, `test-ui-components`. A green `npm test` run should not be read as UI-verified; this matches the explicit disclaimer already in `CLAUDE.md` ("local script tests passing does not mean Android visual QA has passed") but the mechanism behind that disclaimer — string-matching instead of rendering — is not itself documented anywhere.

---

## 8. Technical Debt

- **Two live map/routing/navigation systems** (§1, §4) — the single largest ongoing debt item; every routing/nav change is implicitly a two-system change or a divergence risk.
- **Duplicated point-in-polygon implementation** across 4 files (§4).
- **Duplicated Dijkstra implementation** across `RoutingServiceV2.ts` and `EntryGateRoutingService.ts` (§4), and v2 using Dijkstra instead of the A* already proven out in v1.
- **Dead code:** `useAppStore.setOfflineDownloaded` (hardcodes `sizeMB: 24.5`, never called — the real path is `DownloadMapViewModel.ts:138-143`, which computes real size from tile count); `OfflineMapService.saveMapData`/`getMapData` (§6); unused `@testing-library/react-native` / `test-renderer` devDependencies (§7).
- **Placeholder URLs shipped as literal strings:** `HelpScreen.tsx:12` (`OFFICIAL_WEBSITE_URL = 'TODO_OFFICIAL_WEBSITE_URL'`), `AboutScreen.tsx:12-13` (privacy policy / terms of service URLs) — both correctly guarded by an "unavailable" alert rather than a dead link, but real product content is still missing.
- **Documented known data defects** (`src/data/ijtema/dataIssues.ts`, 41 lines, asserted-present by `test-map-data-v2.ts:256-259`): a Rasta 09 source-point ID typo, a duplicate SPNP-03 source ID, Gates 13/14 near-duplicate coordinates flagged `needs_verification`, and a normalized polygon corner order — tracked and tested for, genuinely handled debt rather than silent drift.
- **`mapBounds.ts:9`** — explicit TODO to replace the rectangular venue bound with a real polygon geofence; currently the v1 rectangular bound is still load-bearing for the legacy fallback path (§4).
- **Inconsistent zoom-threshold constants** and **untracked z-index stacking** in the rendering layer (§3).

---

## 9. Production Risks

Ranked roughly by likelihood × impact:

1. **v1 silent fallback on missing `sourceVersion`.** No compile-time guarantee prevents a `Place` from being constructed without `sourceVersion: 'v2'`; if it happens, routing silently uses the legacy A* pipeline against `IJTEMA_DATA` with a rectangular venue bound instead of the documented, tested v2 outside/inside gate policy (§4). This is the most serious correctness risk found, precisely because it fails silently rather than erroring.
2. **Android runtime QA is explicitly unverified**, per the project's own docs (`docs/FULL_UI_COMPONENT_AUDIT.md`, `docs/V2_ANDROID_RUNTIME_QA_CHECKLIST.md`): every screen is graded "CONDITIONAL PASS" pending on-device testing, and `CLAUDE.md` itself states local test-script pass does not equal production readiness. Given the §7 finding that most "UI" scripts are string-matches, the actual gap between "tests green" and "verified working" is larger than the docs alone suggest. Note: `android-runtime-artifacts/` (202 files, git-ignored, not committed) contains real device screenshots/UI dumps from some past manual session — evidence that on-device testing has happened at least once, but that evidence isn't reflected in the QA docs or reproducible via any script.
3. **iOS platform is not configured.** Uncommitted working-tree changes (`ios/KarachiIjtemaOfflineNav/AppDelegate.swift`, `Info.plist`, `Podfile`, `Podfile.lock`, `project.pbxproj`) are Expo-prebuild-generated Google Maps wiring, and the injected key is the literal placeholder `your_ios_maps_key_here` — confirmed the same placeholder is still in `.env`. iOS has never been prebuilt with a real Maps key in this environment; no evidence iOS has been run at all.
4. **Two tile-source modes fail by design if ever selected** (`'bundled'`/`'package'` in `OfflineMapService.ts:492-503`) — low likelihood (requires an env var most contributors won't touch) but a silent, generic-looking failure if it happens.
5. **`hasInternet: true` default race** (§6) — narrow window, cosmetic/UX impact only (wrong basemap/CTA shown briefly), not a data-correctness risk.
6. **No walkability/crowd-flow modeling** (`docs/ROUTING_GRAPH.md` "Known Issues"): no temporary closures, one-way paths, or blocked-area support in the graph. For a live event (Ijtema) where crowd density and temporary barriers are a realistic on-the-day condition, this is a product-risk more than a code-risk, but worth flagging since it's not mentioned in any of the audit docs as a gap.
7. **O(V²) Dijkstra and O(n²) intersection-connector generation** (§4) — currently fine at the venue's node count; would degrade if the graph is significantly densified without revisiting the algorithm.

---

## 10. Missing Documentation

- **No document explains the test-script split found in §7** — i.e., that ~half of `scripts/test-*-v2.ts` are `readFileSync`-based source-string assertions rather than functional tests. `CLAUDE.md` and the QA docs correctly warn that script tests ≠ Android QA, but nobody reading `npm test`'s output would know that a passing `test-home-buttons-v2` only proves a string still exists in a `.tsx` file.
- **No documentation of the `sourceVersion` contract** — nothing states "every `Place` must carry `sourceVersion` or it silently degrades to v1 routing." This is the single highest-value doc to add given finding §9.1.
- **`OfflineMapService.ts`'s unimplemented tile-source modes** (`'bundled'`, `'package'`) are not mentioned in `CLAUDE.md`, `docs/MAP_DATA_ARCHITECTURE.md`, or any QA doc — a contributor setting `EXPO_PUBLIC_OFFLINE_TILE_SOURCE` from an unrelated reference (e.g. another Expo project) would hit a silent failure with no doc pointing at the cause.
- **No architecture doc mentions `dataIssues.ts`** as the canonical place to record known-bad source coordinates going forward — it's discoverable only by reading the file or the test that asserts it.
- **iOS is entirely undocumented.** `CLAUDE.md`'s Commands section lists `npm run ios` but no iOS-specific setup, key configuration, or QA checklist exists anywhere, unlike the extensive Android QA documentation. Given finding §9.3, this gap is currently load-bearing.
- **No doc records the rationale for v2 using Dijkstra instead of A\*** given v1 already has a working, presumably faster A* implementation in the same codebase — worth a one-line note either justifying it (e.g. graph is small enough it doesn't matter) or flagging it as intentional future work.
- `docs/MAP_DATA_ARCHITECTURE.md` and `docs/MAP_DATA_MAINTENANCE.md` both describe a "Recommended Future Shape" / "Safer Future Process" (GeoJSON source, generated TS, checksums) that doesn't exist yet — accurately labeled as aspirational, not a doc gap, but worth carrying into any prioritization conversation since it's the structural fix for a large share of §8.

---

## Summary

Core routing/nav logic is well-tested and internally consistent for what it covers; the v2 outside-gate policy is implemented exactly as documented. The two largest structural costs are (1) the permanent v1/v2 duplication with a silent, untyped fallback path, and (2) a test suite whose name implies broader coverage (UI, buttons, stability) than a majority of its scripts actually verify. Both are fixable without a rewrite — a typed/enforced `sourceVersion` and an explicit split between "data/logic tests" and "source-string checklists" in `npm test`'s naming would close most of the gap between perceived and actual verification. Android and iOS runtime status remain the open, correctly self-reported blockers to any production claim.
