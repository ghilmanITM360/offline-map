# Outside-to-Inside Navigation Audit

Status: **Analysis only. No code changed. Awaiting approval before implementation.**

Date: 2026-07-18

Scope: assess current capability against the goal of Google-Maps-style navigation — user anywhere outside the Ijtema venue → highlighted route → nearest routable gate → internal route → destination block, with live GPS marker, distance, and turn instructions throughout.

---

## Executive Summary

The internal half of this goal is **already built and in production** (v2): live GPS tracking, moving user marker, heading-up camera follow, automatic rerouting, arrival detection, and turn-by-turn instruction cards all exist in `NavigationScreen.tsx` today, for the internal venue graph. The outside→gate resolution logic (nearest/best routable gate selection, gate-status gating, "walk to gate" instruction prepending) also already exists in `RoutingServiceV2` / `EntryGateRoutingService`, and is wired through the Directions preview flow.

What's missing is narrower than "build outside routing from scratch": **(1)** the outside→gate leg is currently a straight-line beeline, not a road-following path — there is no offline or online road-network data for the streets around the venue; **(2)** there's no distance sanity cap, so a GPS point in another city still silently resolves to "nearest gate" with no rejection; **(3)** v1 (the legacy fallback) has no gate concept at all, only boundary-node snapping; **(4)** the UI never shows a pre-navigation "Recommended Entry Gate" confirmation — gate choice is silent until after routing; **(5)** the outside and inside route segments render as one continuous color, with no distinct gate marker during active navigation.

No Google Directions/Routes/Places/Distance Matrix API is integrated anywhere — Google Maps SDK is used only for tile/marker rendering. The app is offline-first by design and has zero network calls in its routing services today.

---

## Current Architecture

```
User GPS (continuous, GPSManagerService.watchPositionAsync)
      |
      v
DirectionsViewModel.calculateRoute
      |  EntryGateRoutingService.isInsideIjtemaArea(origin)  — polygon/polyline geometry, 35m buffer
      |
      +-- inside  --> RoutingServiceV2: inside_coordinate start --> internal graph route
      |
      +-- outside --> RoutingServiceV2: outside_coordinate start
                          |
                          v
                    selectOutsidePath (EntryGateRoutingService.findBestGateForOutsideUser)
                          |  filters gates: routingStatus === 'routable' && canStartRouteFromOutside
                          |  cost = haversine(user -> gate) [straight-line, NOT road-following]
                          |        + internal graph Dijkstra cost (gate -> destination)
                          v
                    "Walk N meters to enter through <gate>" instruction prepended
                          |
                          v
                    internal graph route (gate -> destination block)
      |
      v
V2NavigationAdapter.fromPreview --> V2ActiveRoute (stamps startedOutside, entryGateId)
      |
      v
NavigationScreen (v2 runtime) — live GPS marker, camera-follow, rerouting, arrival detection
```

Key point: outside→gate resolution already exists and is correct in policy (gate filtering, cost function), but the *geometry* of the outside segment is a straight arrow on the map today, not a walked path, because no street-level road network is available to the app (offline or online).

v1 (legacy) has no equivalent — `SnapToRoadService.resolveRoutingNode` just detects outside-venue and snaps to a hardcoded boundary node (`T1,T2,S6,S12-S17`) with a warning string, then runs normal A* with no gate mediation at all. v1 is a rollback fallback per CLAUDE.md, but note this is a materially weaker outside-handling path if a user ever lands on it.

---

## Google API Status

| Files | API name | Purpose | Current usage | Missing capabilities |
|---|---|---|---|---|
| `package.json`, `ios/Podfile`, `ios/Podfile.lock`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `ios/KarachiIjtemaOfflineNav/AppDelegate.swift`, `Info.plist` | Google Maps SDK (Android) | Basemap tile/marker rendering | Enabled via `com.google.android.geo.API_KEY` manifest placeholder, keyed from `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`, gated on `MapConfigService.isGoogleMapsKeyConfigured()` | None — confirmed tile-rendering only, no routing/search calls |
| `ios/Podfile.lock`, `AppDelegate.swift`, `Info.plist`, `app.config.js` | Google Maps SDK (iOS) | Basemap tile/marker rendering | `GoogleMaps` + `Google-Maps-iOS-Utils` pods installed; **current native files contain the unsubstituted placeholder `your_ios_maps_key_here`** — no real iOS key baked in as of this snapshot | Needs real `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` + `expo prebuild` rerun before iOS map rendering works |
| — | Google Directions API | Route/leg computation | **Not integrated anywhere.** Zero `maps.googleapis.com`/directions-endpoint references. All routing is local (`RoutingService`, `RoutingServiceV2`) | Full integration absent by design (offline-first) |
| — | Google Routes API | Route computation | **Not integrated.** | Absent |
| — | Google Places API | Search/autocomplete/geocoding | **Not integrated.** Search is local (`SearchService`/`FuzzySearchService`/`V2PlaceAdapter`) against hardcoded venue data | Absent |
| — | Google Distance Matrix API | Distance/ETA | **Not integrated.** Distances computed locally via `geolib`/graph edge costs | Absent |
| `src/services/OfflineMapService.ts` | OpenStreetMap tile server (`tile.openstreetmap.org`) | Offline raster tile pre-download | Default tile source, `fetch()`-based, cached to SQLite/filesystem | This is the *only* outbound "maps" network traffic in the app — not Google, not Mapbox, and it's tiles (pictures), not routing data |
| — | Mapbox / OSRM / GraphHopper | — | Confirmed absent — no package, no domain reference anywhere in repo | N/A |

