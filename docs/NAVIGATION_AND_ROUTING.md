# Navigation and Routing

How routes are chosen and followed. SOURCE level unless marked; real-world behavior beyond the emulator is PHYSICAL DEVICE REQUIRED / FIELD REQUIRED (see [`TESTING.md`](TESTING.md)). Ownership of the pieces is in [`ARCHITECTURE.md`](ARCHITECTURE.md); what the user sees is in [`PRODUCT_AND_USER_FLOWS.md`](PRODUCT_AND_USER_FLOWS.md).

## Outside-venue routing policy

Every outside start coordinate, whatever its source (GPS, search, map tap, remembered state), follows the same pipeline:

```text
outside coordinate
-> prepareOutsideRoutingPlan
-> configured Google walking-route proxy        (optional leg, see "What is real")
-> bundled OSM fallback                         (OfflineOsmWalkingRouteProvider)
-> labelled direct-direction guide              (DirectDirectionGuideProvider)
-> finalizeOutsideRoutingPlan
```

`HybridOutsideRouteOrchestrator` walks the providers in that order and returns the first complete candidate set; a failed, malformed or no-route provider is recorded in the fallback history and the next is tried. The bundled OSM provider reports `outside-coverage` for a start beyond the street graph, so the direct guide takes over there. A coordinate already inside the Ijtema uses the normal internal pedestrian route directly: start-source labels never change routing policy.

## Entry policy

Outside users must enter through an official gate: the app never snaps an outside coordinate directly onto the internal graph. Inside users may snap directly to the internal graph (no gate required, they are already inside). A gate with no confirmed coordinate must never be offered as a routable entry choice.

## Complete-journey gate cost

Automatic gate selection minimizes the **total** pedestrian journey cost: outside route + gate connector + gate penalty + internal route to the destination. It is not nearest-gate-by-distance. Gates with no valid internal route to the destination are excluded before the outside search. A manual gate selection, once made, is authoritative and survives automatic reroutes.

