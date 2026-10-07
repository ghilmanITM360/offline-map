# Architecture

How the code is shaped today. Statements are SOURCE level (read from the code) unless marked. The engineering contract is `AGENTS.md` and governs; this explains the resulting shape. User-visible behavior is in [`PRODUCT_AND_USER_FLOWS.md`](PRODUCT_AND_USER_FLOWS.md), routing in [`NAVIGATION_AND_ROUTING.md`](NAVIGATION_AND_ROUTING.md).

## Stack

Expo 54 / React Native 0.81 (New Architecture, Hermes), React 19, `@maplibre/maplibre-react-native` 11.5 for the map, `@gorhom/bottom-sheet` for the sheet, React Navigation (native stack + drawer), `zustand` for state, `expo-location` for GPS, `expo-speech` for spoken instructions. Android is the verified platform; iOS has never been built or run.

## App shell

`App.tsx` wraps everything in, outermost first: `GestureHandlerRootView`, `SafeAreaProvider`, `ErrorBoundary`, `BottomSheetModalProvider`, then `LocalizedShell`, which sets the layout `direction` (a root `View` style and the `NavigationContainer` prop) from the chosen app language, so Urdu mirrors the whole UI and English/Roman Urdu stay left-to-right. The phone's own RTL setting is not consulted. The map itself is a native canvas, so geography never mirrors. `App` also starts the bundled-basemap install (`getBundledBasemap()`) in parallel with Splash.

`RootNavigator` is a native stack: `Splash`, `Welcome`, `LocationsDirectory`, `Main` (a drawer holding `Home`, `Settings`, `Help`, `About`) and `AppGuide`. Launch decides Welcome-once-then-Directory in `StartupManager.resolve`; location permission is never a launch gate. The Directory is reached with `replace` at launch and pushed over Home when reopened from the map (`<- Places`); Done after arrival resets the stack to the Directory alone (`resetToDirectoryAction`, `src/navigation/postJourney.ts`).

## One map-first screen

There is exactly one map: `HomeScreen` mounts one `OfflineMapCanvas` (MapLibre `MapView`, `androidView="texture"`) over the bundled PMTiles basemap (`src/views/components/mapgl/`). Everything else on it is an overlay or a mode, not another screen or map:

- Venue overlays (blocks, rastas, gates, special routes, facilities, route, markers) are GeoJSON sources and layers built by `overlaySpec.ts` / `navigationScene.ts` and mounted by `OverlayScene`; styling tokens live in `mapDesign.ts`. Map features are layers, not accessibility nodes: the Directory is the accessible place chooser, and place labels are drawn by the React Native `MapLabelOverlay`.
- `useMapMode` derives one of six mutually exclusive modes (`EXPLORE`, `PLACE_SELECTED`, `DETAILS`, `ROUTE_PREVIEW`, `NAVIGATION`, `ARRIVAL`) by priority, so two modes can never be true at once.
- One bottom sheet, `LocationSheet` (`src/views/components/map/LocationSheet.tsx`), renders place preview, details, Directions setup, Route Ready and the Route Guide as modes of the same component. The sheet has three detents, PEEK (lowest), PARTIAL and FULL. It never swipes away (`enablePanDownToClose={false}`): a swipe only folds it to the PEEK, and `DirectionsPeekHandle` is the always-visible, tappable handle at every detent. When live navigation starts the sheet is removed outright (content, pinned footer and container are not rendered/touchable) and returns after navigation stops.
- `MapTopBar` (Places, context title, menu), `MapControls` (layers, zoom, recenter/direction), `NavigationChromeV2`/`V1`, `OutsideRouteStatusCard` and `OsmAttribution` are presentation only.

Camera framing is owned by `useCameraManager` / `MapStartupController` / `HomeViewModel`: a destination or route owns the camera; otherwise a fresh live fix shows the venue overview with the user marker; with no usable location the Block 2 anchor is shown with a notice. A persisted last-known location never moves the camera on its own.

## MVVM ownership

