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

## Items likely needing Codex input (not yet confirmed — flagged for the next audit pass)

- **V1/V2 navigation duplication**: `NavigationChromeV1`/`V2` and
  `NavigationMapLayersV1`/`V2` both render conditionally in `HomeScreen`. Before Claude
  can audit or redesign the active-navigation/arrival experience, someone needs to
  confirm whether the V1 path is still genuinely reachable (e.g. for legacy/graph-only
  venue data) or is dead weight. If it's routing/data-driven (which version renders
  depends on `RoutingServiceV2`/data availability), that's a question for Codex to
  answer, not something Claude should infer from UI code alone.
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
