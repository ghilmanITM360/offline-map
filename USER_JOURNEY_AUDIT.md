# End-to-End User Journey Audit

Mapping the mission's journey template onto the real screens/overlays found in
`SCREEN_AND_COMPONENT_INVENTORY.md`. This is a structural map plus what prior-sprint
commits already touched — it is **not** a claim that representative elderly or
low-literacy attendees have been observed using the app. No such participant testing has
happened in this session or, as far as this branch's history shows, in the project so
far. Every step below is an expert/source-level assessment unless stated otherwise.

| Journey step | Screen/overlay | Prior fixes touching it | Audit state |
|---|---|---|---|
| 1. First launch | Splash | #158 (contrast, real logo) | AUDITED — no interactive elements, no defect |
| 2. Understand the app | Welcome | #153 (returning-user copy), Continue button role/label fix (this session) | AUDITED |
| 3. Permission ask | Permission | #153 (contrast/error handling), both actions' role/label fix (this session) | AUDITED |
| 4. Map download | DownloadMap | #159/#163 (fallback copy), all 9 action buttons' role/label fix (this session) | AUDITED |
| 5. Find destination | LocationsDirectory + Home search | #154, #146 (this session) | PARTIALLY AUDITED |
| 6. Choose starting point | LocationSheet (routePreview mode, "Change Start") | unavailable-candidate parity fix (this session) | FULLY AUDITED — start-search inline results now match Directory's #146 muted/disabled/reason treatment for unroutable places |
| 7. Understand route/gate | LocationSheet route-ready card, gate options | manual gate-picker a11y fix, unavailable-candidate parity, route-result announcement (this session) | FULLY AUDITED — manual gate selection exposes current choice via `accessibilityState`; `OutsideRouteStatusCard` wording confirmed accurate; route-ready card's full information hierarchy assessed and confirmed sound (KEEP); route result now announced to screen readers |
| 8. Start navigation | LocationSheet "Start Navigation" button | none yet (assessed as part of route-ready card pass) | AUDITED — primary CTA, disabled-reason text, and v1/v2 dispatch all traced; no defect found |
| 9. Follow instructions | NavigationChrome V1/V2, NavigationMapLayers V1/V2 | B-001 (next-step truncation, this session) | FULLY AUDITED for A–E, both versions (see `DEEP_UI_UX_AUDIT.md` NAV-001–004, B-001). F (accessibility) source-verified only — TalkBack runtime behavior NOT device-verified. |
| 10. GPS/network problems | Map warning banner | #156 (live-region + copy) | PARTIALLY AUDITED — GPS_LOST/weak-GPS/reroute/basemap priority chain and live-region contract fully traced and tested this session (NAV-001/002); V1 lacks V2's background-resume staleness fix (NAV-004, Codex dependency) |
| 11. Reach destination / Arrival | `mode === 'ARRIVAL'` overlays | none yet | FULLY AUDITED this session — normal arrival, repeated-arrival, rapid-cancellation, destination-change/new-journey, and blank-destination (NAV-003) edge cases all traced with code citations; background-return (NAV-004) and rapid-mode-transition timing flagged as device-testing checklist items, not assumed safe |

## Cross-cutting observations (source-level, this session)

- **Routing dead-ends are already non-blocking by design** (#96, reused for #146): tapping
  an unavailable destination still opens its sheet and still lets `onOpenDirections` run;
  the sheet then shows `unavailableReason` as a banner, and the real refusal to route
  happens inside `RoutingServiceV2`/`DirectionsViewModel` (Codex-owned), surfacing as the
  sheet's existing "Route problem" + Retry card. This is a reasonable recovery path — the
  user isn't stuck, they see why, and can go back — but it has not been walked start-to-
  finish on a device in this session to confirm the copy reads clearly to a first-time user.
- **V1/V2 duplication at the exact moment attendees most need clarity (navigation +
  arrival, steps 9 and 11) — RESOLVED, not wasted-effort risk.** Both `NavigationChromeV1`/
  `V2` and `NavigationMapLayersV1`/`V2` are live: V1 for legacy Block destinations, V2 for
  the newer Gates/facility model. Mutual exclusion is structural (`sourceVersion` guard),
  not a runtime coincidence — see `DEEP_UI_UX_AUDIT.md` FINDING V1V2-REACHABILITY. Any
  redesign of the active-navigation/arrival experience now needs to cover both, not just V2.
- **Outside-venue routing chain** (`outside coordinate -> prepareOutsideRoutingPlan ->
  Google walking-route proxy -> bundled OSM fallback -> labelled direct-direction guide ->
  finalizeOutsideRoutingPlan`, per `AGENTS.md`) has UI surfaces in `OutsideRouteStatusCard`
  and the gate-choice UI inside `LocationSheet`'s route-ready card — not yet audited for
  whether "direct-direction guide" (the last-resort fallback) reads as reassuring or
  alarming to a first-time, non-technical user. Flagged for the next pass.

## Runtime verification state

**RUNTIME UNVERIFIED for every step above.** No Android emulator or physical device is
available in this session's environment. This document will be updated with actual
observed behavior once a device/emulator pass is possible — see
`CLAUDE_CODEX_HANDOFF.md` for what that pass should specifically check first
(navigation/arrival, given it's currently the least-audited, highest-stakes part of the
journey).