- **Views** (`src/views`): rendering, accessibility and action forwarding only.
- **ViewModels** (`src/viewmodels`): `HomeViewModel` (selection, camera, hand-off), `DirectionsViewModel` (route lifecycle, retry, manual start and gate, cancellation, valid-route retention), `NavigationViewModelV2` / `NavigationViewModel` (live navigation engines), `SettingsViewModel`, `WelcomeViewModel`, plus hooks (`useMapMode`, `useOverlayInsets`, `useDestinationPulse`, `useReducedMotion`, ...).
- **Services** (`src/services`): `V2DirectionsService` (inside/outside dispatch, hybrid workflow), `HybridOutsideRouteOrchestrator` and the providers in `src/services/outsideRouting/` (provider order and fallback), `RoutingServiceV2` (gate eligibility, internal routes, complete-journey selection, final composition), `OutsideStreetRoutingService` (bundled street graph), `GPSManagerService`, `LocationCapability` / `LocationNavigationCapability` / `JourneyStartPlanner` / `JourneyPresentationState` (journey truth), `SearchService` / `PublicDestinationsService` / `V2PlaceAdapter` (place data), `BundledBasemap*` (basemap install), `VoiceService`.
- Provider ordering and complete-route cost stay out of Views and ViewModels. Outside providers return candidate geometry/distance/duration only; they never choose the journey.

## State

- `useAppStore` (`src/store/useAppStore.ts`, persisted under `ijtema-app-store`, whitelisted by `partializeAppState`): settings, favorites, recent searches (with per-entry timestamps), one last-known location (24 h), the unfinished-journey marker (2 h, no coordinates), map-layer toggles and tutorial flags. Everything else is runtime only: current and snapped location, active route and progress, `isNavigating`, `routeGuide`, `pendingJourney`, directory purpose/choice, route planner origin/destination. Retention rules: [`DATA_PRIVACY_RETENTION.md`](DATA_PRIVACY_RETENTION.md).
- `useLocaleStore` (`src/i18n/localeStore.ts`, persisted under `ijtema-locale-v1`): the chosen app language only, deliberately separate so changing language never touches journey state.
- `isNavigating` (raw store boolean, written only by `startNavigation`/`stopNavigation`) and `MapMode` (derived) are deliberately separate rather than one state machine; merging them created circular derivation in past attempts. This is a settled decision. The few sanctioned direct readers of `isNavigating` are listed in `scripts/test-navigation-architecture-audit.ts`.

## Journey flow

- **Capability.** `LocationCapability` is the single evaluator of what location can do: permission, accuracy authorization (precise/approximate), device services and fix quality are separate facets; `liveBlocker` says why live guidance is unavailable; the Route Guide is always available. Live guidance needs a fix that is fresh (<= 30 s) and accurate (<= 50 m).
- **Destination tap.** The Directory plans with `planDestinationTap` (live, or ask for a start; a start left over from an earlier journey is never reused) and hands Home a runtime-only `pendingJourney`; `HomeScreen` consumes it once focused and `LocationSheet` auto-starts it.
- **Journey state.** `selectJourneyPresentationState` is the one copy-free answer to "what is this journey": CALCULATING, NEEDS_START, LIVE_READY, MANUAL_GUIDE_READY, OUTSIDE_VENUE_GUIDE, ROUTE_FAILURE, SAME_PLACE, ACTIVE_NAVIGATION, ARRIVED. Views render from it, never from coordinates, distances or provider names. A straight-line outside guide (`direct-guide` provider) is OUTSIDE_VENUE_GUIDE, never a ready walking route; `routeCostM` (selection cost including gate penalties) is never shown as a distance.
- **Route Guide.** `routeGuide { steps, stepIndex }` in the store: runtime only, never persisted, never `isNavigating`, so no engine, GPS watcher, reroute or arrival can run for it.
- **Arrival ownership.** `HomeScreen` mounts both navigation overlays/engines and ORs their `arrived`. Ownership is by route shape: `NavigationViewModelV2` runs only for `isNavigating` plus a V2 `activeRoute`; the V1 engine skips arrival whenever the active route is V2-shaped. The arrival latch is React state in each engine, never persisted; the unfinished-journey marker is cleared when arrival fires.