Credentials: `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` in `.env` (gitignored), consumed through `app.config.js` → native manifest/plist injection. `EXPO_PUBLIC_TILE_BASE_URL` optionally overrides the OSM tile source.

---

## Outside Routing Status

- **Policy layer exists and is correct**: `EntryGateRoutingService` filters to `routingStatus: "routable" && canStartRouteFromOutside` gates, computes best gate by `haversine(user→gate) + internal graph cost(gate→destination)`, matching `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`. Disconnected gates (`GATE_03/17/18/19`) are excluded upstream and surfaced with `"This gate needs connector verification before navigation."`.
- **Geometry layer does not exist**: the user→gate leg is a straight-line beeline (haversine distance used directly as both the cost function and, implicitly, the only geometry available) — there is no road-following polyline for that segment because no street network data exists in the app.
- **No distance sanity cap**: a GPS coordinate in another city still resolves to "nearest gate" and produces a route/instruction set with no rejection or "you appear too far away" warning, in both v1 and v2.
- **v1 has no gate concept**: outside detection only triggers a boundary-node snap with a warning string; A* then proceeds normally. This is the fallback path per the v1/v2 flag system, so it matters only in rollback scenarios but is worth flagging as inconsistent behavior if v1 is ever activated.
- **Entry point is the Directions preview screen only**: outside/inside resolution happens in `DirectionsViewModel`/`V2DirectionsService` before `startNavigation()` is called. There is no direct "start navigation from raw GPS" affordance elsewhere (e.g., Home screen, map long-press) that performs this resolution independently.
- Reroute-time re-resolution already works: `attemptReroute` in `NavigationViewModelV2` rebuilds the request and re-derives inside/outside from the current coordinate each time, so a user who re-exits the venue mid-navigation gets gate logic reapplied automatically.

---

## Offline Capability

The entire internal graph (v1 and v2) is already 100% offline — it's hand-authored TypeScript bundled directly in the JS bundle, not fetched from anywhere. `OfflineMapService`'s SQLite caching of "map data" mirrors this already-bundled data for persistence; it is not a network download of routing data. The only real network traffic in the app is OSM raster tile downloads for visual background rendering (pictures, not routable data).

**No offline road network exists for the area surrounding the venue.** All coordinates in `src/data/ijtema/*` cluster tightly inside the venue's ~2km bounding footprint. There is no `.pbf`/`.osm`/`.mbtiles`/sizeable `.geojson` file anywhere in the repo. `docs/MAP_DATA_ARCHITECTURE.md` explicitly documents that no external/generated map package is checked in.

Two paths forward, neither built today:

**Option A — Hybrid (online-assisted outside leg)**
Needs: a routing API integration (Google Directions/Routes, Mapbox Directions, or a hosted OSRM/GraphHopper instance) for the outside→gate leg only; network-availability gating with graceful offline fallback (straight-line, as today); API key/quota management. Nothing in this direction exists in the codebase (zero network calls in either routing service, confirmed).