A gate is eligible only when `routingStatus === 'routable'`, `canStartRouteFromOutside` is true and it has a working internal graph connection. Gates without a verified connector (Gate 18 and 19; field survey #43/#44) are not offered and are described as needing connector verification rather than routed through an unsurveyed connection.

Cost ownership is split on purpose: outside providers return only their own leg's geometry, distance and duration; `RoutingServiceV2` alone composes connector + gate penalty + internal leg into the journey comparison. Keep that out of Views and ViewModels (`AGENTS.md`). The provider's own endpoint join is not yet part of the cost (#161).

Confirmed official gate coordinates: Gate 12 `24.963676, 67.006339`; Gate 13 `24.963718, 67.006862`; Gate 14 `24.965516, 67.007675`. The remaining gate coordinates are in `src/data/ijtema/gates.ts`; none is invented.

## Internal pedestrian routing

`RoutingServiceV2` runs heap-based A* (`src/utils/AStar.ts`, `MinHeap.ts`, shared with `OutsideStreetRoutingService`) over the venue graph derived at import time from the human-edited data in `src/data/ijtema/*` (blocks, gates, rastas, special routes, central points, perimeter connectors). Routing is pedestrian-only and needs no network. The outside leg runs on the bundled OSM street graph (`streetGraph.ts`, a 3,000 m radius around `24.971698, 67.006464`) when the start is inside that radius and `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` is not turned off; otherwise gate selection falls back to a straight-line (beeline) estimate to each gate. A 1.8x sanity cap on graph-routed legs flags pathological detours (`sanityCapExceeded`, warn-logged, never rejected in production; the script suite hard-fails on it).

## Journey state contract

`selectJourneyPresentationState` (`src/services/JourneyPresentationState.ts`) is the single answer to what the journey is. It is copy-free: Views choose words from it and never infer state from coordinates, distances, provider names or start-source strings.

| State | Meaning |
|---|---|
| CALCULATING | idle or loading |
| NEEDS_START | no fresh live fix and no start chosen for this journey (nothing is invented) |
| LIVE_READY | ready route from a fresh live fix |
| MANUAL_GUIDE_READY | ready route from a start the user chose (a Route Guide) |
| OUTSIDE_VENUE_GUIDE | start outside the venue and only the straight-line `direct-guide` reaches the gate |
| ROUTE_FAILURE / SAME_PLACE | error, or start equals destination |
| ACTIVE_NAVIGATION / ARRIVED | navigation outranks any preview state |

`outsideGuideSummary` is the only distance an OUTSIDE_VENUE_GUIDE may show: the straight line to the gate. `totalDistance` adds the inside walk to that line and `routeCostM` also carries gate penalties; neither is a walking distance for the guide. Only a ready route can start (`isJourneyStartable`). `LocationCapability` (permission, accuracy, services, fix; live fix must be <= 30 s old and <= 50 m) decides whether live guidance is available; the Route Guide never depends on it.

## Live navigation behavior

All thresholds are named constants (`src/constants/navigation.ts`, `RerouteService`, `NavigationViewModelV2`).

- **Progress** is the projection of the fix onto the active route, monotonic (a backtrack beyond 15 m is ignored; a single fix's forward jump is bounded by elapsed time). A fix older than the navigation-watcher generation boundary (trip start or foreground resume, 2 s tolerance) is rejected, so a cached last-known location cannot move progress or arrive.
- **GPS lost** after 8 s without a fresh fix; weak GPS (accuracy > 50 m) holds the route stable instead of rerouting. On foreground resume both engines force a fresh fix and reject the cached one (V2 in `NavigationViewModelV2`; V1 gained the same `AppState` handler in NAV-004, PR #172).
- **Reroute** triggers when the fix is farther than the dynamic off-route threshold (30 m, or 1.5x the fix accuracy, capped at 80 m) and either 3 consecutive new off-route fixes or 9 s off route have accumulated, the user has moved at least 12 m since the episode started, and the 25 s cooldown has passed. An accepted reroute replaces the route (the old one fades as a ghost line); a failed one keeps the current route. A manual gate stays authoritative. While the user is still outside the Ijtema on a `direct-guide` route, no reroute is attempted.
- **Arrival** needs proximity (<= 20 m of the destination entry coordinate) and progress reaching the end of the route; the latch is per trip. Only the session's own engine may arrive (V2 route -> `NavigationViewModelV2`).
- **Instructions** come from `RoutingServiceV2` maneuver classification for the internal leg and `StreetInstructionService` for the outside street leg (maneuvers and street names; `V2NavigationAdapter` replaces raw route ids with "route point" so developer identifiers never reach the screen). Spoken output is `VoiceService` (queued, de-duplicated, mutable; on when Voice Instructions is on).
- **Voice language caveat:** spoken instructions take their language from the legacy `settings.language` (`'en'`/`'ur'`, default `'en'`, no UI), not from the app-language picker. SOURCE finding; owned by the localization work.

## What is real vs external

| Piece | Status |
|---|---|
| Internal pedestrian routing, venue graph | Real, bundled, offline (SOURCE/RUNTIME; EMULATOR walked with mock GPS) |
| Outside OSM street-graph fallback | Real, bundled, offline, within 3 km of the venue |
| Direct-direction guide | Real, offline, straight line only |
| Google walking-routes proxy leg | **Not deployed (#123).** Mobile has only an optional base URL (`EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL`); the proxy leg is added to the chain only when `EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC` is `true`. By default (unset) the production chain is bundled OSM, then direct guide. No credential is in the app |
| Walking proxy server | Staging preparation in `backend/walking-proxy/` (contract + fixture tests via `npm run test:walking-proxy`). Not deployed, not verified against the real provider; billing/ingress/IAM are owner decisions |
| Real GPS, real walking | PHYSICAL DEVICE REQUIRED / FIELD REQUIRED (#46) |

Never claim the proxy is live or verified without checking the actual deployed environment (`AGENTS.md`).

## v1 rollback path

The v1 graph and routing (`src/constants/data.ts`, `RoutingService`, `T*`/`S*`/`P*`/`C*` node ids) remain only as a rollback path behind the V2 feature flags. It is not the active runtime and must not be extended; see `ARCHITECTURE.md` and `KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`.

## Offline contract

Everything core works with zero internet: launch, Directory, Place details, the visual map, blocks/gates/paths/special routes, destination focus, Route Ready, Start, progress, reroute, arrival and recovery. Internet is optional everywhere. Map and data details: [`OFFLINE_MAP_AND_DATA.md`](OFFLINE_MAP_AND_DATA.md). `src/__tests__/OfflineVisualMapContract.test.ts` guards the user-facing copy and `npm run test:offline-basemap` the archive.
