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

## Offline visual-map contract (#140, owner decision 2026-10-05 — supersedes the earlier "imagery is optional" decision)

The whole Ijtema experience works with **zero internet**: launch, Directory, Place Details, the **visual map**, blocks/gates/paths/special routes, destination focus, Route Preview, Start, progress, reroute, arrival and process-death recovery. Internet is optional everywhere.

- **Renderer:** MapLibre Native (`@maplibre/maplibre-react-native`) on a **bundled vector archive** — see [ADR 0001](adr/0001-offline-visual-map-renderer.md) and [OFFLINE_BASEMAP.md](OFFLINE_BASEMAP.md). The archive ships inside the APK and is copied once into app-private storage on first launch (`BundledBasemap`); there is **no Download Map step, no map setup screen, no download banner and no remote tile/style/font/sprite request**.
- **Data:** generated from OpenStreetMap *data* (ODbL, "© OpenStreetMap contributors" shown by the map's attribution control). The app never downloads or bulk-prefetches tiles from `tile.openstreetmap.org` / `vector.openstreetmap.org` (prohibited by the OSM Foundation) and nothing is derived from Google data.
- **Routing:** internal and outside routing run on bundled graphs (no network). A live walking-route provider is an optional enhancement only (#123/#161).
- **First launch:** Splash → Welcome → Directory. No map-setup step and no permission step: location is asked in context.
- **Failure mode:** if the archive cannot be installed (or fails its SHA-256, #306), the map falls back to a plain canvas with the venue overlays — never a download prompt.

`OfflineVisualMapContract.test.ts` guards the user-facing copy, `npm run test:offline-basemap` the archive/provenance.

## v1 rollback path

The v1 graph (`T*`/`S*`/`P*`/`C*` node IDs, plain A* over `src/constants/data.ts`) exists only as a rollback path behind feature flags — it is not the active runtime and should not be extended.
