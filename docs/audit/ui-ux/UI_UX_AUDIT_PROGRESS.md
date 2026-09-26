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
| P1-1 Outside-venue banner contrast (`#F29900`) | STILL PRESENT | Filed as #150 (parent #126) |
| P1-2 LayersSheet accessibility | ALREADY FIXED | EXACTLY COVERED, resolved — #65 (closed) |
| P1-3 GateLayer/FacilityLayer bare marker a11y | STILL PRESENT | Filed as #151 (parent #126) |
| P1-4 LocationSheet action-row a11y | ALREADY FIXED | EXACTLY COVERED, resolved — #65 (closed) |
| P1-5 SearchBarField font-scale clipping | PARTIALLY FIXED | EXACTLY COVERED for the fix itself — #65 (closed); the remaining "confirm at 1.8x visually" gap has no open issue — RUNTIME VERIFICATION REQUIRED, foldable into #128's existing checklist rather than a new ticket |
| P1-6 GPS banner stacking | ALREADY FIXED | EXACTLY COVERED, resolved — #66 (closed) |
| P2s (6 items) | mostly INSUFFICIENT EVIDENCE (not re-verified this pass) | PARENT CHECKLIST SUFFICIENT — fold into #128's existing checklist, no new tickets until re-verified |
| Basemap failure across all 6 captures | NOT TESTED against current HEAD | no existing issue found; likely an emulator/API-key environment issue rather than app defect — needs a working capture environment before it can even be triaged as app-side or not |
| North-up/zoom control overlap | RUNTIME REVERIFICATION REQUIRED | no existing issue found — MISSING ISSUE if reconfirmed on a fresh capture |
| Blue false-affordance badge text | RUNTIME REVERIFICATION REQUIRED | no existing issue found — MISSING ISSUE if reconfirmed |
| True LocationSheet Details view never captured | n/a (evidence gap, not a defect) | tracked here and in the coverage matrix; not a ticket, a testing gap |
| "1-in-21 Directions" / Start Navigation reachability | UNVERIFIABLE as stated | closest match is closed #109; if a distinct defect is reconfirmed via the recommended bounded test, it needs its own new issue — not yet warranted without reconfirmation |

Two findings (P1-1, P1-3) were independently actionable with distinct acceptance criteria
and no existing coverage. Per this session's explicit instruction to file them once
verified and uncovered, both were created:

