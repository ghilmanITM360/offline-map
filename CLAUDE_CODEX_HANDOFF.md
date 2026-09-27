# Claude ↔ Codex Handoff

Claude owns UI/UX/visual/accessibility. Codex owns routing, navigation algorithms, GPS,
gate-selection calculations, outside-routing providers, venue data integrity,
performance, and release engineering. Nothing below asks Codex to change behavior
without Claude first stating the precise UI-facing problem and why it can't be solved
UI-side alone.

## #146 (this session) — no Codex action needed

Resolved entirely UI-side: directory browse now passes the same
`includeUnavailableGates: true` option to `V2PlaceAdapter` that search already used.
No routing eligibility, gate coordinate, or connector data changed. Flagging here only
so Codex sees the same gate now appears (muted, disabled) in one more UI surface than
before, in case that assumption mattered anywhere on the routing side — it shouldn't,
since `isRoutable` computation (`gate.routingStatus === 'routable' && hasGraphConnection`)
was not touched.

## Open items requiring owner (not Codex) product decisions

Carried from prior sessions, not re-investigated this session (no new evidence):
PERM-001/002/003/007/008, #153 Finding 1, #154 Findings 2/3, #155 bilingual coverage,
#156 Finding 4, WEL-001–006, #127, SPLASH-UX-003/004, F005. These are UI/product
scope, not Codex scope — listed here for completeness, not as a Codex ask.

## Resolved this session — no Codex action needed

- **V1/V2 navigation duplication**: answered entirely from source, no Codex question
  needed after all. `NavigationChromeV1`/`V2` and `NavigationMapLayersV1`/`V2` both render
  conditionally in `HomeScreen`, and both are genuinely live — V1 for legacy Block
  destinations (`DirectionsViewModel.handleStartNavigation`, guarded `!isV2Destination`),
  V2 for the newer Gates/facility model (`HomeScreen.handleStartPreviewNavigation` →
  `V2NavigationAdapter.fromPreview`). Mutual exclusion is enforced by a `sourceVersion`
  check in `NavigationViewModel.ts:101` (UI-owned legacy file), not by anything in
  `RoutingServiceV2` or other Codex-owned code — full trace in `DEEP_UI_UX_AUDIT.md`
  FINDING V1V2-REACHABILITY. Flagging here only for visibility, since the previous
  session guessed this might need a Codex answer and it didn't.

## Fast-track UI/UX mission (Batch A/B) — no new Codex items

Home/Map (`MapControls`, `LayersSheet`, `LocationTutorialTooltip`) and the manual gate-
picker sub-section of Route Preview were audited and fixed this segment — all
accessibility-wiring fixes, entirely UI-side. `OutsideRouteStatusCard` wording was
re-checked against the mission's specific worry (implying a verified street route) and
confirmed accurate; no Codex clarification was needed to settle it. NAV-004 (above)
remains the one open Codex question. See `DEEP_UI_UX_AUDIT.md` Batch A/B for detail.

## New this session — factual question for Codex

- **NAV-004 — should v1 (legacy) navigation get the same background-resume GPS-staleness
  fix as v2?** `NavigationViewModelV2.ts` has an `AppState.addEventListener('change', ...)`
  handler that forces an immediate fresh GPS fix and marks `GPS_LOST` immediately on
  foreground resume (fixing stale progress/ETA after backgrounding mid-walk — see
  `scripts/test-navigation-background-resume.ts`). `NavigationViewModel.ts` (v1, legacy
  Block navigation) has no equivalent — confirmed by grepping the whole `src` tree for
  `AppState`, which returns only `NavigationViewModelV2.ts`, `GPSManagerService.ts`,
  `useAppStore.ts`, and `SettingsScreen.tsx`. This is GPS-staleness detection and
  forced-refix logic, Codex's territory per this handoff's own ownership split, not a UI
  change Claude can make. Question: is v1 traffic low enough that this gap is acceptable
  as-is, or should the same resume handler be ported to `NavigationViewModel.ts`? Full
  detail in `DEEP_UI_UX_AUDIT.md` FINDING NAV-004.

## Items likely needing Codex input (not yet confirmed — flagged for the next audit pass)

- **Outside-routing fallback chain UX**: the direct-direction guide is the last resort in
  `outside coordinate -> ... -> labelled direct-direction guide -> finalizeOutsideRoutingPlan`.
  Whether its current UI framing (`OutsideRouteStatusCard`) correctly reflects what the
  hybrid orchestrator guarantees at that stage (accuracy, confidence, gate eligibility)
  hasn't been cross-checked against the orchestrator's actual contract this session —
  flagged, not asserted as a problem.

Neither item above is a request to change Codex-owned logic yet — both need a factual
answer from Codex (or from reading Codex's code, next session) before Claude can decide
if any UI change is warranted.

## Boundaries respected this session

No Codex worktree, routing algorithm, GPS logic, or navigation business rule was read
for modification purposes (only read where necessary to confirm a UI fix doesn't
accidentally rely on or break routing behavior — e.g. confirming `isRoutable` stays
false for ground-truth-required gates regardless of the `includeUnavailableGates` UI
visibility flag). Nothing pushed, merged, or force-anything. No GitHub issue closed.
