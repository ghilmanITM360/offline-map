# Offline Navigation and Routing

## Outside-venue routing policy

Every outside start coordinate — regardless of source (GPS, search, map tap, remembered state) — follows the same pipeline:

```text
outside coordinate
-> prepareOutsideRoutingPlan
-> configured Google walking-route proxy
-> bundled OSM fallback
-> labelled direct-direction guide
-> finalizeOutsideRoutingPlan
```

The Google proxy leg requires the backend proxy to be deployed (see `docs/RELEASE_SECURITY_PRIVACY.md` — currently blocked pending platform approval); until then the app runs the OSM/direct-guide legs. This is a graceful degradation, not a broken feature.

A coordinate that's already inside the Ijtema uses the normal internal pedestrian route directly — start-source labels never change routing policy.

## Entry policy

Outside users must enter through an official gate — the app never snaps an outside coordinate directly onto the internal graph. Inside users may snap directly to the internal graph (no gate required, they're already inside). A gate with no confirmed coordinate must never be offered as a routable entry choice.

## Complete-journey gate cost

Automatic gate selection minimizes **total** pedestrian journey cost — outside route + gate connector + gate penalty + internal route — not nearest-gate-by-distance. Manual gate selection, once made by the user, remains authoritative and survives automatic reroutes.

A gate is eligible for automatic selection only when `routingStatus === 'routable'` and `canStartRouteFromOutside` is true, and the gate has a working internal graph connection. Gates without a verified connector show "This gate needs connector verification before navigation." rather than silently routing through an unsurveyed connection — see open issues #43/#44 for the two gates still pending field survey.

Cost-calculation ownership is split deliberately: outside providers return only their own leg's geometry/distance/duration; `RoutingServiceV2` alone composes connector cost + gate penalty + internal leg into the final journey comparison. Keep this split out of Views/ViewModels (see `AGENTS.md`).

## Routing core

`RoutingServiceV2` and `OutsideStreetRoutingService` share `src/utils/AStar.ts` (heap-based A*, via `src/utils/MinHeap.ts`) rather than independent Dijkstra implementations. The bundled offline street graph covers roughly a 3km radius around the venue; requests beyond that radius fall back to a straight-line (beeline) estimate. A 1.8x sanity cap applies to graph-routed segments to catch pathological detours, not to the beeline fallback.

Confirmed official gate coordinates:
- Gate 12: `24.963676, 67.006339`
- Gate 13: `24.963718, 67.006862`
- Gate 14: `24.965516, 67.007675`

## Offline visual-map contract (#140, owner decision 2026-10-05)

"Offline" means the **venue core**: the bundled venue graph, gates/blocks/rastas/special routes, venue geometry and labels, internal and bundled-OSM outside routing, Directions, active navigation, reroute and arrival all work with no network, and no route calculation has a hidden network requirement.

Third-party street/satellite **background imagery is optional online context**. The app does not download, prefetch or bulk-store tiles from `tile.openstreetmap.org` or any other public tile server, and no offline imagery package is shipped. `OfflineMapService.isOfflineTileDownloadAvailable()` is `false` in every release build (dev/mock only), so the Download Map step only explains this and offers to continue; `HomeScreen` falls back to the graph-only venue map (`BaseMapModeResolver`) when imagery is unavailable. Existing validated local tiles, if any, still render. Adding a licensed offline imagery source later is a new decision, not part of this milestone.

User-facing copy must not promise downloaded imagery; `OfflineVisualMapContract.test.ts` guards the known phrases.

## v1 rollback path

The v1 graph (`T*`/`S*`/`P*`/`C*` node IDs, plain A* over `src/constants/data.ts`) exists only as a rollback path behind feature flags — it is not the active runtime and should not be extended.
