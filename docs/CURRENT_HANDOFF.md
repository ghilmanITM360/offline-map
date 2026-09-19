# Current Handoff

_Last updated: 2026-09-19 (REL-001 remediation)_

## Latest session — REL-001 fixed, verdict BLOCKED → verdict lifted for core navigation

`fix/rel001-bottom-sheet-transition-race` (commit `15f7c88`, branched from release
HEAD `e16f267`) fixes REL-001. **Not yet merged into
`integration/ijtema-clean-baseline`** — awaiting explicit go-ahead to push/merge
(destructive-adjacent shared-branch action, out of scope for an unattended fix
session per this repo's own git safety rules).

**ROOT CAUSE (confirmed by code trace, not just by matching stash naming):**
`HomeScreen.tsx`'s `handleSheetDismiss` computed
`dismissedIdentity = closingSheetIdentityRef.current ?? currentSheetIdentityRef.current`.
`closingSheetIdentityRef` is only populated by the sheet's own `onChange(index < 0)`
callback; when Directions/Change Destination re-presents an already-open sheet
under a new identity, the resulting native close/change echo can arrive **after**
`currentSheetIdentityRef` has already advanced to the new identity, and
`closingSheetIdentityRef` is still null at that point. `dismissedIdentity` then
falls back to the ALREADY-NEW identity, so the guard
(`programmaticDismiss.identity === dismissedIdentity`, comparing the OLD captured
identity against this NEW fallback) mismatches, the early-return does not fire,
and `resetDismissedSheetState` wipes the state that had already moved on. This
is a late-native-echo identity race, not a distance- or destination-type-specific
bug — it explains why Gate (near/far) and Block Directions all reproduced it.

**FIX:** ported (cherry-picked, then manually reconciled around the
OsmAttribution/`activePreviewRoute` relocation the nav-correctness merge had
since introduced) the already-committed, already-tested
`fix/sheet-dismiss-echo-guard` branch's commit `e7c5803`. Replaces the
identity-comparison guard with `activeSheetTransitionRef` (from/to identity +
reason) plus a `pendingNativeSheetEchoRef` swallow gate keyed on "is a native
present/close round-trip outstanding" rather than per-identity matching, so a
superseding transition keeps inheriting protection instead of the guard going
stale.

**TESTS:** the branch's own 4 `P0-1`..`P0-4` regression tests (late echo after
Open Directions, after Change Destination, after rapid reselection, after
Block→Gate selection) — confirmed RED against unfixed `e16f267` HomeScreen.tsx
(all 4 failed, reproducing the exact "sheet collapses to empty state" defect),
GREEN after the fix. Full suite after fix: **466/466 Jest** (462 baseline + 4
new), all `test:*` validation scripts green, 16/18 routable gate matrix and
Gate 18/19 blocks unchanged, clean typecheck/lint, clean `git diff --check`.

**RUNTIME:** built `fix/rel001-bottom-sheet-transition-race` as a debug-signed,
bundled-JS APK (`./gradlew assembleDebug -PbundleInDebug=true` after
`expo export:embed --dev false`), SHA-256
`037fa114d74d8a9651eabe111160e7d82c68225793b4fbeb9cfd234bcdd39573`, installed
on `emulator-5554`. Live-reproduced all three originally-broken cases —
outside-origin Gate 08 Directions, outside-origin Gate 21 Directions, Block 5
Directions — each now correctly opens Route Preview instead of collapsing the
sheet. Also live-exercised the Block→Gate Change-Destination race (the exact
P0-2 class) and completed a full trip: Directions → Route Preview → Start
Navigation → (via `adb emu geo fix` to Gate 08's coordinate) → canonical
"You've Arrived!" → Done → clean return to Explore → second trip (Block 9,
direct-guide fallback since outside road routing was unavailable in this
run) → Start Navigation, no state bleed from trip 1. Host was under heavy
load during this session (repeated Pixel-Launcher ANRs, load average
14-17) — none of that affected the app process itself.

**Not repeated this session** (unnecessary — no source outside
`HomeScreen.tsx`/its tests changed, and the merge only reconciled test/script
edits, not app logic): the full 25-phase production-readiness audit, GIS/gate
inventory, network/security/permissions review, Google Maps config review —
see the prior session's `docs/audit/2026-09-final-production-readiness-audit.md`
for that, still valid except for its REL-001 section.

**Remaining before this branch can be considered mergeable and the release
verdict fully updated:** owner/user approval to push the fix branch and merge
it into `integration/ijtema-clean-baseline`. REL-002 (Privacy/Terms
placeholders) and REL-003 (unmerged `mapPadding` attribution fix) are
unrelated pre-existing P1s, not touched this session, and remain open.

## Prior session — production-readiness audit, verdict BLOCKED

Full report: `docs/audit/2026-09-final-production-readiness-audit.md`. Field-test
template: `docs/testing/IJTEMA_FIELD_ACCEPTANCE.md`.

**Verdict: BLOCKED.** A new P0 was found and reproduced live 4× on a fresh
`e16f267` build: tapping **Directions** on a Gate's LocationSheet, when the
current location resolves outside the venue (the normal case for a pilgrim
arriving from outside), **closes the bottom sheet instead of opening the
route preview** — for both a near gate (Gate 08) and a far gate (Gate 21),
ruling out a trivial-distance edge case. Tapping Directions on a Block
produced no visible transition at all. This blocks reaching Start
Navigation/Arrival/Done entirely through the standard UI, so Phase 3
(cold-launch-to-Arrival E2E) and Phase 4 (NAV-P0-001 merged-artifact smoke)
could not be completed this session — see the audit report §4 for full
reproduction steps and evidence.

Leading (unconfirmed) root-cause hypothesis: this matches the pre-merge
safety stash's own already-written, already-test-covered fix for a
"BottomSheet identity-transition race" — the release still carries the
older `programmaticSheetDismissRef` identity-**comparison** dismiss guard;
the stash replaces it with `activeSheetTransitionRef`/
`pendingNativeSheetEchoRef` round-trip-**outstanding** tracking, with 4 new
regression tests (`P0-1`..`P0-4`) that reproduce exactly this class of
failure. Not confirmed by code inspection during this audit (root cause
requires actually applying and testing the fix, out of scope for a
read-only audit) — flagged as the leading candidate, not a certainty.

Everything else checked this session — GIS/gate inventory (16/18 routable,
2/18 correctly blocked by design), OSM tile policy, network domain audit
(core internal navigation confirmed zero required network calls),
permissions, security triage, Android build/signing config, target SDK
(36, passes), documentation truth — came back solid, with a handful of new
P1/P2/P3 items filed in the audit report's issue register (REL-002 through
REL-008): notably a Privacy Policy/Terms placeholder blocking Play
submission (REL-002), and the Google-attribution `mapPadding` fix
(ATTR-001) still not merged despite existing, reviewed, on 3 branches
(REL-003).

**Not done this session** (per instruction, or blocked by REL-001):
accessibility/TalkBack pass, performance/battery profiling, iOS build/run,
any code fix (this was audit-only).

## Prior session — navigation-correctness reconciliation + gate reconciliation

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