## v1 / v2

Two data/routing systems coexist on purpose:

- **v2** (the active runtime): `src/data/ijtema/*` (graph-based, `{latitude, longitude}` at the UI boundary), `RoutingServiceV2`, `OutsideStreetRoutingService`, `V2*` services. Blocks, gates, rastas, Shahr-e-Pindal and facility destinations produce V2-shaped routes.
- **v1** (rollback): `src/constants/data.ts` (`{lat, lng}`), `RoutingService`, `NavigationViewModel`, `NavigationChromeV1` with `useNavigationOverlayV1`. Not deprecated and not deleted, to avoid an API break (#117 tracks retiring or reconciling it; see `KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`). `LANDMARK_PLACES` (map facility landmarks) still come from this file.

Feature flags `EXPO_PUBLIC_USE_IJTEMA_V2_MAP`, `_ROUTING`, `_NAVIGATION` and `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` (`MapFeatureFlagsService`) **default to ON** when unset or unparseable; `.env.example` lists them as `true`. Setting one to `false` is the emergency rollback path, and with a flag off `MapMode` can read false while `isNavigating` is true because the V2 chrome is flag-suppressed. `scripts/test-production-v2-defaults.ts` and `scripts/test-v1-v2-isolation.ts` guard the defaults and the boundary. Any navigation/arrival UI change must land in both V1 and V2 presentations or state why one is exempt (`KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`). A flags-off build has not been run by this documentation pass: SOURCE only.

Other flag/env: `EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL` and `EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC` (outside-routing proxy leg, see `NAVIGATION_AND_ROUTING.md`); `EXPO_PUBLIC_OFFLINE_MAP_POC=1` mounts the isolated MapLibre POC harness (`src/poc/OfflineMapPoc.tsx`) instead of the app and is off by default.

## Localization layer (`src/i18n`)

One catalog per area in `src/i18n/messages/<area>.ts`, created with `defineMessages` so every locale (`en`, `ur-Latn`, `ur`) must define every key (a compile error otherwise; `src/__tests__/Localization.test.ts` also checks key uniqueness across areas, plural forms and script per language). Keys are `<area>.<name>`; `{name}` placeholders are filled by `t(key, params)`; counts use `<key>_one` / `<key>_other` with `tn`. Components read copy and direction through `useI18n()` (`t`, `tn`, `locale`, `setLocale`, `dir`, `isRTL`) so they re-render when the language changes; non-React code uses `t()` / `getLocale()`. `LOCALES` carries each language's autonym and `dir`; `ur` is `rtl`, `en` and `ur-Latn` are `ltr`. In RTL, interpolated values are wrapped in first-strong isolates so Latin names and numbers stay readable. The first-launch language follows the phone when it is Urdu, otherwise English; the person changes it in Settings. `venueNames.ts` is the seam for localized venue names. The workflow for adding strings is in [`DEVELOPMENT.md`](DEVELOPMENT.md); the language/RTL guide will be `LOCALIZATION.md`. Not every screen reads from the catalogs yet: `scripts/hardcoded-strings.ts` and `src/__tests__/hardcodedStrings.baseline.json` track the remaining English literals (the baseline may only go down).

## Routing core

`RoutingServiceV2` and `OutsideStreetRoutingService` share `src/utils/AStar.ts` + `src/utils/MinHeap.ts` (heap-based A*). Gate selection is the single complete-journey cost path in `RoutingServiceV2`. `pointInPolygon` is still implemented independently in `RoutingService.ts`, `SnapToRoadService.ts` and `graphBuilder.ts` (low priority; consolidate if touching them).

## Misc decided points

- Gate-label zoom visibility is unified at zoom 15 as a side effect of the map redesign, not a separately reviewed product decision.
- `hasSeenMapOverview` is persisted but informational; `MapStartupController.resolveColdLaunchCamera` is kept only for its tests (production uses `resolveReturningLaunchCamera`).
