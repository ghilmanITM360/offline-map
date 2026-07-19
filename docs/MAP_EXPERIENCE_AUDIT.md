# Map Experience Audit

Pre-redesign audit. No code changed. Scope: current HomeScreen/DirectionsScreen/NavigationScreen/bottom-sheet/marker/layer architecture, mapped against the Google-Maps-style redesign target (persistent map, route-preview sheet, in-place nav mode, EN/UR labels, zoom LOD, satellite overlays, unified controls).

## 1. Current UX flow

Stack: `Splash → Permission → DownloadMap → Main(drawer: Home/Settings/Help/About) → Directions → Navigation → AppGuide → Error` (`src/navigation/RootNavigator.tsx:34-95`). `Directions` and `Navigation` are plain pushed `Stack.Screen`s — no modal presentation, no unmount-on-blur. HomeScreen's `MapView` stays mounted (invisible) under Directions.

Tap → nav sequence:

1. Tap block/gate on Home map → `handlePlaceSelect` (`HomeViewModel.ts:176-194`) sets `selectedPlace`, animates camera, opens `@gorhom/bottom-sheet` to 50% (`HomeScreen.tsx:627-670`).
2. Sheet's "Directions" button → full stack push to `DirectionsScreen` (`HomeScreen.tsx:386-394`).
3. `DirectionsScreen` (no MapView, pure form) auto-computes preview route into the zustand store (`DirectionsViewModel.ts:170-173, 302-304`).
4. "Show route on map" just calls `navigation.goBack()` (`DirectionsScreen.tsx:346-353`) — pops back to Home, which renders **its own separate** floating route-preview card (`HomeScreen.tsx:1135-1166`) with a **second, duplicate** "Start Navigation" button (`handleStartPreviewNavigation`, `HomeScreen.tsx:396-406`).
5. `NavigationScreen` picks V1/V2 variant and mounts **its own independent `MapView`** (`NavigationScreen.tsx:77`, `461`) — does not reuse Home's map instance.
6. Exit navigation calls `navigation.reset({ index: 0, routes: [{ name: 'Main' }] })` (`NavigationViewModelV2.ts:216-220`) — destroys and fully remounts HomeScreen/its map, rather than popping back to a live instance.

Net: up to 3 live `MapView` instances across one cycle; two independent "start navigation" code paths; the reset-on-exit actively fights any "same map persists" goal.

## 2. Map rendering

`react-native-maps` 1.20.1, `PROVIDER_GOOGLE` on Android. No reusable map component layer exists — `src/views/components/` only has `CustomDrawer.tsx`. All `Polygon`/`Marker`/`Polyline` JSX is inline and **duplicated** between `HomeScreen.tsx` (blocks `616-635`, labels `637-648`, gates `650-687`, rastas `552-614`, legacy v1 dev overlays `725-810`) and `NavigationScreen.tsx` (`615-729` for V2, `239-335` for V1) — already visibly diverged (Home's gate markers have 3-tier zoom LOD text; Nav's are one fixed style).

`V2MapRenderingService` (`src/services/V2MapRenderingService.ts`) does exist as a shared **data**-shaping layer (returns `V2BlockLayer`/`V2GateLayer`/`V2PolylineLayer`/`V2LabelLayer` arrays), consumed by both Home and NavigationScreenV2 — but the actual JSX/label-rendering is written out separately in each screen with no shared `<MapLabel>`/`<GateMarker>`/`<RastaPolyline>` component.

## 3. Localization

No i18n framework in `package.json` (no i18next/react-intl). No `LocalizationService`. **But the data layer is already bilingual**: `LocalizedLabel { en, ur?, romanUrdu? }` (`src/data/ijtema/types.ts:11-15`) populated with real Urdu across `blocks.ts`/`gates.ts`/`rastas.ts`/`specialRoutes.ts`/`centralPoints.ts`. `V2PlaceAdapter` already carries `name`/`urduName`/`secondaryLabel` forward into `Place`/`V2Place` (`V2PlaceAdapter.ts:83-85`), and the bottom-sheet place-detail panel already renders `urduName` (`HomeScreen.tsx:1182-1184`).

The gap is entirely at the **map-label rendering layer**: `V2MapRenderingService.getHomeLayers()` flattens each entity to a single English `label: string` (`V2MapRenderingService.ts:163, 176`) — on-map badges never show Urdu. `DirectionsScreen` also shows English name only (`DirectionsScreen.tsx:186`). A `settings.language` store field exists but is voice-instruction-only, not UI-wide (`useAppStore.ts:200`, `InstructionService.ts:141-163`) — its own copy says "Full app translation is not available yet." `StreetInstructionService.ts` already generates paired EN/UR turn-instruction text (`113-131`) — best existing precedent for the target `getLocalizedName()` pattern.

**Conclusion: `MapLocalizationService`/`getLocalizedName()` is a thin wrapper task, not a data migration** — the `LocalizedLabel` shape already covers Phase 4's requirements.

## 4. Bottom sheets / modals

