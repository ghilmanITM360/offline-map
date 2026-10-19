# Architecture

## Layering

MVVM: Views render and forward actions only. ViewModels own route lifecycle, retry, manual start/gate selection, cancellation, and valid-route retention. Services (`V2DirectionsService`, hybrid orchestrator, `RoutingServiceV2`) own dispatch, provider ordering, and route composition. See `AGENTS.md` for the full ownership contract — it governs, this doc explains the resulting shape.

## v1 / v2 dual system

The codebase currently carries two version-tagged implementations, selected by feature flags (`EXPO_PUBLIC_USE_IJTEMA_V2_*`) plus a per-route `sourceVersion` tag:

- **v1**: `src/constants/data.ts`, array/lookup-based, coordinates as `{lat, lng}`, routing via `RoutingService` (with its own private `pointInPolygon`). Rollback path only — not the active runtime.
- **v2**: `src/data/ijtema/*`, graph-based (`graphBuilder.ts`), coordinates as `{latitude, longitude}` at the UI boundary, routing via `RoutingServiceV2` and `OutsideStreetRoutingService`.

v1 is kept for rollback, not deleted, to avoid an API break — see `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`.

## Map-first UI, not screen-based

One persistent map lives in `HomeScreen`: MapLibre (`OfflineMapCanvas`) rendering the bundled PMTiles basemap (`docs/OFFLINE_BASEMAP.md`) with the venue overlays drawn as GeoJSON sources and layers (`overlaySpec.ts`, `mapLayerStyles.ts`). Directions, route preview, the Route Guide, active navigation and arrival are overlays/modes on that same map (`NavigationChromeV2`, `NavigationMapLayersV2`, `useNavigationOverlayV2`), not separate screens. The legacy v1 presentation renders as `NavigationChromeV1`/`NavigationMapLayersV1` overlays on `HomeScreen` (for legacy Block destinations); there is no separate `NavigationScreen.tsx`.

Destination selection, directions, route preview and the Route Guide all render through one `LocationSheet` component (`src/views/components/map/LocationSheet.tsx`), which has `details`, `preview` and `routePreview` modes rather than being separate sheets. Map features are layers, not accessibility nodes: the Directory is the accessible place chooser, and place labels render through `MapLabelOverlay`.

## Journey flow

- **Capability** — `LocationCapability` is the one evaluator for what location can do: permission, accuracy authorization, device services and fix quality are separate facets, `liveBlocker` says why live guidance is unavailable, and the route guide is always available. `LocationNavigationCapability` (start action, 50 m / 30 s live-fix gate) delegates to it.
- **Destination tap** — the Directory calls `useAppStore.setPendingJourney`, which evaluates `LocationCapability` and records a one-shot `destinationJourneyIntent` (`eligible` only for a fresh precise live fix with services enabled; a start left over from an earlier journey is never reused) next to a runtime-only `pendingJourney`; `HomeScreen` consumes it when focused and `LocationSheet` auto-starts it (`docs/PRODUCT_AND_USER_FLOWS.md`).
- **Journey state** — `selectJourneyPresentationState` (`src/services/JourneyPresentationState.ts`) is the one copy-free answer to what the journey is: CALCULATING, NEEDS_START, LIVE_READY, MANUAL_GUIDE_READY, OUTSIDE_VENUE_GUIDE, ROUTE_FAILURE, SAME_PLACE, ACTIVE_NAVIGATION, ARRIVED. A start is only a fresh live fix or one chosen for this journey. A straight-line outside guide (`direct-guide`) is OUTSIDE_VENUE_GUIDE, never a ready walking route; its distance is the straight line to the gate, and `routeCostM` (selection cost incl. gate penalties) is never shown as a distance. Views render from it, never from coordinates, distances or provider names.
- **Route Guide** — `routeGuide {steps, stepIndex}` in the store: runtime-only, never persisted, never `isNavigating`, so no engine, GPS watcher, reroute or arrival can run for it.
- **Stack** — launch is `[LocationsDirectory]`; the Map is `replace`d in or pushed under it; Done after arrival resets to `[LocationsDirectory]` (`resetToDirectoryAction`).
- **Top bar and sheet** — `MapTopBar` (Places, context title, menu) and `DirectionsPeekHandle` (the Directions sheet handle at every detent) are presentation only; state lives in the store and `LocationSheet`.

## Arrival ownership

`HomeScreen` mounts both navigation engines and ORs their `arrived`. Ownership is by route shape: `NavigationViewModelV2` runs only for `isNavigating` plus a V2 `activeRoute`; the V1 engine skips arrival whenever the active route is V2-shaped. The arrival latch is React state in each engine, never persisted; the unfinished-journey marker is cleared at the moment arrival fires.

## Navigation state

`isNavigating` (a raw store boolean) and `MapMode` (a derived value) are deliberately kept separate rather than merged into one state machine — merging created circular derivation and rollback-flag divergence between v1/v2 during past attempts. Treat this as a settled decision, not an open cleanup item.

## Routing core

`RoutingServiceV2` and `OutsideStreetRoutingService` share a common `src/utils/AStar.ts` + `src/utils/MinHeap.ts` core (heap-based A*, not the older per-file Dijkstra implementations described in retired audit docs — that duplication was consolidated).

The older `EntryGateRoutingService.findBestGateForOutsideUser`/`dijkstraCost` duplication path described in earlier audits no longer exists in the codebase (verified: no matches in `src/`) — gate selection now goes through the single `RoutingServiceV2` complete-journey cost path described in `docs/OFFLINE_NAVIGATION_AND_ROUTING.md`.

## Known live duplication

`pointInPolygon` is independently implemented three times (`src/services/RoutingService.ts`, `src/services/SnapToRoadService.ts`, `src/data/ijtema/graphBuilder.ts`) rather than shared via a `GeoUtils.ts`-style module. Verified still true against current source. Low priority — each copy is small and stable, not a correctness risk, but worth consolidating if touching any of the three files.

## Zoom thresholds

Gate-label zoom visibility was unified to zoom level 15 (previously inconsistent between 14 and a design-doc recommendation of 15) as a side effect of the map-experience redesign, not as a separately reviewed product decision. Noted here so it isn't rediscovered as a bug.
