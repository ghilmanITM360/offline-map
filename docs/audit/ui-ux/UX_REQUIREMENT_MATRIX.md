# UX Requirement Matrix (UX-001 – UX-015)

Maps the 15 owner-specified UX requirements (this session's audit brief) to existing
GitHub issues, current implementation evidence, and verification status. IDs are stable
per the owner's instruction and must not be renumbered in future updates.

Priorities shown are **OWNER-PROPOSED** exactly as specified in the brief; where this
session's evidence suggests a different priority, that is called out separately per
requirement rather than silently overwriting the owner's number.

Coverage types used: EXACT EXISTING ISSUE, EXISTING ISSUE CHECKLIST, EXISTING SUB-ISSUE,
NEW ISSUE REQUIRED, ALREADY DONE WITH EVIDENCE, PARTIAL COVERAGE, RUNTIME BLOCKED, FIELD
DATA REQUIRED, OWNER DECISION REQUIRED.

Verification states used: NOT STARTED, SOURCE INSPECTED, AUTOMATED TEST VERIFIED,
EMULATOR VERIFIED, PHYSICAL DEVICE VERIFIED, FIELD VERIFIED, PARTIALLY AUDITED, RUNTIME
BLOCKED, FIELD DATA REQUIRED, OWNER DECISION REQUIRED, COMPLETE.

| UX ID | Requirement | Owner priority | Current issue(s) | Parent | Coverage type | Verification status | Missing coverage | Runtime dependency | Next action |
|---|---|---|---|---|---|---|---|---|---|
| UX-001 | Splash → Setup → Directory first-install flow | P1 | #153 (new, this session) | #126 / #128 | EXACT EXISTING ISSUE | SOURCE INSPECTED (full flow traced: `RootNavigator`, `SplashScreen`, `StartupManager`, `WelcomeViewModel`, `PermissionViewModel`, `DownloadMapViewModel`); 5 findings filed, none runtime-confirmed | Emulator/device walkthrough of fresh-install path to visually confirm the 5 filed findings | Emulator/device to walk cold install once available |
| UX-002 | Normal launch → Directory (returning user) | P1 | #153 (new, this session) | #126 / #128 | EXACT EXISTING ISSUE | SOURCE INSPECTED (same trace as UX-001 — returning-user path shares `StartupManager.resolve`) | Emulator confirmation of the permission-revocation re-trigger and storage-failure fallback scenarios | Emulator warm-start test, plus a permission-revocation test | Same next step as UX-001 — both share #153 |
| UX-003 | Locations Directory forensic audit | P1 | #154 (new, this session); #146 (narrower Directory/search disagreement, open); #96 (non-routable tap affordance, closed) | #126 / #128 | EXISTING SUB-ISSUE (#154) + PARTIAL COVERAGE (#146) | SOURCE INSPECTED (full screen read: `LocationsDirectoryScreen.tsx`, `DestinationRow.tsx`, `DestinationBlockGrid.tsx`, test file); 4 findings filed in #154 | Emulator/device confirmation of the 4 filed findings; small-screen rendering not yet checked | Emulator/device to visually confirm #154's findings | See #154 for full findings |
| UX-004 | Search/categories/scalability | P1 | #119 (search + venue-graph-construction latency/memory benchmark) — this **is** the "existing scalability benchmark ticket" the brief refers to | #126 / #128 | EXACT EXISTING ISSUE (for scale/perf half); UX half (Urdu/alias/duplicate-name search quality) uncovered | PARTIALLY AUDITED (SearchBarField component-level via #65; search-matching logic now source-traced in #154 — exact-substring + Levenshtein-2 for English, substring-only for Urdu, numeric exact-match short-circuit) | Result-hierarchy/duplicate-name UX still not evaluated at runtime; no test exercises an actual Urdu query string | None for UX half; #119 owns the perf/scale half | Do not duplicate #119; if further search-quality gaps are found, fold into #128's checklist, not a new ticket |
| UX-005 | Deep usability audit of every screen | P1 | #128 (core-flow forensic audit) | #126 | EXACT EXISTING ISSUE CHECKLIST | PARTIALLY AUDITED — 6 of ~24 screens/states have any evidence (see `UI_UX_COVERAGE_MATRIX.md`) | 18 screens/states remain UNTESTED or RUNTIME BLOCKED | Emulator/device for the untested screens | Continue screen-by-screen work under #128; ranked order in Work Planning below |
| UX-006 | Audit every reusable UI component | P1 | #128 (checklist covers touch targets, a11y, banners implicitly) | #126 | PARTIAL COVERAGE | PARTIALLY AUDITED — see component inventory below; ~8 of many components have explicit coverage | Cards, modals/dialogs, loading/error components, arrival components not yet inventoried | None for source read; emulator for runtime behavior | Extend component inventory below in a future pass; do not open a ticket per component (anti-spam, per #126/#128's own scope notes) |
| UX-007 | Every user-facing label/message/text, incl. Mimbar-mislabeling risk | P1 | #153, #154, #155, #156 (new, this session); #105 (closed) is one past example of a wording defect | #126 / #128 | PARTIAL COVERAGE across #153/#154/#155/#156 | AUDITED (source-only, all identified screens/message sources covered) — grepped all of `src/` case-insensitively for "Mimbar": **zero matches, no mislabeling risk found**; launch-flow and Directory copy findings in #153/#154; Settings/Help/About/App Guide findings in #155; error/offline/GPS status-message findings in #156 (`MapConfigResolver.ts`'s dev-facing "Check Google Cloud restrictions and Maps SDK for Android" string shown verbatim to end users; GPS_LOST/weak-GPS/reroute banners in both NavigationChrome variants have no screen-reader live-region/announcement; "Graph-only" jargon; DownloadMapScreen is English-only chrome — DownloadMapScreen's separate zero-accessibility-props gap was independently found but turned out to already be tracked as NAV-UX-004 under #128, so #156 does not duplicate it) | None remaining at the source-inspection level; all four flagged screen groups (launch flow, Directory, Settings/Help/About/App Guide, error/offline/GPS banners) now have filed findings | None to continue at source level; emulator/device/TalkBack runtime confirmation of #153/#154/#155/#156's findings remains outstanding | UX-007's source-level copy audit is complete for this pass. Next atomic task is runtime/TalkBack verification of #153–#156 findings, not further source reading — no emulator was available this session |
| UX-008 | Buttons/actions clarity and necessity | P1 | #128 checklist ("touch target sizing"), NAV-UX-003 (Settings deep-link not wired, folded into #128) | #126 / #128 | PARTIAL COVERAGE | PARTIALLY AUDITED — Save/Share/Details/LayersSheet controls verified via #65; Directions/Start/Recenter/Compass/Exit/Done not systematically reviewed as a set | Comprehensive interactive-element pass across the 7 named controls (Directions, Start Navigation, Change Starting Point, Recenter, Compass, Exit, Done) | Emulator for reachability/feedback confirmation | Do this as one pass across #128, not per-button tickets |
| UX-009 | Loading/error/empty/disabled states | P1 | #128 checklist (explicit line items), #143 (reroute stuck state, open), #146 (empty/disagreement in Directory, open), #95 (arrival detection design question, open) | #126 / #128 | EXISTING ISSUE CHECKLIST + PARTIAL COVERAGE via #143/#146/#95 | PARTIALLY AUDITED — GPS_LOST/weak-GPS states fixed and tested (#66); most other states (route failure, unroutable, rerouting-failure loop, field-blocked empty state) unverified at runtime | Route-calc failure, offline-map-unavailable, interrupted-journey states never captured | Emulator/device | Reconcile #143 and #146 explicitly under #128 rather than treating as separate audit scope |
| UX-010 | Layman/low-literacy usability pass | P1 | #128 (NAV-UX-005 sub-item already flags "no documented low-literacy design consideration") | #126 / #128 | EXISTING ISSUE CHECKLIST, incomplete | FIELD DATA REQUIRED | No representative-user or even expert-walkthrough task-based evaluation performed | Representative-user or structured expert-walkthrough session | Flag explicitly to owner: this requirement cannot be honestly closed by source inspection alone |
| UX-011 | Elderly usability, readability, touch targets | P2 | #128 checklist ("Readability... Touch target sizing"), P1-5 SearchBarField font-scale (partially fixed, #65) | #126 / #128 | PARTIAL COVERAGE | PARTIALLY AUDITED — one component (SearchBarField) has a partial fix; no systematic touch-target audit across the app | Tap-target dimension audit across all interactive elements; outdoor-readability and one-handed-operation review | Physical device outdoors for readability; emulator for tap-target measurement | Fold into #128; do not split |
| UX-012 | Remove duplicate/unnecessary choices | P2 | none — explicit checklist below instead of a ticket, per this session's instruction | #126 | OWNER DECISION REQUIRED | PARTIALLY AUDITED — see explicit checklist in "UX-012 audit checklist" section below | Full app-wide audit for redundant choices beyond the launch flow not yet done | None to gather more evidence from the launch flow; requires product judgment to act on what's found | Owner reviews the checklist below; do not create a ticket until a specific simplification is approved |
| UX-013 | Route Preview clarity | P1 | none exact; historical P2-5 (cognitive overload, up to 4 stacked cards) folded into #128 | #126 / #128 | PARTIAL COVERAGE | RUNTIME BLOCKED — Route Preview has **never** been screenshotted or emulator-verified by either audit pass (highest-priority missing capture per both) | Full runtime capture and clarity review | Emulator/device — highest-priority next capture | See Work Planning batch D |
| UX-014 | Active Navigation clarity (incl. Compass/FOLLOW_HEADING) | P1 | #144 (compass, exact sub-scope), #128 checklist (general nav chrome), #66 (closed, banner-stacking fix) | #126 / #128, #144 independent | PARTIAL COVERAGE + EXACT EXISTING ISSUE (#144 for compass slice only) | PARTIALLY AUDITED — GPS/weak-GPS banner precedence fixed and tested; turn-by-turn instruction/compass/off-route/rerouting UX never runtime-captured | Full Active Navigation runtime capture; #144's own owner decision (implement/relabel/remove) still open | Emulator/device | Do not duplicate #144 — it already owns the compass-labeling sub-question exactly as instructed |
| UX-015 | Arrival and Done clarity | P1 | #111 (closed, arrival-latch fix), #64 (closed, Back/TalkBack in arrival modal), #95 (open, arrival-detection design question) | #126 / #128 | PARTIAL COVERAGE + ALREADY DONE WITH EVIDENCE (for the two closed fixes) | PARTIALLY AUDITED — two known defect classes fixed and tested; overall arrival screen clarity (message wording, zero-distance edge cases, second-journey restart) never runtime-captured | Full Arrival/Done runtime capture and copy review | Emulator/device, ideally with `adb emu geo fix` near a destination | #95 already tracks the flat-distance design question; do not open a duplicate |

## UX-012 audit checklist (owner-decision process, no ticket yet)

Source evidence gathered so far, from the launch-flow trace (see #153). Each item needs
an explicit owner call before any implementation is scoped — this audit does not
recommend a specific outcome, only surfaces the candidates:

| Candidate | Evidence | Is it actually duplicate/unnecessary, or intentional? |
|---|---|---|
| First-time users land on `Main` after setup; returning users land on `LocationsDirectory` for the equivalent "setup done" moment | `PermissionViewModel.ts:52,56`, `DownloadMapViewModel.ts:97-103` vs. `StartupManager.ts:48-49` | OWNER DECISION REQUIRED — is this divergence intentional, or should first-time completion also land on Directory? (Same finding as #153 Finding 1.) |
| Permission-skip requires two taps: "Continue Without Location" then a confirmation Alert | `PermissionScreen.tsx:56-62`, `PermissionViewModel.ts:126-144` | Likely intentional (code comment: "Cancel must leave no trace of a skip decision") — flagging for owner confirmation, not recommending removal |
| DownloadMap "Use Venue Map Only" also requires a second confirmation Alert | `DownloadMapScreen.tsx:110-119` | Likely intentional, same pattern as above — flagging for owner confirmation, not recommending removal |
| Two independent redirect timers on DownloadMapScreen (1200ms + 2600ms fallback) | `DownloadMapViewModel.ts:161-168`, `DownloadMapScreen.tsx:74-84` | Not a "duplicate choice" for the user, but duplicate *mechanism* for the same outcome — filed as Finding 4 in #153, not this requirement |

No new issue opened for UX-012 itself — the divergent-destination item is already covered
by #153's Finding 1 and its acceptance criteria already ask for this exact owner decision.
The two double-confirmation dialogs are flagged here for the record but not ticketed,
since the evidence suggests they're deliberate, not accidental duplication.

## Coverage assertion (Phase 7)

UX REQUIREMENTS IDENTIFIED: 15
UX REQUIREMENTS UNTRACKED: 0

All 15 resolve to at least one of: an exact existing issue (UX-001/002 via #153, UX-003
via #154, UX-004 via #119, UX-014's compass slice via #144), an existing issue checklist
(#128, for the majority), a partial-coverage combination of #128 plus a specific open
issue (UX-007, UX-008, UX-009, UX-013, UX-015), or an explicit owner-decision/field-data
flag with a documented checklist but no ticket (UX-010, UX-012). None are silently
uncovered — but "tracked" here means *traceable to a real issue, sub-issue, or explicit
decision point*, not *complete*. UX-001, UX-002, and UX-003 now have real source-level
findings filed as #153/#154, but remain SOURCE INSPECTED only — none are runtime-verified,
and none are claimed COMPLETE. UX-007's copy audit is genuinely partial: two screens'
worth of findings are filed, but Settings/Help/About/App Guide/Splash/Welcome and most
error/offline/GPS messages have not been copy-audited at all yet.

## Component inventory (Phase 9, partial)

Not exhaustive — covers components with existing test/audit evidence from this and the
prior reconciliation pass. Cards, modals/dialogs beyond LocationSheet, loading spinners,
and dedicated error components are not yet inventoried.

| Component | Purpose | Accessibility | Font scaling | Existing tests | Known issues |
|---|---|---|---|---|---|
| `LayersSheet.tsx` | Map type + overlay toggles | Fixed — roles/labels/state present (#65) | not flagged | `LayersSheet.test.tsx` | none open |
| `LocationSheet.tsx` | Preview/Details bottom sheet | Save/Share/Details fixed (#65); Details view itself never runtime-captured | not flagged | `LocationSheet.test.tsx` | true Details view unverified (testing gap, not a ticket) |
| `SearchBarField.tsx` | Directory/map search input | n/a | Partially fixed — `maxFontSizeMultiplier=1.8` added (#65), not visually confirmed at cap | `SearchBarField.test.tsx` | RUNTIME REVERIFICATION REQUIRED at 180%/200% OS scale |
| `GateLayer.tsx` | Gate map markers | STILL PRESENT gap — no accessible name | n/a | none found | #151 (new, this session) |
| `FacilityLayer.tsx` | Facility map markers | STILL PRESENT gap — no accessible name | n/a | none found | #151 (new, this session) |
| `NavigationChromeV1.tsx` / `NavigationChromeV2.tsx` | Active-navigation status banners | GPS_LOST/weak-GPS precedence fixed (#66) | not flagged | `NavigationChromeV1.test.tsx`, `NavigationChromeV2.test.tsx` | turn-by-turn/compass UX not runtime-verified |
| `HomeScreen.tsx` (outside-venue banner) | Browse-mode system banner | STILL PRESENT — contrast fails WCAG AA | n/a | none for this specific color | #150 (new, this session) |

## Work planning (Phase 18)

| Batch | Scope | Status |
|---|---|---|
| A. Splash / Setup / Directory | UX-001, UX-002, UX-003 | SOURCE AUDIT DONE this session (#153, #154 filed); REQUIRES PHYSICAL DEVICE OR EMULATOR to runtime-confirm the filed findings |
| B. Search / Categories / Place selection | UX-004 (UX half) | CAN START NOW |
| C. Map / Markers / Details / Controls | UX-006 (map components), P1-3 fix (#151) | CAN START NOW for audit; REQUIRES ENGINEERING FIX for #150/#151 |
| D. Directions / Route Preview / Start | UX-013 | REQUIRES PHYSICAL DEVICE OR EMULATOR — never captured, highest priority |
| E. Active Navigation / Reroute / Arrival | UX-014, UX-015 | REQUIRES PHYSICAL DEVICE OR EMULATOR |
| F. GPS / Offline / Error / Empty states | UX-009 | REQUIRES PHYSICAL DEVICE OR EMULATOR (some source-level coverage exists) |
| G. Settings / Help / About / App Guide | UX-005 (remaining screens) | CAN START NOW (source review), zero coverage today |
| H. Accessibility / Localization | UX-006, UX-007, UX-011 | CAN START NOW for source/copy audit; REQUIRES PHYSICAL DEVICE for TalkBack/font-scale |
| I. Low-literacy / Elderly usability | UX-010, UX-011 | REQUIRES FIELD DATA (representative users) or, at minimum, a structured expert walkthrough not yet done |
| J. Full end-to-end runtime acceptance | UX-013, UX-014, UX-015, Directions-history reverification | REQUIRES PHYSICAL DEVICE OR EMULATOR — **no Android emulator/device tool is available in this session's toolset**; genuinely blocked, not merely deferred |

This session's available tooling is web-browser and iOS-simulator only — no Android
emulator or device control is reachable here, so every "REQUIRES PHYSICAL DEVICE OR
EMULATOR" row above is a real Phase-19 stop condition for this session, not a scheduling
choice.
