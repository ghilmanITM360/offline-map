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
| AppGuide | `AppGuideScreen.tsx` | Drawer / Help | NOT AUDITED |

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
  `MapLabelOverlay`, `OsmAttribution` — NOT AUDITED as a full component pass beyond
  #157's accessible-name fixes and the prior sprint's touch-target/selectability work.
- `MapControls` / `MapControlsRecenter` — floating map buttons. NOT AUDITED.
- Navigation mode overlays: `NavigationMapLayersV2`/`V1`, `NavigationChromeV2`/`V1`,
  gated on `mode === 'NAVIGATION' || mode === 'ARRIVAL'`. NOT AUDITED — this is the
  active-navigation and arrival experience; highest priority for the next pass since
  it's mid-journey, not before/after it.
  - **V1/V2 duplication is itself a finding to investigate**: two parallel chrome/layer
    component trees exist. Whether both are still genuinely reachable at runtime or one
    is legacy-dead-weight is a question for the next audit pass, not answered here.
- `LocationSheet` (`mode: 'preview' | 'details' | 'routePreview'`) — single shared sheet
  for place preview, place details, and the old "Directions screen" content
  (`RoutePreviewSection`). PARTIALLY AUDITED this session (read in full for #146 —
  confirmed it already renders `unavailableReason` as a warning banner and never blocks
  `onPress`/Directions on `isRoutable`; real routing-eligibility refusal happens deeper,
  in `RoutingServiceV2`, which is Codex-owned and untouched).
- `LayersSheet` — map layer toggle (satellite/graph-only etc.). NOT AUDITED.
- `LocationTutorialTooltip` — first-use tooltip. NOT AUDITED.
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
