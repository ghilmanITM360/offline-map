# Premium Map Runtime UI/UX Fixes

**Spec:** User-approved runtime audit and implementation overrides from 2026-09-06.

**Goal:** Make existing `MapMode` authoritative for chrome, remove verified collision and warning defects, improve route/navigation/arrival hierarchy, and close scoped accessibility, responsive, security-log, and theme gaps without weakening routing/GIS architecture.

## Global Constraints

- Work only on `codex/premium-map-runtime-ui-fixes`, based on verified `origin/design/premium-map-ux` commit `5d3ddca775142bfcc12179707806e4c5f11b9995`.
- One shared `MapView`; no new mutable mode or mutable banner manager.
- Views render/forward only. ViewModels own route lifecycle. Services retain routing/provider/complete-journey ownership.
- Do not change routing ownership unless runtime reproduction or failing valid-reachable regression proves a defect.
- Do not change Google map style. Never expose or log credential characters.
- TDD: failing policy/behavior test before production changes. Jest/RNTL tests policy, state, visibility, a11y, modal, and theme—not arbitrary device pixels.
- Runtime owns 393/412dp geometry, safe-area, collision, sheet snap, font-scale, and pixel verification.
- No new dependencies. No automatic merge.
- Preserve pedestrian-only routing, outside provider order, manual-gate authority, valid-route retention, V1/V2 support, and confirmed coordinates.

## Task 1: Mode / Chrome Ownership

Create pure chrome policy from existing canonical `MapMode`. Write matrix tests first. Enforce:

- EXPLORE: search, chips, browse controls.
- SEARCH: search/results; suppress competing chips/controls.
- PLACE_SELECTED: selected place and LocationSheet; discovery chrome recedes.
- DETAILS: details surface owns attention.
- ROUTE_PREVIEW: route, preview sheet, Start, recenter; no Explore clutter.
- NAVIGATION: maneuver chrome, trip summary, Exit, recenter, justified compass; no search/chips/layers/zoom.
- ARRIVAL: arrival, destination, Done only; no search/chips/browse controls/stale nav chrome.

Severity: Exit/recenter collision P1-HIGH unless runtime proves navigation exit impossible/unreliable, wrong action unavoidable, trap, or safety-critical outcome. Runtime verify after focused tests.

## Task 2: Route Preview Lifecycle — Conditional

Before modifying `DirectionsViewModel`, preparation, cancellation, or ownership, prove defect by runtime reproduction or failing valid-reachable regression. Investigate DETAILS to Directions, Preview to Cancel, Preview to Back, rapid Directions to Cancel, rapid retry, Preview to Start, Exit to new destination, stale async result. If all pass and no runtime defect: `DEFER — CORE FUNCTIONALITY AUDIT`; no cleanup refactor.

## Task 3: Warning / Status Hierarchy and Security

Create pure priority selector over existing states. At most one top system/safety warning. Precedence: navigation safety; rerouting/operational failure; basemap/provider degradation; route/gate context; passive offline; dev diagnostics never product UI. Use exact approved copy. Keep route context inside route surface when appropriate.

Remove API-key preview generation/logging from `MapConfigResolver` and `MapConfigService`. Logs may contain presence, source, package, error class, authorization result; never credential characters. Add practical regression coverage.

## Task 4: Collision-Safe Map Controls

Use existing overlay/inset ownership and one derived geometry policy. Account for top chrome, warning slot, LocationSheet, RoutePreview, NavigationChrome V1/V2, safe areas. Per-mode controls: Explore full; selected/preview recenter only; navigation recenter plus conditional compass; arrival none. Targets at least 48dp; adjacent controls target 8dp. Unit-test pure math only; verify bounds at runtime.

## Task 5: Route Preview / Navigation / Arrival Hierarchy

Route Preview default exposes destination, ETA, distance, route, Start without 92% expansion and preserves useful map. Navigation order: maneuver, distance to maneuver, road/rasta detail, ETA/remaining distance, destination. Fix incomplete distance-unit truncation. Arrival calm and exclusive with clear destination and Done.

## Task 6: Accessibility / Responsive / Theme

First establish theme contract from `ThemeService`, `useTheme`, persisted setting, system integration, `Appearance`/`useColorScheme`, and Settings. Fix only contract violations. Verify roles, states, live regions, route-input labels, modal background hiding, Android `onRequestClose`, reduced motion through `AccessibilityInfo`, 48dp targets, font scale 1.0/1.3/2.0, and non-duplicative TalkBack announcements.

## Runtime and Final Gates

For each visible task: accepted before, implement, run, screenshot, inspect pixels and hierarchy bounds, compare to approved principles, fix, accepted after. Final runtime: 393dp, 412dp, larger secondary device; Explore, Search, Gate/Block/Rasta/Shahr-e-Pindal selected, Details, calculating if observable, Route Preview, Navigation, GPS warning, offline/provider fallback, Arrival, LayersSheet, and dark mode per actual contract.

Once restricted stock Google Maps authorization works, verify tiles, roads, labels, pan, zoom, overlays, selected marker, preview route, navigation route. If owner-side blocked, report separately; do not disguise with UI or weaken restrictions.

Final commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:components -- --runInBand`, `npm run test:all-gates-v2`, `npm run test:outside-street-gate-selection-cost-v2`, `npm run test:core-provider-routing-contract-v2`, `npm run test:reroute-v2`, `git diff --check`.

After each subsystem change record: Owner; Inputs/states; Why; Invariant; Regression test.