**Option B — Fully offline (bundled street graph)**
Needs: (1) an OSM extract clipped to a few-km radius around the venue, (2) an ingestion/build step converting it into a routable graph (the venue's own hand-authored-TS pattern does not scale to city-street density), (3) an on-device pathfinding engine sized for that graph — the existing Dijkstra in `EntryGateRoutingService` is sized for ~150 venue nodes and likely won't scale as-is to a street-level graph, (4) a street-snapping service analogous to `SnapToRoadService` but for real roads.

Both are non-trivial net-new builds; recommend deciding which before scoping implementation (see Risks).

---

## Recommended Architecture

Keep everything that already works: `GPSManagerService` (continuous watch, dual duty-cycle), `RerouteService`, moving marker + heading-camera-follow, arrival geofencing, `EntryGateRoutingService`'s gate filtering/cost function, `RoutingServiceV2`'s `outside_coordinate` start type. Layer in:

1. A distance sanity cap on outside-coordinate routing (both v1 and v2) — reject/warn beyond a configurable max radius instead of silently producing a beeline route to the nearest gate from anywhere on Earth.
2. A chosen approach (A or B above) for the outside→gate leg geometry, replacing the current straight-line segment with an actual walked path once decided.
3. A pre-navigation "Recommended Entry Gate" confirmation card (promote the already-computed `entryGateName`/distance from `DirectionsScreen`'s descriptive text into an explicit confirm-before-navigate step with a "Change gate" override, reusing the existing manual-start search).
4. Two-color route rendering (distinct outside-segment vs. inside-segment colors) and a persistent gate marker during active navigation, distinguishing the gate waypoint from the final destination marker.
5. v1 parity decision: either bring v1's outside handling in line with v2's gate-mediated flow, or explicitly accept the weaker v1 fallback behavior is scoped out (it's an emergency-rollback-only path per CLAUDE.md).

No change needed to the internal navigation engine — it already satisfies the "Google Maps style" bar (live marker, camera follow, rerouting, arrival, instructions).

---

## UX Flow

Destination selection: keep the existing search + category chips + direct map-tap-on-rendered-feature combination — already covers realistic queries ("Block B25", "Gate 5") better than free-text alone, and deliberately excludes arbitrary map-tap-to-drop-pin since every valid destination in this venue is a known graph feature (an arbitrary pin risks an unreachable off-graph target). Minor gap: category chips currently hide while search is focused — reduces discoverability, worth revisiting independent of this audit's scope.

Entry gate experience: recommend an explicit **confirmation card** ("Recommended Entry Gate — Gate 05, 2.3 km away") before navigation starts, not silent auto-selection. This is a large public gathering where wrong-gate routing has real crowd-control consequences; even though the data model has no gender/segregation fields today (confirmed absent from `gates.ts`/`blocks.ts`/`types.ts`), on-ground policy not captured in the app can override the app's computed choice, so the user needs visibility and a "Change gate" affordance before committing.

Navigation UI: keep `#1A73E8` (already used, good contrast) for the inside-venue segment; use a distinct warm color (e.g. `#F57C00`, already used in this codebase for warning/reroute states) for the outside-to-gate segment — orange/blue is colorblind-safe. User marker, destination marker, distance card, and next-instruction card all already exist in `NavigationScreen.tsx`; only a persistent, visually distinct gate marker and the two-color segment split are missing.

---

## Implementation Gap Table

| Feature | Existing | Missing | Difficulty |
|---|---|---|---|
| Outside routing (policy) | Gate filtering, best-gate cost function, disconnected-gate messaging | Distance sanity cap | Low |
| Outside routing (geometry) | Straight-line beeline only | Road-following path (Option A or B) | High |
| Google routing | Maps SDK tile rendering | Directions/Routes/Places/Distance Matrix — none integrated | Medium (if Option A chosen) |
| Offline routing (internal) | Full v2 graph, 100% offline, live | — (complete) | — |
| Offline routing (outside area) | Nothing | OSM extract + ingestion + on-device engine + street-snapping | High |
| GPS tracking | Continuous watch, dual duty-cycle | — (complete) | — |
| Rerouting | Off-route hysteresis, cooldown, re-resolves inside/outside live | — (complete) | — |
| Turn instructions | Instruction card + "Then:" preview, "walk to gate" prepend | Instructions for the outside-leg road geometry once it exists | Medium (depends on geometry work) |
| Voice guidance | None found | Full build | Medium |
| Route highlighting | Single continuous polyline | Two-color segment split (outside vs inside), persistent gate marker | Low |
| Pre-nav gate confirmation UI | Descriptive text post-hoc | Explicit confirm-before-navigate card with override | Low |

---

## Required Changes

Ordered roughly by dependency, not urgency:

1. **Decide Option A vs. B** for the outside→gate leg (product/infra decision — cost, offline requirement strength, data licensing for an OSM extract if B).
2. Add distance sanity cap to `RoutingService`/`RoutingServiceV2` outside-coordinate handling.
3. Build chosen routing capability for the outside leg (API client + connectivity gating, or OSM extract + offline engine + street-snapping).
4. Add pre-navigation gate confirmation UI (`DirectionsScreen` promotion).
5. Add two-color polyline rendering + persistent gate marker (`NavigationScreen.tsx`).
6. Decide and implement (or explicitly defer) v1 parity for gate-mediated outside routing.
7. Provision real iOS Google Maps key (currently placeholder in generated native files) if iOS parity matters for this effort.

---

## Risks

- **Option A (online-assisted)** breaks the app's offline-first identity for the outside leg specifically — needs clear UX for degraded/offline behavior (fall back to today's straight-line beeline) and recurring API cost/quota exposure.
- **Option B (fully offline street graph)** is a substantial new data pipeline and engine — city-street routing at even a few-km radius is a different scale problem than the ~150-node venue graph, and the existing Dijkstra implementation is not proven at that scale.
- No distance cap today means a GPS glitch or a user testing from another city produces a silently "valid-looking" route — worth fixing regardless of which option is chosen, independently and first.
- v1 fallback inconsistency: if v1 is ever activated in production (rollback scenario per CLAUDE.md), outside users get materially different, weaker behavior (boundary-node snap, no gate mediation) with no warning that this differs from v2.
- iOS Google Maps key is currently an unsubstituted placeholder in generated native files — any outside-routing UI work involving map rendering should confirm real keys are provisioned before iOS QA, per CLAUDE.md's native-rebuild note.
- Crowd-control/gender-segregation policy (if it exists on the ground) is not modeled in `gates.ts` today — confirmed no such fields exist. If auto-gate-selection ever needs to respect that, it requires a data model change before the confirmation-card UX work, not after.

---

*No code was modified during this audit. Implementation should not begin without explicit approval of the recommended architecture and required-changes ordering above.*