`@gorhom/bottom-sheet` v5 installed, used exactly once: the Home place-details sheet (`HomeScreen.tsx:1168-1335`, snap points `15%/50%/92%`). Route-preview UI is a **separate, non-sheet** floating card (`styles.routePreviewCard`, `HomeScreen.tsx:1135-1166`) that explicitly closes the bottom sheet when active (`HomeScreen.tsx:361-364`). `DirectionsScreen` is a third, independent presentation (full pushed screen, plain `ScrollView`, no sheet). `Modal` (RN core) is used only for the arrival overlay in both nav variants (`NavigationScreen.tsx:442-454`, `827-839`).

Three different presentation mechanisms today for "info about a thing on the map" (gorhom sheet / hand-rolled card / pushed screen) — Phase 1's "Route Preview Bottom Sheet" needs to absorb both the route-preview card and DirectionsScreen's content into the existing gorhom sheet infra, not invent a fourth.

## 5. Zoom-based rendering

LOD logic already exists, centralized in `V2MapRenderingService` (`LOW_ZOOM=13, MEDIUM_ZOOM=15, HIGH_ZOOM=16.5`, `pickByZoom()` at lines 90-114), applied per-layer in `getHomeLayers()` (`285-300`). Two problems for Phase 6:

- **Duplicate threshold system**: `HomeScreen.tsx:653-657` has its own inline gate-label zoom branching (14/16.5) independent of the service's 13/15/16.5 — needs unifying before adding EN/UR dual-label-per-tier logic.
- **`NavigationScreenV2` never passes real zoom level** to the service (`NavigationScreen.tsx:493-501`, always defaults to zoom 15) — zoom-based LOD is effectively Home-only today; navigation-mode map is not zoom-reactive.
- Legacy v1 path has no LOD at all (dev overlays render unconditionally when toggled).

## 6. Map controls

All inline `Pressable`s in `HomeScreen.tsx`, no shared `MapControls` component. Right-side stack (`HomeScreen.tsx:1050-1105`): Layers button → **`Alert.alert` action sheet** (not an in-map panel) for blocks-layer/satellite/rasta-label toggles (`openLayerOptions`, `423-455`); compass reset; zoom +/−. Recenter lives in a **separately positioned** container (`1107-1117`). Vertical positions are chained manual pixel-offset math dependent on banner heights (`305-311`) — fragile, screen-specific.

`NavigationScreen` has its **own, non-shared** control set: only recenter + mute, redefined from scratch (`NavigationScreen.tsx:416-439/806-825`) — no zoom/compass/layer/satellite controls during navigation at all.

Satellite mode is a bare `mapType="satellite"` passthrough (`HomeScreen.tsx:500`, `NavigationScreen.tsx:207,586`) — no overlay-contrast/dimming system; Phase 11 ("satellite keeps overlays legible") is greenfield, not a fix.

## 7. Reusable foundation vs. breaking-change risk

**Keep / build on:**
- `V2MapRenderingService` — pure, stateless, already screen-agnostic. Natural seam for a shared `<MapLayers>` render component.
- `V2PlaceAdapter` — bilingual fields already flow end-to-end.
- `src/data/ijtema/*.ts` `LocalizedLabel` shape — redesign-ready, no data migration needed.
- Zustand store already centralizes `selectedPlace`/`activeRoute`/`routePlannerOrigin/Dest`/`isNavigating` across screens — reasonable foundation for a merged flow.
- `@gorhom/bottom-sheet` already working on Home.

**Breaking-change risk (ranked by blast radius):**
1. Three independent `MapView`+`mapRef` owners (Home, NavScreenV1, NavScreenV2) — no shared instance/provider. This is the core blocker for "same map becomes navigation mode."
2. `handleExit`'s `navigation.reset()` destroys/remounts Home's map rather than popping back — directly fights map persistence.
3. All marker/polygon/polyline JSX duplicated Home↔Navigation, already diverged — must extract to shared components before/alongside the redesign or drift worsens.
4. `DirectionsScreen` has zero map code — folding it into an over-map sheet is a structural navigation change (retiring a stack screen), not styling.
5. Two duplicate start-navigation code paths (`DirectionsViewModel.handleStartNavigation` vs `HomeScreen.handleStartPreviewNavigation`) — consolidation required, not additive.
6. Manual offset-chain control positioning, absent entirely on NavigationScreen — needs unifying for controls to persist into nav mode.
7. Two divergent zoom-threshold constants — unify before layering bilingual zoom-tier label logic on top.
8. NavigationScreenV2 not zoom-reactive — gap to close for LOD to apply during navigation.
9. No satellite-overlay-contrast system exists — new build, not a fix.

## Recommended sequencing

Given the risk ranking above, Phase 1 (route preview sheet) and the MapView-consolidation problem (#1/#2) are coupled — a route-preview sheet that later needs to "become" the navigation map requires solving map-instance sharing first, or Phase 2 (live nav mode) will hit the same rebuild-from-scratch problem Phase 1 was meant to fix. Suggest: extract shared map-layer components (#3) and unify zoom thresholds (#7) first (low-risk, no UX change, de-dupes Home/Nav drift), then tackle single-MapView persistence (#1/#2) as its own step before building the route-preview sheet on top of it — building the sheet against the current 3-MapView structure would mean redoing it once persistence lands.
