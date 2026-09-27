# Screen and Component Inventory

Source of truth: actual code in `src/navigation/RootNavigator.tsx`, `src/views/screens/`,
and `src/views/components/`, read directly — not the historical mission brief's assumed
list. Branch `fix/claude-ui-accessibility-sprint`, HEAD at time of writing: `9b576a5`.

Status legend: **AUDITED** (Part-5-style deep pass done and recorded in
`DEEP_UI_UX_AUDIT.md`) · **PARTIALLY AUDITED** (specific findings fixed in a prior
sprint commit, but no full A–O pass yet) · **NOT AUDITED**.

## Stack screens (`RootStackParamList`)

| Screen | Component | Reached from | Status |
|---|---|---|---|
| Splash | `SplashScreen.tsx` | App cold start | PARTIALLY AUDITED — #158 (contrast, real logo) |
| Welcome | `WelcomeScreen.tsx` | Splash, first run or onboarding-read failure | PARTIALLY AUDITED — #153 (returning-user copy) |
| Permission | `PermissionScreen.tsx` | Welcome, or Splash with `revoked:true` | PARTIALLY AUDITED — #153 (contrast/error handling) |
| DownloadMap | `DownloadMapScreen.tsx` | Permission, Settings | PARTIALLY AUDITED — #159/#163 (unified fallback copy) |
| LocationsDirectory | `LocationsDirectoryScreen.tsx` | Drawer/Home search entry | PARTIALLY AUDITED — #154 (headings, Urdu search), #146 (gate visibility consistency, this session) |
| Main (Drawer) | see below | Post-onboarding default route | see Home/Settings/Help/About |
| AppGuide | `AppGuideScreen.tsx` | Drawer / Help | **AUDITED** — one confirmed defect fixed (unlabeled back button); guide copy, marker legend, warning-banner contrast all checked out, see `DEEP_UI_UX_AUDIT.md` |

## Drawer screens (inside `Main`)

| Screen | Component | Status |
|---|---|---|
| Home / Map | `HomeScreen.tsx` (95KB — map-first, all overlays below live inside it) | PARTIALLY AUDITED — #157 (map layer a11y names), Stage-3 selectability fixes (prior sprint) |
| Settings | `SettingsScreen.tsx` | PARTIALLY AUDITED — #155 (row semantics/copy) |
| Help | `HelpScreen.tsx` | PARTIALLY AUDITED — #155 |
| About | `AboutScreen.tsx` | PARTIALLY AUDITED — #155 |

## HomeScreen overlay/mode inventory (all rendered on the one persistent map, never separate screens — per `AGENTS.md`)

Confirmed by reading `HomeScreen.tsx` directly (not assumed):

