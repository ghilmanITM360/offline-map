# Map-First Navigation Flow Implementation Plan

Status: **Design approved, not implemented.** No code changed by this document.

Scope: v2 map/routing path only (`EXPO_PUBLIC_USE_IJTEMA_V2_*` flags). v1 legacy stays untouched as the emergency-rollback fallback per `CLAUDE.md` — no parity work planned.

Explicitly out of scope: outside-to-gate routing *geometry* (straight-line beeline → road-following path, Option A/online vs Option B/offline-OSM per `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md`). That is a separate network/offline-architecture decision with its own risk profile and needs its own product decision first — not folded into this UI/rendering redesign.

Source material this plan reconciles: `docs/MAP_EXPERIENCE_AUDIT.md` (pre-redesign architecture audit), `docs/REAL_DEVICE_UX_AUDIT.md` (screenshot-level findings, fix-verification log), `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md` (outside-routing gap table, UI-only recommendations).

---

## Goal

One persistent `MapView`, Google-Maps-style: browsing, place detail, route preview, and live navigation are all modes of a single screen, not separate stack routes with independent map instances. Fixes the audit's #1-ranked breaking-change risk ("three independent `MapView`+`mapRef` owners... core blocker for 'same map becomes navigation mode'") at the root instead of working around it.

## Architecture

**Screen consolidation.** New `MapScreen.tsx` replaces `HomeScreen` as the Drawer's `Home` route. Internal state `screenMode: 'browse' | 'placeSelected' | 'routePreview' | 'navigating'`, held locally (or a non-persisted store slice) — must NOT enter `useAppStore`'s `partialize` allowlist, consistent with existing GPS/transient-UI-state exclusion.

`RootNavigator` changes: `Navigation` stack route removed. `DirectionsScreen.tsx` and `NavigationScreen.tsx` retired as routes; their logic ports into mode-conditional views/components rendered inside `MapScreen`. **Before deletion**, grep the full codebase for `navigation.navigate('Directions'`, `navigation.navigate('Navigation'`, and any `RootStackParamList` references to those route names (deep links, notifications, tests) — none currently known but must be confirmed empty before the routes are removed.

Hardware back button becomes mode-aware: confirm-exit dialog (existing `NavigationViewModelV2` behavior) fires only in `navigating` mode; all other modes get normal drawer/stack back behavior.

**Bottom sheet.** Single `@gorhom/bottom-sheet` instance (already installed, already used once on Home) with content swapped by `screenMode`:
- `browse` — hidden/collapsed
- `placeSelected` — current place-detail content (name, Urdu name, category, Directions button, Save/Share/Details)
- `routePreview` — merges current `DirectionsScreen` form content (origin selector, ETA/distance pills) with the current floating `routePreviewCard` into one sheet. Retires `DirectionsScreen.tsx` as a screen. Consolidates the two existing duplicate start-navigation code paths (`DirectionsViewModel.handleStartNavigation` and `HomeScreen.handleStartPreviewNavigation`) into one.

`navigating` mode keeps its own overlay UI (green instruction banner + bottom summary card) rather than being forced into the sheet — `REAL_DEVICE_UX_AUDIT.md` already rates this "the strongest screen in the app," closest to real turn-by-turn product; it just needs to live inside `MapScreen` instead of a separate screen component.

**Controls.** One shared `<MapControls>` component (layers/compass/zoom/recenter) replaces `HomeScreen`'s and `NavigationScreen`'s separately-defined, non-shared inline stacks. Directly closes the audit's gap: "`NavigationScreen` has its own, non-shared control set... no zoom/compass/layer/satellite controls during navigation at all." Position via the measured-offset (`onLayout`) pattern already proven for the banner-overlap fix (`REAL_DEVICE_UX_AUDIT.md` issue #2), generalized instead of magic-number offsets.

**Shared map layers.** Extract `<BlockLayer>`, `<GateLayer>`, `<RastaLayer>`, `<SpecialRouteLayer>` as real shared components (currently JSX duplicated and already-diverged between `HomeScreen.tsx` and `NavigationScreen.tsx` per the audit). Unify the two divergent zoom-threshold systems (`HomeScreen.tsx`'s inline 14/16.5 branch vs `V2MapRenderingService`'s centralized `LOW_ZOOM=13/MEDIUM_ZOOM=15/HIGH_ZOOM=16.5`) into the single `V2MapRenderingService` source.

