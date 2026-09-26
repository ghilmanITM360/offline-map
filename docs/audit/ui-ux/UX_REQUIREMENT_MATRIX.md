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
| UX-001 | Splash → Setup → Directory first-install flow | P1 | #153 (new, this session) | #126 / #128 | EXACT EXISTING ISSUE | RUNTIME VERIFIED for Finding 1 (this session, emulator `Ijtema_API_36_Play`: fresh install via `pm clear` → Welcome → Permission grant → landed on `Main`, not `LocationsDirectory`; force-stop + relaunch → landed on `LocationsDirectory` as predicted); Findings 2/3/4/5 remain SOURCE INSPECTED only | Findings 2 (permission revocation), 3 (storage-read failure), 4 (redirect-timer race) still need runtime reproduction | Emulator available and now used this session for Finding 1; same emulator can cover 2/3/4 in a future pass |
| UX-002 | Normal launch → Directory (returning user) | P1 | #153 (new, this session) | #126 / #128 | EXACT EXISTING ISSUE | RUNTIME VERIFIED — returning-user launch (existing app data, this session's second cold launch) landed directly on `LocationsDirectory`, confirming `StartupManager.resolve`'s returning-user branch | Permission-revocation re-trigger and storage-failure fallback scenarios (Findings 2/3) still need runtime reproduction | Emulator warm-start confirmed; permission-revocation test still to do | Same next step as UX-001 — both share #153 |
| UX-003 | Locations Directory forensic audit | P1 | #154 (new, this session); #146 (narrower Directory/search disagreement, open); #96 (non-routable tap affordance, closed) | #126 / #128 | EXISTING SUB-ISSUE (#154) + PARTIAL COVERAGE (#146) | RUNTIME VERIFIED for the heading-semantics finding (this session — `uiautomator dump` confirms "RECENT"/"BLOCKS (42)" render as plain `TextView` with no heading trait); other 3 findings in #154 remain SOURCE INSPECTED only | Search, Urdu query, empty state, and unavailable-destination-row findings in #154 still need runtime confirmation; small-screen rendering not yet checked | Emulator available and now used this session for the heading finding | See #154 for full findings |
| UX-004 | Search/categories/scalability | P1 | #119 (search + venue-graph-construction latency/memory benchmark) — this **is** the "existing scalability benchmark ticket" the brief refers to | #126 / #128 | EXACT EXISTING ISSUE (for scale/perf half); UX half (Urdu/alias/duplicate-name search quality) uncovered | PARTIALLY AUDITED (SearchBarField component-level via #65; search-matching logic now source-traced in #154 — exact-substring + Levenshtein-2 for English, substring-only for Urdu, numeric exact-match short-circuit) | Result-hierarchy/duplicate-name UX still not evaluated at runtime; no test exercises an actual Urdu query string | None for UX half; #119 owns the perf/scale half | Do not duplicate #119; if further search-quality gaps are found, fold into #128's checklist, not a new ticket |
| UX-005 | Deep usability audit of every screen | P1 | #128 (core-flow forensic audit) | #126 | EXACT EXISTING ISSUE CHECKLIST | PARTIALLY AUDITED — 6 of ~24 screens/states have any evidence (see `UI_UX_COVERAGE_MATRIX.md`) | 18 screens/states remain UNTESTED or RUNTIME BLOCKED | Emulator/device for the untested screens | Continue screen-by-screen work under #128; ranked order in Work Planning below |
| UX-006 | Audit every reusable UI component | P1 | #128 (checklist covers touch targets, a11y, banners implicitly) | #126 | PARTIAL COVERAGE | PARTIALLY AUDITED — see component inventory below; ~8 of many components have explicit coverage | Cards, modals/dialogs, loading/error components, arrival components not yet inventoried | None for source read; emulator for runtime behavior | Extend component inventory below in a future pass; do not open a ticket per component (anti-spam, per #126/#128's own scope notes) |
| UX-007 | Every user-facing label/message/text, incl. Mimbar-mislabeling risk | P1 | #153, #154, #155, #156 (new, this session); #105 (closed) is one past example of a wording defect | #126 / #128 | PARTIAL COVERAGE across #153/#154/#155/#156 | AUDITED (source-only) + RUNTIME VERIFIED for a majority of findings (this session, emulator `Ijtema_API_36_Play`, across two passes) — grepped all of `src/` case-insensitively for "Mimbar": **zero matches, no mislabeling risk found**; #156 Findings 3 ("Graph-only" jargon) and 4 (English-only DownloadMapScreen chrome) reproduced verbatim on-device; a 5th, previously-undocumented dev/ops-facing string ("licensed tile package is configured", `DownloadMapScreen.tsx:164`) found during the first runtime pass and added to #156; #155's Settings-screen finding runtime-confirmed but refined — RN's Android accessibility bridge auto-synthesizes a spoken label from nested `Text` even with zero explicit props, so the real runtime gap is missing role/state, not total silence (see #155 comment); #156 Finding 2 now PARTIALLY RUNTIME CONFIRMED in a follow-up Active Navigation pass — reached Active Navigation (Block 13 route), forced a genuine GPS_LOST transition (cut emulator location fixes, waited past the 8s `GPS_LOST_TIMEOUT_MS`), and confirmed both the exact banner text ("Searching for GPS signal. Your position may be out of date.") and that it renders as a bare `TextView` with no accessibility affordance (`uiautomator dump`); banner-priority chain (#66) also reconfirmed live | #156 Finding 1 (dev-facing `GOOGLE_MAPS_LOAD_FAILED_MESSAGE`) not reproduced — needs real connectivity plus an actual Maps SDK failure, not just no-network; #156 Finding 2's live TalkBack audible-silence check specifically is still open — two attempts blocked by environment/OS side effects (TalkBack had to be disabled to clear an unrelated system dialog first; a retry using `pm revoke` on the location permission to cut GPS fixes force-killed the foreground app instead, an OS-level behavior on runtime permission revocation, not an app defect) | Emulator available and used this session across two passes; only the live TalkBack speech confirmation for #156 Finding 2 remains open, needs a cleaner GPS-cutoff method (e.g. emulator console pause rather than permission revoke or system toggle) | UX-007 is now source-audited and majority-runtime-verified, including a partial pass on the highest-risk item (#156 Finding 2). Next atomic task: a cleaner GPS-cutoff technique (avoid `pm revoke` and the system-wide location toggle, both of which had side effects) to get TalkBack running uninterrupted through an actual GPS_LOST transition and confirm audible silence directly |
| UX-008 | Buttons/actions clarity and necessity | P1 | #128 checklist ("touch target sizing"), NAV-UX-003 (Settings deep-link not wired, folded into #128) | #126 / #128 | PARTIAL COVERAGE | PARTIALLY AUDITED — Save/Share/Details/LayersSheet controls verified via #65; Directions/Start/Recenter/Compass/Exit/Done not systematically reviewed as a set | Comprehensive interactive-element pass across the 7 named controls (Directions, Start Navigation, Change Starting Point, Recenter, Compass, Exit, Done) | Emulator for reachability/feedback confirmation | Do this as one pass across #128, not per-button tickets |
| UX-009 | Loading/error/empty/disabled states | P1 | #128 checklist (explicit line items), #143 (reroute stuck state, open), #146 (empty/disagreement in Directory, open), #95 (arrival detection design question, open) | #126 / #128 | EXISTING ISSUE CHECKLIST + PARTIAL COVERAGE via #143/#146/#95 | PARTIALLY AUDITED — GPS_LOST/weak-GPS states fixed and tested (#66); most other states (route failure, unroutable, rerouting-failure loop, field-blocked empty state) unverified at runtime | Route-calc failure, offline-map-unavailable, interrupted-journey states never captured | Emulator/device | Reconcile #143 and #146 explicitly under #128 rather than treating as separate audit scope |
| UX-010 | Layman/low-literacy usability pass | P1 | #128 (NAV-UX-005 sub-item already flags "no documented low-literacy design consideration") | #126 / #128 | EXISTING ISSUE CHECKLIST, incomplete | FIELD DATA REQUIRED | No representative-user or even expert-walkthrough task-based evaluation performed | Representative-user or structured expert-walkthrough session | Flag explicitly to owner: this requirement cannot be honestly closed by source inspection alone |
| UX-011 | Elderly usability, readability, touch targets | P2 | #128 checklist ("Readability... Touch target sizing"), P1-5 SearchBarField font-scale (partially fixed, #65) | #126 / #128 | PARTIAL COVERAGE | PARTIALLY AUDITED — one component (SearchBarField) has a partial fix; no systematic touch-target audit across the app | Tap-target dimension audit across all interactive elements; outdoor-readability and one-handed-operation review | Physical device outdoors for readability; emulator for tap-target measurement | Fold into #128; do not split |
| UX-012 | Remove duplicate/unnecessary choices | P2 | none — explicit checklist below instead of a ticket, per this session's instruction | #126 | OWNER DECISION REQUIRED | PARTIALLY AUDITED — see explicit checklist in "UX-012 audit checklist" section below | Full app-wide audit for redundant choices beyond the launch flow not yet done | None to gather more evidence from the launch flow; requires product judgment to act on what's found | Owner reviews the checklist below; do not create a ticket until a specific simplification is approved |
| UX-013 | Route Preview clarity | P1 | none exact; historical P2-5 (cognitive overload, up to 4 stacked cards) folded into #128 | #126 / #128 | RUNTIME VERIFIED, 3 sub-states | RUNTIME VERIFIED this session (SHA `0fffa523…c12b5`, confirmed current-source build) — normal in-venue manual-start route, outside-venue road-routing-failure "Direct guide" fallback (bilingual, correctly gated on fresh location), and current-location-unavailable/last-known-location fallback all confirmed clear and well-labeled; see `UI_UX_AUDIT_PROGRESS.md` session update and `UI_UX_COVERAGE_MATRIX.md` | Live-GPS-origin Route Preview (the "Use my current location" success path specifically) still not captured — blocked this session by a live-GPS-fix environment issue, not an app defect | Emulator/device — manual-start and fallback paths done; live-GPS-origin path still open | See Work Planning batch D |
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
| `NavigationChromeV1.tsx` / `NavigationChromeV2.tsx` | Active-navigation status banners | GPS_LOST/weak-GPS precedence fixed (#66), RUNTIME CONFIRMED this session; no live region on GPS_LOST/weak-GPS/reroute banners — STILL PRESENT, banner text + missing node-level affordance RUNTIME CONFIRMED, live TalkBack silence unconfirmed (#156 Finding 2) | not flagged | `NavigationChromeV1.test.tsx`, `NavigationChromeV2.test.tsx` | #156 (this session); turn-by-turn/compass UX beyond GPS_LOST not runtime-verified |
| `HomeScreen.tsx` (outside-venue banner) | Browse-mode system banner | STILL PRESENT — contrast fails WCAG AA | n/a | none for this specific color | #150 (new, this session) |

## Work planning (Phase 18)

| Batch | Scope | Status |
|---|---|---|
| A. Splash / Setup / Directory | UX-001, UX-002, UX-003 | SOURCE AUDIT DONE (#153, #154 filed); Finding 1 (#153) and the heading finding (#154) RUNTIME VERIFIED this session; remaining findings still need an emulator/device pass |
| B. Search / Categories / Place selection | UX-004 (UX half) | CAN START NOW |
| C. Map / Markers / Details / Controls | UX-006 (map components), P1-3 fix (#151) | CAN START NOW for audit; REQUIRES ENGINEERING FIX for #150/#151 |
| D. Directions / Route Preview / Start | UX-013 | DONE for manual-start and fallback paths this session (RUNTIME VERIFIED, 3 sub-states); live-GPS-origin path still blocked by an environment issue |
| E. Active Navigation / Reroute / Arrival | UX-014, UX-015 | PARTIALLY DONE — Active Navigation and a real GPS_LOST transition were confirmed in an earlier session (#156 Finding 2); this session's attempt to reach Active Navigation on a build of confirmed current-source provenance was blocked by a live-GPS-fix environment issue (see `UI_UX_AUDIT_PROGRESS.md`); reroute/arrival states and live TalkBack confirmation still need a pass. Note: this session also found that an earlier-installed APK (unrelated provenance) had produced apparent reroute evidence via a test-only location-injection harness not present in current source — that evidence is invalidated, not to be cited |
| F. GPS / Offline / Error / Empty states | UX-009 | REQUIRES PHYSICAL DEVICE OR EMULATOR (some source-level coverage exists) |
| G. Settings / Help / About / App Guide | UX-005 (remaining screens) | CAN START NOW (source review), zero coverage today |
| H. Accessibility / Localization | UX-006, UX-007, UX-011 | CAN START NOW for source/copy audit; REQUIRES PHYSICAL DEVICE for TalkBack/font-scale |
| I. Low-literacy / Elderly usability | UX-010, UX-011 | REQUIRES FIELD DATA (representative users) or, at minimum, a structured expert walkthrough not yet done |
| J. Full end-to-end runtime acceptance | UX-013, UX-014, UX-015, Directions-history reverification | REQUIRES ACTIVE NAVIGATION + MOCK GPS — an emulator (`Ijtema_API_36_Play`) is now available and was used this session for batches A and H's launch-flow/Directory/Settings/DownloadMap findings, but reaching Route Preview/Active Navigation/Arrival needs a destination search + route start + `adb emu geo` mock-location sequence not yet attempted |

An Android emulator (`Ijtema_API_36_Play`, via `adb`/`emulator` CLI) was booted and used
successfully this session — the earlier note that no Android emulator/device tool was
available is now stale and applied only to that prior session's toolset. Batches A, G,
and H's DownloadMap/Settings/Directory findings now have real runtime evidence (see
#153/#154/#155/#156 comments). Batches D, E, F, and the rest of J still require a route
to be started and GPS state to be mocked, which was not attempted this session.