- [#150](https://github.com/ghilmanITM360/offline-map/issues/150) — Outside-Ijtema banner
  contrast (P1-1)
- [#151](https://github.com/ghilmanITM360/offline-map/issues/151) — GateLayer/FacilityLayer
  marker accessibility (P1-3)

Both parent #126; both reference #128 as related. The draft content below is preserved as
the original evidence trail; the filed issues carry the same content.

### Draft ticket 1 — Outside-venue banner contrast (filed as #150)

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

### Draft ticket 2 — GateLayer/FacilityLayer suppressed markers lack accessible names (filed as #151)

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
audit; confirmed 3 of its 6 P1 findings already fixed (via #65, #66); 1 partially fixed;
confirmed 2 remain open, now filed as #150/#151; no acceptance criteria for #126 itself
are met or claimed met. Not DONE.

**Count correction (this pass):** an earlier version of this document, the #152 PR body,
and the #126/#128 issue comments all stated "4 already fixed." Re-verified line-by-line
against `HISTORICAL_FINDINGS_RECONCILIATION.md`: exactly 3 findings are classified ALREADY
FIXED (P1-2, P1-4, P1-6). The 6-item total (3 fixed / 1 partial / 2 present) was always
correct in the reconciliation doc itself — the miscount was only in these summary
restatements, now corrected in all four places.

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
  at `1599c32` (matched `origin/integration/ijtema-clean-baseline` exactly at creation time),
  now pushed to `origin/docs/ui-ux-audit-reconciliation` and a documentation PR opened
  targeting `integration/ijtema-clean-baseline`, linked to #126 and #128
- PR #121 (`fix/v2-data-structural-validation`): OPEN, MERGEABLE, not touched
- PR #138 (`docs/ticket-reconciliation-matrix`): OPEN, MERGEABLE, not touched, not
  overwritten — this audit PR is a separate, narrower doc set and does not duplicate it
- Neither #121 nor #138 was merged. No application source was modified. No fixes were
  implemented.
- New: #150, #151 filed this session (see above). See `UX_REQUIREMENT_MATRIX.md` for the
  full UX-001–UX-015 requirement-to-issue mapping.

## Session update: first-install flow + Locations Directory forensic audit

This session performed the full source-level audit item 3 below was flagging as
uncovered. Findings filed as two new issues:

- [#153](https://github.com/ghilmanITM360/offline-map/issues/153) — First-install/
  returning-user launch flow: 5 findings (divergent post-setup destination for
  first-time vs. returning users; permission-revocation re-trigger indistinguishable
  from first-ask; storage-failure silently repeats onboarding; two uncoordinated
  redirect timers on DownloadMapScreen; permission-skip consequence shown only in a
  transient Alert). Covers UX-001, UX-002.
- [#154](https://github.com/ghilmanITM360/offline-map/issues/154) — Locations Directory:
  4 findings (section headings lack heading-level accessibility; English-only chrome
  around already-bilingual destination names; computed unavailable-reason text
  discarded before reaching the user; test-coverage gaps for Urdu search and heading
  a11y). Covers UX-003, and folds in the Directory-specific slice of UX-007 (copy audit).

Both filed after re-verifying no existing issue covered this ground (grepped past
"Mimbar" concern — zero matches in `src/`, no mislabeling risk found). Full evidence in
`UX_REQUIREMENT_MATRIX.md`. All findings are **SOURCE INSPECTED only** — none confirmed
at runtime (no Android emulator/device tooling this session).

### Low-literacy usability pass (expert walkthrough — not real-user testing)

This is a source-level expert review, not a representative-attendee usability study. No
participants were involved; do not treat this as UX-010's field validation.

- **Splash/Welcome/Permission**: primary action per screen is a single button
  ("Continue", "Allow Location"/"Continue Without Location") — clear. Permission denial
  copy ("We need this to show your position on the map and guide you to your
  destination") avoids jargon. Gap: the consequence of skipping is only in a transient
  Alert (#153 Finding 5) — a low-literacy or hurried user who dismisses it quickly has no
  persistent reminder.
- **DownloadMap**: "Use Venue Map Only" / "Use Online Mode" wording assumes the reader
  understands what an offline map vs. online mode means — not verified against a
  non-technical reader's mental model; flagged, not fixed.
- **Locations Directory**: category chips (Blocks/Gates/Rastas/Shahr-e-Pindal) and the
  search box are the two primary paths; both are single, obvious actions. Numeric search
  ("24" → Block 24) is a strong low-literacy-friendly affordance — no reading of category
  names required. Gap: English-only chrome (#154 Finding 2) means a reader who can't read
  English gets no readable instructions, chip labels, or empty-state guidance, even though
  the actual destination names they're searching for are bilingual.
- **GPS/internet unavailable**: not evaluated this pass for the Directory or launch flow
  specifically — Directory has no offline/error state because its data is static and
  unaffected by connectivity (see #154); the GPS/permission-denial path is covered under
  Permission above.
- **Mistake recovery**: back-navigation and hardware-back on Directory both work without
  data loss (query/filter simply clears); Permission and DownloadMap both allow
  re-choosing without a forced restart.

**Flag to owner**: none of the above constitutes real low-literacy-user validation —
UX-010 explicitly requires representative-user or structured field testing, which this
session cannot provide.

### Runtime test cases prepared (not executed — no Android tooling this session)

No emulator was available. These are prepared, reproducible test cases for whenever one
is: keep source-level conclusions (above) and runtime conclusions (below) separate — do
not treat this list as evidence of anything having been run.

| Case | Steps | Expected result | Screenshot needed |
|---|---|---|---|
| Fresh installation | Clear app data, launch | Splash → Welcome → Permission → (DownloadMap or Main) | Each screen in sequence |
| Returning-user launch | Complete setup once, force-quit, relaunch | Splash → LocationsDirectory directly | Splash → Directory transition |
| Permission granted | Tap "Allow Location" | Proceeds to next screen (Main or DownloadMap depending on map state) | Permission screen + post-grant screen |
| Permission denied (soft) | Deny, `canAskAgain: true` | "Location isn't on yet" Alert shown, flow still proceeds on skip | Alert + resulting screen |
| Permission denied (permanent) | Deny twice / deny "don't ask again" | "Location permission required" Alert with "Open Settings" | Alert |
| Offline launch | Airplane mode, fresh install | Onboarding proceeds; DownloadMap shows no "Use Online Mode" option (requires `hasInternet`) | DownloadMap screen |
| Interrupted setup | Force-quit mid-Welcome or mid-Permission, relaunch | Resumes at the correct screen per persisted flags, or repeats Welcome if storage read failed (#153 Finding 3) | Screen on relaunch |
| Directory loading | Open Directory | No loading spinner (by design — data is synchronous/static); sections render immediately | Directory on open |
| Empty search | Search a nonsense string | `No matches for "..."` + hint text | Empty-state screen |
| Urdu/English search | Search a destination by its Urdu name/alias | Result matches via substring (no fuzzy match on Urdu) | Search results |
| Unavailable destination | Tap a non-routable gate/block | Row shows muted styling + "· Not yet available for routing"; still opens preview/detail | Destination row + resulting sheet |

Permission-revocation and storage-failure re-trigger scenarios from #153 (Findings 2, 3)
should also be added to this list once a controllable test harness for OS-level
permission state exists.

Also corrected a P1-count error this session: an earlier pass of this document, the
#152 PR body, and the #126/#128 issue comments all said "4 already fixed" — the actual,
re-verified count is 3 (P1-2, P1-4, P1-6). Fixed in all four places.

## Session update: UX-007 copy audit extended to Settings/Help/About/App Guide

Continuation of the copy audit named as this session's next atomic task above. Read
`SettingsScreen.tsx`, `HelpScreen.tsx`, `AboutScreen.tsx`, `AppGuideScreen.tsx` in full.
Filed as #155 (new), 4 findings:

1. Zero accessibility props (`accessibilityRole`/`Label`/`State`) on any interactive row
   across all three screens with interactive rows (`SettingItem`, `HelpItem`, `linkItem`)
   — confirmed via grep, zero matches in all four files. Same defect class as the P1-2/P1-4
   findings already fixed elsewhere (#65), never extended to these screens.
2. `AboutScreen.tsx:81` claims "Urdu & English Language Support" as a key feature, but
   Settings/Help/About are 100% English and App Guide's Urdu is limited to section titles
   (body text is English-only) — same English-only-chrome pattern already tracked for the
   Locations Directory in #154, now confirmed on four more screens.
3. HelpScreen's "Send Feedback" row implies an in-app feedback channel; the actual behavior
   is an Alert redirecting to the registration desk in person — label/behavior mismatch.
4. `SettingsScreen.tsx:248`'s North-up description ("disable heading-up rotation") uses
   map-orientation jargon not explained in plain terms.

Checked and ruled out: the TODO placeholder URLs (Privacy Policy, Terms of Service,
Official Website) are already tracked as an owner-action item in #47 — not duplicated.
No automated tests exist for any of the four screens (confirmed via file search).

UX-007 remaining gap after this pass: error/offline/GPS status message strings outside
the launch flow and Directory (`NavigationChromeV2` banners, DownloadMap error states).

## Session update: UX-007 copy audit extended to error/offline/GPS status messages, #156 filed

Read `NavigationChromeV1.tsx`/`NavigationChromeV2.tsx` (status-banner sections),
`HomeScreen.tsx`'s map-warning banner section, `MapConfigResolver.ts`, and
`DownloadMapScreen.tsx` in full. Filed #156 with 4 findings:

1. `MapConfigResolver.ts:46-49`'s `GOOGLE_MAPS_LOAD_FAILED_MESSAGE` ("Check Google Cloud
   restrictions and Maps SDK for Android") and `GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE` are
   developer-facing diagnostic strings rendered verbatim to end users via `HomeScreen.tsx`'s
   `mapWarningBanner` — worse than prior jargon findings since it's addressed to a developer,
   not an attendee.
2. GPS_LOST/weak-GPS/reroute/map-unavailable banners in both NavigationChrome variants have
   no `accessibilityLiveRegion` or `announceForAccessibility` call, unlike the arrival
   announcement added for #64 — a screen-reader user gets no signal of GPS loss or a reroute
   during active navigation. Confirmed no test covers this (`NavigationChromeV2.test.tsx`
   only asserts banner text, not announcements).
3. `DownloadMapScreen.tsx:157`'s "Graph-only map works offline" uses internal
   routing-data-model jargon.
4. `DownloadMapScreen.tsx` is English-only chrome apart from its title — same pattern as
   #154/#155, now confirmed on this screen too.

One near-duplicate was caught before filing: this audit independently found
`DownloadMapScreen.tsx` has zero accessibility props on any control, then discovered that
exact gap was already tracked as **NAV-UX-004** under #128 (9 controls, this pass counted
8 — count discrepancy noted, not re-filed). #156 documents this as "checked, already
covered" rather than duplicating it.

UX-007 is now source-audited across all four identified screen groups (launch flow,
Directory, Settings/Help/About/App Guide, error/offline/GPS banners) — see
`UX_REQUIREMENT_MATRIX.md`'s UX-007 row for the closing status. No emulator was available
this session; all of #153/#154/#155/#156's findings remain runtime-unconfirmed.

## Remaining audit work / next atomic task

Ranked candidates, per this task's Phase 12:
1. Re-capture the 6 historical screens with a working basemap (unblocks visual judgments
   across the entire existing capture set).
2. Capture the true LocationSheet Details view via the correct tap target (never actually
   captured despite being logged as captured).
3. ~~Audit Locations Directory and first-run onboarding~~ — done this session, source-level
   (see above); runtime confirmation still needed.
4. Continue through Route Preview, Active Navigation, Arrival, GPS warning, and Offline
   fallback — highest-risk, zero visual evidence, currently RUNTIME BLOCKED — NOT VERIFIED.

Not started this session, per this task's explicit "do not start the next task" instruction.
