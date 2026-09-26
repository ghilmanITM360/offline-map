# UI/UX Audit Progress

Tracks #126, #128, #144 against actual verified work. Do not mark any of these DONE
based on this document alone — see each issue's own acceptance criteria.

## Directions/Start-Navigation history reconciliation

**REL-001** (bottom-sheet dismiss-race): fix commit `15f7c88`, merged via PR #29,
`mergedAt` 2026-09-19T09:19:39Z. **REL-003** (attribution clipping): fix commit
`d9dd4bf`, merged via PR #30, 2026-09-20. Both are present in current HEAD `1599c32`
(2026-09-23) with automated regression coverage.

A separate, user-provided historical test report describes approximately 1 successful
Directions transition in 21 attempts, source commit `962f425`, branch
`docs/ticket-reconciliation-matrix`, APK SHA-256
`59349690c359287c67f0d6f679fb1c64ea38a2946ffb421fd21a3dac7af63be7`, package
`com.aicrafted.karachiijtema`, on Pixel 7 Pro API 36 and Pixel 3a API 36 emulators, plus
a separate Start Navigation reachability problem.

This is classified as **USER-PROVIDED HISTORICAL TEST REPORT** — not independently
verified runtime evidence, but not dismissed as nonexistent either. Verification
performed this session:
- Commit `962f425` does not exist anywhere in this repository's full commit graph
  (`git rev-list --all`), including on `origin/docs/ticket-reconciliation-matrix`
  (current tip `a8994e4`). **PRIMARY RUNTIME ARTIFACT UNAVAILABLE** — the exact commit
  cannot be located to compare against REL-001's fix commit.
- No APK file, screenshot, log, or terminal artifact matching the cited SHA-256 was
  found anywhere in this repository, its git history, or `.superpowers/`.
- No GitHub issue or repository doc anywhere contains the "21 attempts" figure or a
  distinct "Start Navigation reachability" defect matching that description (searched
  `gh issue list --search` across multiple terms and full-text grep of all local docs
  and the recovered `.superpowers/` audit).
- The closest real, distinct, git-verified defect is **#109** (closed) — "Start
  Navigation permanently blocked as stale when GPS jitter stays under recalculate
  threshold," fixed via `62d13fa`. Root cause: `DirectionsViewModel.routeOriginLocation`
  only refreshed on ≥20m movement, so a stationary user's origin-freshness timestamp
  aged past `MAX_LIVE_FIX_AGE_MS` and permanently disabled the button. This is
  mechanistically different from REL-001 (a sheet-dismiss race) and is not literally
  "renders outside the reachable area" — it is the closest match found, not a confirmed
  match.

**Conclusion:** HISTORICAL REPORT EXISTS. PRIMARY RUNTIME ARTIFACT UNAVAILABLE. CURRENT
RUNTIME REVERIFICATION REQUIRED. Recommend a bounded test (10-15 Directions-transition
attempts across 2-3 destinations on current HEAD, not 20+ blind retries) rather than
assuming either that REL-001 fully resolved the class of failure the report describes,
or that the report's number is stale/irrelevant.

## Findings reconciled against existing GitHub issues

| Finding | Status | Ticket disposition |
|---|---|---|
| P1-1 Outside-venue banner contrast (`#F29900`) | STILL PRESENT | MISSING ISSUE — no existing issue covers this; a new ticket is warranted (independently actionable, distinct acceptance criteria: replace with `#946500`) |
| P1-2 LayersSheet accessibility | ALREADY FIXED | EXACTLY COVERED, resolved — #65 (closed) |
| P1-3 GateLayer/FacilityLayer bare marker a11y | STILL PRESENT | MISSING ISSUE — no existing issue covers this |
| P1-4 LocationSheet action-row a11y | ALREADY FIXED | EXACTLY COVERED, resolved — #65 (closed) |
| P1-5 SearchBarField font-scale clipping | PARTIALLY FIXED | EXACTLY COVERED for the fix itself — #65 (closed); the remaining "confirm at 1.8x visually" gap has no open issue — RUNTIME VERIFICATION REQUIRED, foldable into #128's existing checklist rather than a new ticket |
| P1-6 GPS banner stacking | ALREADY FIXED | EXACTLY COVERED, resolved — #66 (closed) |
| P2s (6 items) | mostly INSUFFICIENT EVIDENCE (not re-verified this pass) | PARENT CHECKLIST SUFFICIENT — fold into #128's existing checklist, no new tickets until re-verified |
| Basemap failure across all 6 captures | NOT TESTED against current HEAD | no existing issue found; likely an emulator/API-key environment issue rather than app defect — needs a working capture environment before it can even be triaged as app-side or not |
| North-up/zoom control overlap | RUNTIME REVERIFICATION REQUIRED | no existing issue found — MISSING ISSUE if reconfirmed on a fresh capture |
| Blue false-affordance badge text | RUNTIME REVERIFICATION REQUIRED | no existing issue found — MISSING ISSUE if reconfirmed |
| True LocationSheet Details view never captured | n/a (evidence gap, not a defect) | tracked here and in the coverage matrix; not a ticket, a testing gap |
| "1-in-21 Directions" / Start Navigation reachability | UNVERIFIABLE as stated | closest match is closed #109; if a distinct defect is reconfirmed via the recommended bounded test, it needs its own new issue — not yet warranted without reconfirmation |