**Label-clipping fix (attempt #8).** Root cause per `REAL_DEVICE_UX_AUDIT.md`: every prior fix (7 attempts, see `docs/TARGETED_FIX_SPRINT_REPORT.md` + this plan's own fix-verification log) kept the full "Gate NN"/"Block NN" text label as a `Marker` child, captured by react-native-maps' native Android marker-snapshot pipeline — that pipeline itself is the common failure point, not the sizing heuristic. New approach: `MapLabelOverlay` component — plain React Native `View`/`Text` positioned via manual lat/lng-to-screen-pixel projection, recomputed on `onRegionChangeComplete` (and possibly throttled `onPanDrag`), rendered *above* the `MapView`, not as `Marker` children. Bypasses the native snapshot path entirely. Icon-only markers (small, fixed-size) stay as native `Marker`s — only full-text labels move to the projected overlay, since icons aren't the reported clipping symptom.

**Risk flag:** react-native-maps' Android point-projection API availability (e.g. `MapView.pointForCoordinate` or equivalent) under this app's New-Architecture/Bridgeless runtime is unverified. This is the reason Phase 0 below is a time-boxed spike before the label-fix phase is committed to.

**Localization.** `MapLocalizationService.getLocalizedName(entity, language)` — thin wrapper, not a data migration, per the audit's own conclusion (`LocalizedLabel { en, ur?, romanUrdu? }` already populated across `blocks.ts`/`gates.ts`/`rastas.ts`/`specialRoutes.ts`/`centralPoints.ts`; `V2PlaceAdapter` already carries `urduName` end-to-end into the sheet). Pattern precedent: `StreetInstructionService.ts` already generates paired EN/UR turn-instruction text. Wires into `MapLabelOverlay` (on-map labels, including Rasta/Pindal naming — currently English-only on the map despite bilingual data) and into the route-preview sheet content (`DirectionsScreen.tsx:186` currently English-name-only).

**Open decision, not resolved by this plan:** `settings.language` exists today but is voice-instruction-only ("Full app translation is not available yet"). Reuse it for map-label language too, or add a separate map-label-language setting? Flagged for a product decision before Phase 6, not blocking earlier phases.

**Satellite.** Overlay-contrast/dimming system for legible labels over satellite imagery — greenfield, no existing code to build on. Sequenced last; lowest priority, no dependency from anything else.

## Phases

Ordered by dependency, per `MAP_EXPERIENCE_AUDIT.md`'s own risk-ranked sequencing recommendation.

| # | Phase | Depends on | Retires |
|---|---|---|---|
| 0 | Spike: verify lat/lng→pixel projection API on Android (react-native-maps + New Architecture) | — | — |
| 1 | Extract shared layer components (`BlockLayer`/`GateLayer`/`RastaLayer`/`SpecialRouteLayer`/`MapControls`); unify zoom-threshold constants into `V2MapRenderingService` | — | Duplicated inline JSX in `HomeScreen.tsx`/`NavigationScreen.tsx` |
| 2 | `MapScreen` state-machine skeleton — ports current Home browse+place-detail behavior in, no UX change yet | 1 | — |
| 3 | Route-preview sheet — merges `DirectionsScreen` + `routePreviewCard` into one sheet mode, consolidates dup start-nav paths | 2 | `DirectionsScreen.tsx` (route) |
| 4 | In-place navigation mode — ports live-nav logic (GPS follow, reroute, arrival, turn instructions, exit-confirm) into `MapScreen`; fixes `handleExit` to switch mode instead of `navigation.reset()` | 2, 3 | `NavigationScreen.tsx` (route) |
| 5 | Label-clip fix — `MapLabelOverlay`, wired into Phase 1's shared layer components | 0, 1 | `MapLabelBubble.tsx` attempt (already reverted) |
| 6 | Localization — `MapLocalizationService`, EN/UR on-map labels (blocks/gates/rastas/Pindal routes) + sheet content | 1, 5 | — |
| 7 | Polish — recenter/zoom control collision (`REAL_DEVICE_UX_AUDIT.md` #5, likely resolved as a side effect of Phase 1's shared `MapControls`); cold-start map-loading skeleton (#7); trace `BridgelessReactContext` LogBox warning (#3, informational, may correlate with Phase 5's native-snapshot bypass) | 1, 5 | — |
| 8 | Satellite overlay-contrast system | — (independent, sequenced last by priority only) | — |

Each phase gets its own `test:*` script subset run (per `CLAUDE.md`: `test:map-data-v2`, `test:navigation-graph-v2`, `test:entry-gate-routing`, `test:route-smoke-v2`, `test:production-v2-defaults`, `test:offline-v2`, `test:v1-v2-isolation` as applicable) **and** Android emulator visual QA per phase — not deferred to the end. `CLAUDE.md`'s own runtime-status rule applies: script tests passing is not a runtime PASS claim.

## Edge cases

- App backgrounded/foregrounded mid-`navigating` mode must not lose `screenMode` or GPS-follow state.
- Deep-link/notification code referencing `Directions`/`Navigation` route names must be confirmed absent before those routes are deleted (Phase 3/4).
- `screenMode` must stay out of `useAppStore`'s persisted `partialize` keys.

## Explicitly not covered

- Outside-to-gate routing geometry (Option A/B decision) — separate initiative, `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md`.
- v1 legacy map/nav UI — stays as-is, untouched rollback fallback.
- Pre-navigation "Recommended Entry Gate" confirmation card and two-color outside/inside polyline — named in `OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md` as low-difficulty UI items; not included here since this plan was scoped to exclude outside-routing work entirely. Revisit inclusion if that scope call changes.