- Base map layers: `BlockLayer`, `GateLayer`, `RastaLayer`, `SpecialRouteLayer`,
  `FacilityLayer`, `VenueBoundary`, `SatelliteDimOverlay`, `UserLocationMarker`,
  `MapLabelOverlay`, `OsmAttribution` — **AUDITED** this session (full component pass,
  not just #157's accessible-name fixes). `FacilityLayer`/`UserLocationMarker`/
  `VenueBoundary`/`SatelliteDimOverlay`/`OsmAttribution` are KEEP, no defect.
  `GateLayer`/`BlockLayer`/`RastaLayer`/`SpecialRouteLayer` each have a confirmed
  redundant-TalkBack-stop defect (their own tap-target accessibility duplicates
  `MapLabelOverlay`'s) — **not fixed this session**, real complexity found in the
  route-preview declutter system that needs resolving first; see `DEEP_UI_UX_AUDIT.md`
  "Base map layers" for full evidence and the recommended fix approach.
- `MapControls` / `MapControlsRecenter` — floating map buttons. **AUDITED this session**
  (Batch A, fast-track UI/UX mission) — real 48/56dp physical touch targets (KEEP), one
  confirmed redundant-TalkBack-stop defect fixed (helper badge), one justified motion
  addition implemented (recenter success spring, Reduce Motion aware). See
  `DEEP_UI_UX_AUDIT.md` Batch A.
- Navigation mode overlays: `NavigationMapLayersV2`/`V1`, `NavigationChromeV2`/`V1`,
  gated on `mode === 'NAVIGATION' || mode === 'ARRIVAL'`. **FULLY AUDITED for A–E across
  both V1 and V2** (B instruction wording, C map presentation, and a full arrival-
  experience pass completed this session — see `DEEP_UI_UX_AUDIT.md` FINDING
  V1V2-REACHABILITY, NAV-001 through NAV-004, B-001). F (accessibility) is covered for
  the source-verifiable parts (live-region contract, focus-trap modal, one-shot
  announcement); TalkBack's actual runtime behavior (does focus move onto the arrival
  card, does an assertive GPS_LOST announcement audibly cut off mid-instruction) is
  **NOT device-verified** — no emulator/device available this session, see the
  device-test checklist in `DEEP_UI_UX_AUDIT.md`. `MapControls`/recenter interaction
  outside navigation mode (Home/Map screen) still NOT AUDITED — see below.
  - **V1/V2 duplication — RESOLVED this session, not a dead-code question.** V1 is
    genuinely live in the current app: legacy Block destinations start navigation via
    `DirectionsViewModel.handleStartNavigation` (guarded `!isV2Destination`), which
    computes a `sourceVersion: 'v1'` route through the old `RoutingService`. V2 destinations
    (Gates/facilities, the newer `V2PlaceAdapter` model) start via
    `HomeScreen.handleStartPreviewNavigation` → `V2NavigationAdapter.fromPreview`, always
    tagged `sourceVersion: 'v2'`. Both write through the same store action
    (`startNavigation`), and `NavigationViewModel.ts:101` explicitly bails on its own route
    computation when `activeRoute.sourceVersion === 'v2'` — so at most one of `useNavigationOverlayV1`/`useNavigationOverlayV2`'s `route` is ever non-null. Full findings and the
    one fragility identified (mode-gating relies on ~10 repeated `mode !== 'NAVIGATION'`
    checks scattered through `HomeScreen.tsx`, not one shared guard) are in
    `DEEP_UI_UX_AUDIT.md`.
- `LocationSheet` (`mode: 'preview' | 'details' | 'routePreview'`) — single shared sheet
  for place preview, place details, and the old "Directions screen" content
  (`RoutePreviewSection`). **AUDITED** — full A–O pass this session on `RoutePreviewSection`
  and the route-ready card as a whole (start/destination selection and search, manual/
  automatic gate selection, route calculation, error/retry, Start Navigation), in addition
  to the prior #146 and manual-gate-picker (`d7a05c6`) passes. Two confirmed defects fixed
  (unavailable-candidate parity in inline search, route-result screen-reader
  announcement) — see `DEEP_UI_UX_AUDIT.md` Batch B (continued).
- `LayersSheet` — map layer toggle (satellite/graph-only etc.). **AUDITED this session** —
  read in full; already correct (OverlayRow a11y suppression, segmented-control
  `accessibilityState`, 56dp rows). KEEP, no defect. One latent question flagged, not
  fixed: `mapType: 'hybrid'` has no selected-state UI reflection — REQUIRES
  INVESTIGATION whether it's ever actually passed.
- `LocationTutorialTooltip` — first-use tooltip. **AUDITED this session** — one confirmed
  defect fixed (silent to screen readers, now announces via
  `AccessibilityInfo.announceForAccessibility`) and one inconsistency fixed (didn't use
  the app's own `useReducedMotion` hook, now does). See `DEEP_UI_UX_AUDIT.md` Batch A.
- Map warning banner (`styles.mapWarningBanner`) — GPS/connectivity status. PARTIALLY
  AUDITED — #156 gave these banners live-region semantics and end-user copy; full A–O
  pass not done.
- Diagnostics banner (`styles.diagnosticsBanner`, presumably dev-mode only) — NOT
  AUDITED, including whether it can ever leak into a production build's UI.
- Empty-state sheet ("Tap a block or search to see details") — NOT AUDITED.

## Directory components

- `DestinationRow.tsx` — shared row for Gates/Rastas/Shahr-e-Pindal/search results.
  AUDITED as part of #96 (prior sprint) and re-verified this session for #146: disabled
  state, muted styling, accessible label suffix, and reason subtitle are correct and
  reused, not re-implemented.
- Category chips, Recent-searches section, search bar — PARTIALLY AUDITED (#154
  headings/Urdu); full A–O pass not done.

## Known gap in this inventory

This pass was a structural read (imports, JSX conditionals, file list), not a full
Part-5 A–O usability audit of every row above. Only the screens/components marked
**AUDITED** in `DEEP_UI_UX_AUDIT.md` have had that deeper pass. Everything else here is
staged as **NOT AUDITED** honestly rather than assumed fine.

No Android emulator or physical device is available in this session's environment (only
an iOS Simulator tool and an in-app browser are available, neither of which runs this
Android/Expo app). Every finding below the structural level is therefore source-level
only until a real device/emulator pass happens — see `RUNTIME UNVERIFIED` markers in
`DEEP_UI_UX_AUDIT.md`.