No new GitHub issues were created this session, per this task's explicit constraint.
Two findings (P1-1, P1-3) are independently actionable with distinct acceptance criteria
and no existing coverage — these are the strongest new-ticket candidates, drafted below
for owner review, not filed.

### Draft ticket 1 — Outside-venue banner contrast

- Title: Outside-Ijtema banner uses WCAG-AA-failing `#F29900`/white text
- Evidence: `src/views/screens/HomeScreen.tsx:1979` (`outsideVenueBanner.backgroundColor`),
  used at line 1627; same color documented as failing at `src/theme/colors.ts:91-94` and
  already replaced elsewhere with `#946500`
- Repro: navigate outside the venue boundary while GPS is active; banner renders with
  white text on `#F29900`
- Scope: swap to `staticColors.weakGpsBackground` (`#946500`) or equivalent vetted color
- Priority: P1 (contrast/accessibility, affects a wayfinding prompt for disoriented
  arriving pedestrians)
- Acceptance criteria: banner background passes WCAG AA (≥4.5:1) for its white text at
  the sizes used; component test asserts the color
- Parent: #126; related: #128 (readability checklist item)

### Draft ticket 2 — GateLayer/FacilityLayer suppressed markers lack accessible names

- Title: Suppressed/unselected gate and facility map markers have no accessibility label
- Evidence: `src/views/components/map/GateLayer.tsx` (Marker for suppressed/unselected
  gates, no `accessibilityLabel`/`title`); same gap confirmed in `FacilityLayer.tsx`
  (zero `accessibilityLabel` occurrences)
- Repro: enable TalkBack, explore the map by touch near a suppressed gate/facility marker
- Scope: add `accessibilityLabel`/`title` to both files' bare `Marker` components
- Priority: P1 (screen reader — silent, unlabeled interactive object)
- Acceptance criteria: TalkBack announces a meaningful name when focusing these markers;
  component test asserts the prop is set
- Parent: #126; related: #128 (accessibility checklist item)

## #126 status

Parent epic. Progress this session: recovered and reconciled a prior, previously-untracked
audit; confirmed 4 of its 6 P1 findings already fixed (via #65, #66); confirmed 2 remain
open with draft tickets above; no acceptance criteria for #126 itself are met or claimed
met. Not DONE.

## #128 status

Comprehensive audit checklist. This session's reconciliation work constitutes genuine,
actively-underway progress: 6 of 16 planned screens have emulator + source + partial
automated-test coverage (with caveats — broken basemap, mislabeled Details capture); 10
screens remain wholly untested; several checklist items (touch target sizing, readability,
accessibility beyond #65/#100/#102) now have partial evidence via the reconciled findings
above. **Recommend #128 move to IN PROGRESS** — this reflects real work performed, not
historical screenshots alone. Project-board update NOT performed this session: prior
attempts in this workstream were blocked by a missing `read:project` OAuth scope on the
`gh` CLI token; unchanged and not re-tested this session. Full acceptance criteria (all
checklist items ticked) are far from met — not DONE.

## #144 status

Unchanged. `FOLLOW_HEADING` confirmed (prior session, source-verified, not re-read this
session) to use GPS course-over-ground, not a magnetometer. No work began on #144 this
session — its status is preserved as-is per this task's explicit instruction.

## Documents/evidence preserved this session

- `.superpowers/premium-map-audit/` — left in place, untouched, not deleted
- `docs/audit/ui-ux/HISTORICAL_AUDIT_INVENTORY.md` — new, this session
- `docs/audit/ui-ux/HISTORICAL_FINDINGS_RECONCILIATION.md` — new, this session
- `docs/audit/ui-ux/UI_UX_COVERAGE_MATRIX.md` — new, this session
- `docs/audit/ui-ux/UI_UX_AUDIT_PROGRESS.md` — new, this session (this file)
- `docs/audit/ui-ux/screenshots/*.png` — the 6 original screenshots, copied after a
  manual sensitivity check (no PII/device-identifying content found)
- All committed on branch `docs/ui-ux-audit-reconciliation`, off canonical HEAD `1599c32`,
  not merged, not pushed. `MASTER_TICKET_MATRIX.md` (on PR #138's branch) was not modified
  or duplicated by this archive — this is a separate, narrower set of documents scoped
  specifically to the recovered audit.

## Git/PR state at time of this work

- Branch: `docs/ui-ux-audit-reconciliation`, created off `integration/ijtema-clean-baseline`
  at `1599c32` (matched `origin/integration/ijtema-clean-baseline` exactly at creation time)
- PR #121 (`fix/v2-data-structural-validation`): OPEN, MERGEABLE, not touched
- PR #138 (`docs/ticket-reconciliation-matrix`): OPEN, MERGEABLE, not touched, not
  overwritten
- Neither PR was merged. No application source was modified. No fixes were implemented.

## Remaining audit work / next atomic task

Ranked candidates, per this task's Phase 12:
1. Re-capture the 6 historical screens with a working basemap (unblocks visual judgments
   across the entire existing capture set).
2. Capture the true LocationSheet Details view via the correct tap target (never actually
   captured despite being logged as captured).
3. Audit Locations Directory and first-run onboarding (Splash/Welcome/Permissions/Download
   Map) — zero coverage from either audit.
4. Continue through Route Preview, Active Navigation, Arrival, GPS warning, and Offline
   fallback — highest-risk, zero visual evidence, currently RUNTIME BLOCKED — NOT VERIFIED.

Not started this session, per this task's explicit "do not start the next task" instruction.
