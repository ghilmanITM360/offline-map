# Architecture

## Layering

MVVM: Views render and forward actions only. ViewModels own route lifecycle, retry, manual start/gate selection, cancellation, and valid-route retention. Services (`V2DirectionsService`, hybrid orchestrator, `RoutingServiceV2`) own dispatch, provider ordering, and route composition. See `AGENTS.md` for the full ownership contract — it governs, this doc explains the resulting shape.

## v1 / v2 dual system

The codebase permanently carries two parallel implementations, selected by feature flags (`EXPO_PUBLIC_USE_IJTEMA_V2_*`) plus a per-route `sourceVersion` tag:

- **v1**: `src/constants/data.ts`, array/lookup-based, coordinates as `{lat, lng}`, routing via `RoutingService` (with its own private `pointInPolygon`). Rollback path only — not the active runtime.
- **v2**: `src/data/ijtema/*`, graph-based (`graphBuilder.ts`), coordinates as `{latitude, longitude}` at the UI boundary, routing via `RoutingServiceV2` and `OutsideStreetRoutingService`.

v1 is kept for rollback, not deleted, to avoid an API break — see `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`.

## Map-first UI, not screen-based

One persistent `MapView` lives in `HomeScreen`. Directions, route preview, active navigation, and arrival are overlays/modes on that same map (`NavigationChromeV2`, `NavigationMapLayersV2`, `useNavigationOverlayV2`), not separate screens. `src/views/screens/NavigationScreen.tsx` is v1-only and exists as a defensive fallback, not the primary flow.

Destination selection, directions, and route preview all render through one `LocationSheet` component (`src/views/components/map/LocationSheet.tsx`), which has a `routePreview` mode rather than being three separate sheets.

Gate labels render via a separate `MapLabelOverlay` layer keyed to `HomeScreen`'s `mapLabelItems`, not as native `Marker` children — `GateLayer.tsx` renders touch-target dots only. This split exists because native Marker label text couldn't render reliably under this app's New Architecture/Bridgeless runtime; see the in-code comment at `src/views/components/map/GateLayer.tsx:29-47` and `docs/TESTING_AND_FIELD_ACCEPTANCE.md` history. This resolved what earlier audits (now retired) tracked as an open "gate label clipping" defect.

## Navigation state

`isNavigating` (a raw store boolean) and `MapMode` (a derived value) are deliberately kept separate rather than merged into one state machine — merging created circular derivation and rollback-flag divergence between v1/v2 during past attempts. Treat this as a settled decision, not an open cleanup item.

## Routing core

`RoutingServiceV2` and `OutsideStreetRoutingService` share a common `src/utils/AStar.ts` + `src/utils/MinHeap.ts` core (heap-based A*, not the older per-file Dijkstra implementations described in retired audit docs — that duplication was consolidated).

The older `EntryGateRoutingService.findBestGateForOutsideUser`/`dijkstraCost` duplication path described in earlier audits no longer exists in the codebase (verified: no matches in `src/`) — gate selection now goes through the single `RoutingServiceV2` complete-journey cost path described in `docs/OFFLINE_NAVIGATION_AND_ROUTING.md`.

## Known live duplication

`pointInPolygon` is independently implemented three times (`src/services/RoutingService.ts`, `src/services/SnapToRoadService.ts`, `src/data/ijtema/graphBuilder.ts`) rather than shared via a `GeoUtils.ts`-style module. Verified still true against current source. Low priority — each copy is small and stable, not a correctness risk, but worth consolidating if touching any of the three files.

## Zoom thresholds

Gate-label zoom visibility was unified to zoom level 15 (previously inconsistent between 14 and a design-doc recommendation of 15) as a side effect of the map-experience redesign, not as a separately reviewed product decision. Noted here so it isn't rediscovered as a bug.
