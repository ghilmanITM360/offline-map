# End-to-End User Journey Audit

Mapping the mission's journey template onto the real screens/overlays found in
`SCREEN_AND_COMPONENT_INVENTORY.md`. This is a structural map plus what prior-sprint
commits already touched — it is **not** a claim that representative elderly or
low-literacy attendees have been observed using the app. No such participant testing has
happened in this session or, as far as this branch's history shows, in the project so
far. Every step below is an expert/source-level assessment unless stated otherwise.

| Journey step | Screen/overlay | Prior fixes touching it | Audit state |
|---|---|---|---|
| 1. First launch | Splash | #158 (contrast, real logo) | PARTIALLY AUDITED |
| 2. Understand the app | Welcome | #153 (returning-user copy) | PARTIALLY AUDITED |
| 3. Permission ask | Permission | #153 (contrast/error handling) | PARTIALLY AUDITED |
| 4. Map download | DownloadMap | #159/#163 (fallback copy) | PARTIALLY AUDITED |
| 5. Find destination | LocationsDirectory + Home search | #154, #146 (this session) | PARTIALLY AUDITED |
| 6. Choose starting point | LocationSheet (routePreview mode, "Change Start") | none yet | NOT AUDITED |
| 7. Understand route/gate | LocationSheet route-ready card, gate options | none yet | NOT AUDITED |
| 8. Start navigation | LocationSheet "Start Navigation" button | none yet | NOT AUDITED |
| 9. Follow instructions | NavigationChrome V1/V2, NavigationMapLayers V1/V2 | none yet | NOT AUDITED — highest-priority next screen |
| 10. GPS/network problems | Map warning banner | #156 (live-region + copy) | PARTIALLY AUDITED |
| 11. Reach destination / Arrival | `mode === 'ARRIVAL'` overlays | none yet | NOT AUDITED |

## Cross-cutting observations (source-level, this session)

- **Routing dead-ends are already non-blocking by design** (#96, reused for #146): tapping
  an unavailable destination still opens its sheet and still lets `onOpenDirections` run;
  the sheet then shows `unavailableReason` as a banner, and the real refusal to route
  happens inside `RoutingServiceV2`/`DirectionsViewModel` (Codex-owned), surfacing as the
  sheet's existing "Route problem" + Retry card. This is a reasonable recovery path — the
  user isn't stuck, they see why, and can go back — but it has not been walked start-to-
  finish on a device in this session to confirm the copy reads clearly to a first-time user.
- **V1/V2 duplication surfaces at the exact moment attendees most need clarity**
  (navigation + arrival, steps 9 and 11) — two parallel component trees
  (`NavigationChromeV1`/`V2`, `NavigationMapLayersV1`/`V2`). Before any redesign work on
  these screens, the next session should first determine whether V1 is still reachable
  in production or is dead code, since redesigning a dead path would be wasted effort.
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
