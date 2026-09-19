# Current Handoff

_Last updated: 2026-09-19_

## What just happened

`integration/navigation-correctness-reconciliation` (GPS observation freshness,
historical-fix rejection, terminal ETA correctness, hybrid inside-leg progress —
AUD-05/AUD-10/AUD-12/NAV-P0-001) was merged into `integration/ijtema-clean-baseline`
and pushed. Runtime verification (stale-fix rejection, fresh-fix acceptance,
background/resume x2, short offline journey) passed on the exact reconciliation
APK; see prior session's NAV-P0-001 report for the runtime evidence.

## Gate reconciliation (this session)

Ported from `final/karachi-ijtema`'s verified ground-truth work, onto the
release branch:

- **GATE_03**: relocated to owner-supplied coordinate; Rasta02 extended with
  two surveyed points (R2-06/R2-07). Now routable to 42/42 blocks.
- **GATE_17**: connected via the branched R7/R8 ground-truth topology
  (`RastaTopology` segments/junctions schema in `rastas.ts`/`graphBuilder.ts`/
  `types.ts`). Now routable to 42/42 blocks.
- **GATE_18**: still `BLOCKED — no valid graph connector within 320m`.
  Status: `FIELD DATA REQUIRED`. No fabricated connector exists anywhere in
  the repo's history; do not create one without real survey data.
- **GATE_19**: still `BLOCKED — ground_truth_required`, a deliberate,
  regression-tested safety hold (`connectorStatus: 'ground_truth_required'`
  in `gates.ts`). Status: `FIELD VERIFICATION REQUIRED`. Do not connect
  without physical ground truth.
- **GATE_20/GATE_21**: no connector defect. Their "suspiciously long route"
  concern was a gate-*selection* algorithm bug (nearest-gate-by-approach-only,
  blind to internal destination cost), already fixed and merged into `main`
  via `e4fec1b`/`2298b04` before this session — see
  `docs/CORE_ROUTING_DECISION.md` ("Known OSM counterexample"). Classified
  `VALID LONG ROUTE`, no action needed.

Full gate matrix after porting: 16/18 `PASS` (all reaching 42/42 blocks),
2/18 `BLOCKED` (Gate18, Gate19) — matches `final/karachi-ijtema`'s live
matrix exactly. Validated with 462/462 Jest, 118/118 `test:*` scripts,
clean typecheck/lint.

A handful of unrelated downstream test scripts had stale hardcoded
assumptions (rasta polyline counts, `onPressRasta` id wiring, a flawed
Gate20 route-cost comparison) that broke once Gate03/17 connected and the
Rasta rendering layer started emitting real per-segment polylines; these
were reconciled against `final/karachi-ijtema`'s already-corrected versions
of the same assertions — see commit `345da1a` for the itemized list.

## Known open items (not fixed here — filed for later)

- **P2 basemap watchdog UX timing** — the 7s Google-Maps-load watchdog can
  false-fail on slow/software-rendered devices even though tiles later load
  successfully. Not a core navigation blocker (GRAPH_ONLY navigation is fully
  independent of the Google basemap). Tracked:
  https://github.com/ghilmanITM360/offline-map/issues/28
- **Google Cloud Maps API key restrictions** — owner verification required
  (cannot be inspected from this environment). Checklist:
  - Package: `com.aicrafted.karachiijtema`
  - Debug SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
  - Verify in Google Cloud Console: Maps SDK for Android enabled; billing/
    project active; API key's API restriction includes Maps SDK for Android;
    application restriction is "Android apps" with the package name above;
    SHA-1 matches the one above.
  - Do not conclude the key itself is misconfigured merely from a `referer is
    null` log line — tiles subsequently loaded in the same runtime session
    during verification.
- **Stashed, unrelated in-progress work** — a pre-existing uncommitted
  `HomeScreen.tsx`/test/script change plus some docs and stray build
  artifacts (`android/app/src/main/assets/index.android.bundle`, react-navigation
  drawable PNGs) were sitting staged/uncommitted on this branch before this
  session's merge and were stashed (not discarded, not committed) to get a
  clean tree for the merge: `git stash list` →
  `pre-merge-safety-stash: uncommitted release-branch work (...)`. Whoever
  owns that work should `git stash pop` and finish/commit or discard it
  intentionally — it was not evaluated or ported as part of this session.

## Explicitly not started this session

MapLibre migration, UI redesign, dependency upgrades, production signing,
iOS migration — per instruction, out of scope for this atomic session.
