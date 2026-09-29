# UI/UX Audit Progress

> **Status banner:** source findings in this file are as of canonical `1599c32`. PR #164 (merged) fixes #146, #150, #151, #154-#158 in source; those issues stay open until the owner closes them.

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
- PR #121 (`fix/v2-data-structural-validation`): OPEN, MERGEABLE, not touched (state on 2026-09-26; since merged)
- PR #138 (`docs/ticket-reconciliation-matrix`): OPEN, MERGEABLE (state on 2026-09-26; since merged), not touched, not
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

## Session update: runtime verification of #153/#154/#155/#156 (2026-09-26)

Booted the `Ijtema_API_36_Play` AVD (present locally, not previously used this audit) via
`adb`/`emulator` CLI — no Android runtime had been available in prior sessions, and that
was documented as a hard blocker. It is not a blocker as of this session.

**#153 (launch flow) — Finding 1 RUNTIME VERIFIED.** Cleared app data (`pm clear`) to force
a genuine fresh install, walked Welcome → Permission (real OS dialog, granted "While using
the app") → observed the app land on `Main` (bare Explore Map), not `LocationsDirectory`.
Force-stopped and relaunched: second cold launch landed directly on `LocationsDirectory`,
exactly as Finding 1 predicted. Root cause pinned precisely: `PermissionViewModel.ts:51-56`
(`navigateNext`) makes its own independent `!isConnected → 'Main'` routing decision,
bypassing `StartupManager.resolve`'s own `!isConnected && not_downloaded →
'LocationsDirectory'` branch (`StartupManager.ts:65-67`) for the same condition — two
uncoordinated decision trees for the same "offline, first session" state. Posted as a
comment on #153; issue stays open pending the owner decision its acceptance criteria
already ask for.

**#154 (Locations Directory) — heading-semantics finding RUNTIME VERIFIED.** `uiautomator
dump` of the live Directory screen confirms "RECENT" and "BLOCKS (42)" render as plain
`android.widget.TextView` with no heading trait, matching the source finding exactly.

**#155 (Settings/Help/About/App Guide) — RUNTIME VERIFIED, with a refinement.**
`uiautomator dump` of the Settings screen confirms zero explicit `accessibilityRole`/
`Label`/`State` in source, but also reveals React Native's Android accessibility bridge
auto-synthesizes a spoken content-desc from a clickable row's nested `Text` children even
without any explicit prop — so TalkBack is not literally silent on these rows today, as a
plain reading of "zero accessibility props" might imply. The real, confirmed-at-runtime gap
is narrower and sharper: toggle rows report `checkable="false"` at the row level, so
on/off state is never announced, and no role (switch/button) is conveyed either. Posted as
a comment on #155 recommending the fix target role+state explicitly. Not re-tested on iOS,
where RN's fallback behavior for unlabeled nested Text differs.

**#156 (error/offline/GPS status messages) — Findings 3, 4 RUNTIME VERIFIED; Finding 5
newly found this session; Finding 1 still not reproduced; Finding 2 still not reproduced.**
"Graph-only map works offline" and DownloadMapScreen's English-only chrome both reproduced
verbatim on-device. A second, previously-undocumented dev/ops-facing string was found while
capturing the idle/blocked Download Map screen: `DownloadMapScreen.tsx:164`'s "Offline
background-map download is unavailable until a licensed tile package is configured." —
same wrong-audience-string problem as Finding 1, added to #156 as Finding 5. Finding 1
itself (`GOOGLE_MAPS_LOAD_FAILED_MESSAGE`) could not be reproduced — this emulator has no
real network path at all (confirmed via `adb shell ping` → "Network is unreachable"), so
`HomeScreen.tsx` renders its plain, jargon-free `isOffline` banner instead of the Maps-SDK-
failure banner Finding 1 is about; reproducing Finding 1 needs real connectivity plus an
actual Maps SDK failure. `logcat` on this emulator independently shows a Google Play
Services `GoogleApiManager` `DEVELOPER_ERROR`/`SecurityException` — consistent with an
API-key/SHA-1 restriction specific to this dev/debug build, which also explains why the
basemap still fails to render in browse mode (reconfirming the historical Sept 5 finding);
a production-signed build would be needed to separate "environment limitation" from "real
regression." Finding 2 (GPS/reroute live-region) needs Active Navigation plus mock
GPS-state changes plus TalkBack running — TalkBack (`com.google.android.marvin.talkback`)
was confirmed installed on this AVD for whenever that pass happens, but the pass itself was
not attempted this session (reaching Active Navigation needs a destination search + route
start, out of scope for this atomic task). Updated #156's body directly (not just a
comment) to add Finding 5 and the "Runtime verification" section; posted comments on
#153/#154/#155.

Updated `UX_REQUIREMENT_MATRIX.md` (UX-001/002/003/007 rows and the stale "no emulator
available" note in Work Planning) and `UI_UX_COVERAGE_MATRIX.md` (Splash, Welcome,
Permissions, Download Map, Locations Directory, Explore Map, Offline/graph fallback,
Settings, Active Navigation, Rerouting, GPS loss/recovery rows) to reflect RUNTIME VERIFIED
status where evidence now supports it. Screenshots and `uiautomator` XML dumps from this
pass are session-local (scratchpad), not committed to the repo.

## Session update: Active Navigation + GPS live-region pass for #156 Finding 2 (2026-09-26, follow-up)

Re-booted `Ijtema_API_36_Play`. Reached Active Navigation for real this time: opened Block
13's LocationSheet from the Directory, tapped Directions, fed a mock GPS fix (`adb emu geo
fix`) so a route could resolve, tapped Start Navigation. Landed on `NavigationChromeV2`
showing the map-unavailable banner ("Base map unavailable. Offline route guidance
continues.") as expected.

Forced a genuine GPS_LOST transition by cutting the app's location fixes and waiting past
`GPS_LOST_TIMEOUT_MS` (8s, `NAVIGATION_WATCH_TIME_INTERVAL_MS * 8` = 1000ms * 8). First
attempt used the device-wide `cmd location set-location-enabled false` toggle — this works
(confirmed: route progress froze, banner changed) but triggers a cascade of Android/GMS
system dialogs ("No location access", "Turn on Location Accuracy") that TalkBack's
single-tap-to-focus behavior made hard to dismiss, forcing TalkBack off mid-sequence to
clear them — an ordering mistake that meant TalkBack was off at the exact moment GPS_LOST
fired. The banner itself was still captured correctly: "Searching for GPS signal. Your
position may be out of date.", confirmed via `uiautomator dump` to render as a bare
`android.widget.TextView` with `content-desc=""` and `clickable="false"` — no accessibility
affordance at the node level, directly confirming the finding. The banner-priority chain
(#66) was also reconfirmed live: GPS_LOST correctly pre-empted the map-unavailable banner
that had been showing, never stacked.

Retried with TalkBack left on, this time cutting GPS via `pm revoke` on the location
permissions instead of the system toggle (to avoid the dialog cascade). This force-killed
the app outright — `logcat` showed `ActivityTaskManager: Force removing ActivityRecord ...
app died, no saved state` — because revoking a held runtime permission from a foreground app
is an Android OS-level kill, not something the app can prevent or an app defect. This ended
the session before a TalkBack-on transition could be observed.

**Net result: #156 Finding 2 is PARTIALLY RUNTIME CONFIRMED.** The banner's existence, exact
text, and lack of any node-level accessibility affordance are now confirmed on-device,
matching the source finding precisely. Whether TalkBack is genuinely silent through the
transition — the actual screen-reader-user-facing symptom — is still unconfirmed; the
source-level fact that stands behind it (no `announceForAccessibility`/
`accessibilityLiveRegion` anywhere on this banner's code path, unlike the arrival banner
which has one) was already established in a prior session and remains the evidence for the
underlying defect. Updated #156's body (Finding 2, the runtime-verification section, and the
banner-priority note) directly. Updated `UX_REQUIREMENT_MATRIX.md` (UX-007 row, Batch E,
`NavigationChromeV1/V2` component-inventory row).

## Session update: Batch E continued — Route Preview / manual-start / location-unavailable states, and a build-provenance correction (2026-09-26, second follow-up)

Continuation of Batch E (Active Navigation / Reroute / Arrival) on branch
`docs/ui-ux-audit-reconciliation` @ `35db7c8`, emulator `Ijtema_API_36_Play`.

**Build-provenance correction (important).** The APK already installed on the emulator at
session start (SHA-256 `410a31a9…a0c300`, installed 2026-09-23) was used for an initial pass
through Active Navigation and a simulated off-route sequence. Its `logcat` output revealed a
`TestLocationInjector`/`scenarioRunner` test harness (named scenario steps: `baseline`,
`case-a-jitter`, `case-b-brief-deviation`, `case-c-sustained-deviation`,
`post-reroute-confirm`) driving location updates — including a full `OFF_ROUTE_EPISODE_STARTED`
→ `REROUTE_THRESHOLD_REACHED` → `REROUTE_REQUESTED` → `REROUTE_SUCCEEDED` sequence, and a
correctly-cooldown-gated second attempt. `grep`ing the entire current working tree (not just
`src/`) for `TestLocationInjector`/`scenarioRunner` found **zero matches** outside a single
comment in `src/__tests__/DirectionsViewModelHybrid.test.tsx` referencing "the harness" — the
harness itself is not present in current source. That APK's JS bundle does not reflect the
current checkout; its provenance is unknown (likely left over from an unrelated earlier
session on this same emulator). **All reroute/off-route evidence gathered against that APK
this session is downgraded to INSUFFICIENT EVIDENCE — build provenance unverified — and must
not be cited as proof of current-source reroute behavior.** The reroute *source code*
(`RerouteService.shouldTriggerReroute`, `getDynamicOffRouteThresholdMeters`) was read
independently and is unaffected by this: dynamic 30–80 m off-route threshold scaled by GPS
accuracy, requires ≥3 consecutive off-route fixes or ≥9 s sustained duration, 25 s reroute
cooldown, ≥12 m movement gate — a sound design, just not independently runtime-reproduced on
a build of confirmed provenance this session.

**Correction taken:** rebuilt the app from the actual current checkout —
`cd android && ./gradlew assembleDebug` (SHA-256 `e0a9f80e…c12b5`, confirmed clean: no
`TestLocationInjector` in logcat) — then, after the debug build's dev-client could not reach
Metro (the AVD's WiFi radio never associates — `adb shell dumpsys wifi` shows
`Supplicant state: DISCONNECTED` with no configured network; this is the same underlying
"no real network path" limitation noted in #156's runtime-verification section, now confirmed
to block the loopback-independent `10.0.2.2` route too, not just external connectivity) —
built a debug-signed release-shaped APK instead via
`./gradlew assembleRelease -PallowInsecureReleaseSigning=true` (the project's own documented
escape hatch for local-only testing; SHA-256
`0fffa523955a4213b797a4f124211a0b1be9eb77020839708be3457d4a356b1e`). This embeds the JS bundle
in the APK, sidestepping the Metro/WiFi dependency entirely. All findings below are against
this SHA, confirmed to contain no test-injector code.

**Confirmed on the verified-clean build:**
- `DownloadMapScreen` reproduces #156 Findings 3/4/5 verbatim (unchanged, as expected for a
  docs-only branch).
- The basemap **rendered correctly** in `LocationSheet` Preview and `Get Directions` this
  time (real Google tiles, street detail, landmark labels) — differing from the
  `DEVELOPER_ERROR`/`GoogleApiManager` failure this session's earlier #156 pass and the
  historical Sept 5 audit both recorded. Not fully explained (still intermittent/
  environment-dependent, not conclusively a fix); logged as new counter-evidence rather than
  asserted as resolved.
- Returning-user Directory landing correctly persists "Recent" entries (`Gate 13`, `Block 13`)
  across a full app restart.
- **Route Preview / Get Directions, three states newly confirmed:**
  1. *Normal in-venue manual-start* (origin = Gate 08 via "Choose start manually"): "ROUTE
     READY, 994 m, Enter through Gate 08", an "Offline walking route" badge, and a correct
     venue-graph polyline through named Rastas — clear, accurate. **KEEP.**
  2. *Outside-venue road-routing failure* (origin far outside the venue polygon): a
     well-written bilingual (English + Urdu) warning — "Direct guide — not a road route: Road
     navigation is currently unavailable. This guide points directly toward the selected gate
     and may not follow walkable roads." — with `Retry road route` / `Choose another gate` /
     `Start Direct Guide` actions. `Start Direct Guide` is correctly **disabled** with the
     copy "Current location is stale. Wait for a fresh fix before starting live navigation."
     while the origin fix is stale. **KEEP — good safety pattern.**
  3. *Current-location-unavailable*: "Current location is unavailable. Choose start
     manually." alongside a `Use last known location` fallback that honestly labels its
     staleness ("We'll enter through best eligible official gate (from N minutes ago)").
     Directly exercises Journey D (Location Unavailable) from this task's brief. **KEEP.**
- Manual-start correctly **disables** live `Start Navigation` with explanatory copy: "Choose a
  current precise location before starting live navigation. Route preview remains available."
  — a deliberate, well-communicated safety guard, newly confirmed. **KEEP.**
- `Cancel Route` shows a confirm dialog ("You will need to choose your destination again.")
  before discarding — prevents accidental loss — but is **English-only**, the same
  already-tracked #154/#155 bilingual-chrome gap; not re-filed.
- New minor observation: the map-unavailable banner on `LocationSheet` Preview ("Downloaded
  background map unavailable. Ijtema routes st…") is **visually clipped** by the zoom/compass
  control column overlapping it from the right. Small, cosmetic, not previously documented.
  Flagged via a comment on #128 (control-overlap/readability class) rather than a new issue.

**Environment blocker (confirmed, reproducible, not an app defect):** live GPS fix resolution
(`expo-location`'s `watchPositionAsync`) never resolved in this AVD session on the clean
build — "Finding your location…" spun indefinitely and fell through to "Current location is
unavailable" even under a sustained feed (40 `adb emu geo fix` calls over ~24 s, plus several
earlier attempts). This is despite `adb emu geo fix` succeeding at the console/QEMU level
every time (`OK`), and despite the exact same tool having appeared to work for the stale
build's `TestLocationInjector`-driven scenario (which, per the correction above, was not
actually consuming real GPS fixes at all — explaining the discrepancy). Root cause not
conclusively isolated; leading candidate is an unresolved Play Services "Location Accuracy"
consent on this fresh app install (a dialog cascade from exactly this subsystem blocked a
different test earlier this session and in a prior session). This blocked reaching live
Active Navigation, Rerouting, and Arrival with a source-verified build this session. **Not
reproduced as an app defect** — `adb shell dumpsys location`/`dumpsys wifi` point at
AVD/Play-Services state, not app code.

**Not independently re-verified this session (carried forward from prior sessions, still
valid, not repeated per this task's "don't redo still-valid work" instruction):** GPS_LOST
banner visibility, #66 banner-priority chain, #156 Finding 2's node-level accessibility
evidence.

**Lower-confidence, build-unverified observation (not filed):** the earlier stale-build
Active Navigation screenshot showed the secondary instruction line clipped mid-word ("Then:
Continue on Rasta 08 for 92 met…"). Since `NavigationChromeV2`'s instruction-card layout is
unlikely to have been touched by the stale build's location-injection scaffolding, this is
*probably* still accurate, but per this session's build-provenance correction it is not
treated as confirmed. Worth a 30-second recheck once live navigation is reachable.

## Session update: complete component inventory for `src/views/components/` (2026-09-26, third follow-up)

New task framing this session: acting as the source/usability audit owner (a separate
Codex agent, if/when run, owns independent Android runtime verification — coordinate
exclusive emulator use rather than operating simultaneously; the emulator was not touched
in this update).

Read all 32 files under `src/views/components/` (28 real components + 4 non-component
utility/style files) in full and recorded a complete per-component inventory — purpose,
screens using it, user-facing text, actions, states, accessibility props, existing tests,
and issue cross-references — in the new `COMPLETE_COMPONENT_INVENTORY.md`. This was a
genuine gap: no prior session had produced a component-level (as opposed to screen-level)
inventory.

Cross-references were spot-checked against the actual bodies of #144 and #151 (both
confirmed accurate as scoped — #151 is explicitly `GateLayer`/`FacilityLayer` only, #144
is a product-decision issue about the compass implementation, not a labeling bug) rather
than assumed from pattern-matching alone.

**New findings, filed:**
- **[#157](https://github.com/ghilmanITM360/offline-map/issues/157)** (new issue) — the
  same "no accessible name on interactive map object" defect class as #151, in components
  #151 explicitly doesn't cover: `BlockLayer`, `RastaLayer`, `SpecialRouteLayer`,
  `UserLocationMarker`, `NavigationMapLayersV1`/`V2` markers, and `MapLabelOverlay`'s
  non-interactive label branch (real, visible bilingual place-name text with zero
  accessibility exposure). `RastaLayer`/`SpecialRouteLayer`'s tap targets are an invisible
  wide hit-corridor by design (the visible stroke is too thin to tap reliably) — worse than
  a missing label, since a screen-reader user has no way to discover the control exists at
  all, not just no name for it once found.
- Comment on **#128** — three smaller findings: `SheetHeader`'s icon-only close button has
  no `accessibilityRole`/`accessibilityLabel` (unlike nearly every other control in this
  codebase); `LocationTutorialTooltip` fades in/out silently with no live-region
  announcement (same class as #156, different component); `DestinationRow` sets
  `accessibilityState={{disabled: true}}` on field-blocked rows while `onPress` stays fully
  functional (intentional per #96) — a known-debated pattern since some screen readers may
  not announce a `disabled: true` row as activatable at all, silently defeating the "stays
  tappable so the user can see why" intent.

**Confirmed still-accurate, not re-filed:** `NavigationChromeV1`/`V2`'s GPS/status banner
text is the exact #156 pattern (already tracked, RUNTIME VERIFIED in an earlier session for
the GPS_LOST case); `OutsideRouteStatusCard` is the one component here that *does* set
`accessibilityLiveRegion` — a useful in-codebase reference point for what #156's fix should
look like elsewhere.

**Test-coverage gap noted (not filed as its own issue, recorded for the eventual fix
batch):** `LocationSheet.tsx` has 3 materially different modes (`routePreview`, `preview`,
`details`); `LocationSheet.test.tsx` only covers `routePreview`.

Updated `UX_REQUIREMENT_MATRIX.md` (UX-006 row — now SOURCE AUDIT COMPLETE for
`src/views/components/`, runtime confirmation of the new findings still open).

**Not done this session:** text/action inventory as a dedicated artifact (large overlap
with #154/#155/#156's already-extensive copy audits — recorded as a judgment call to avoid
a redundant document rather than an oversight), simplification register, first-time-attendee
scenario walkthroughs, low-literacy walkthrough, screen-level (as opposed to
component-level) re-audit. These remain open per the standing task brief.

## Session update: Screen 01 (Splash) final reconciliation + consolidated issue #158 (2026-09-26, fourth follow-up)

Second Splash-specific audit pass, same branch (`docs/ui-ux-audit-reconciliation`), reconciling `SPLASH_SCREEN_DEEP_AUDIT.md` (written the prior session, committed this session at `b20be87` — it had never actually been committed before, only written locally) and closing the remaining Phase-2 checklist items (Android Back, process kill/relaunch, dark mode — all closed at source level; see the report's new §16).

**Screen 01 status:**
- Source audit: **COMPLETE** (full startup dependency trace, all 10 `Promise.all` members — corrected count, was misreported as 9 — traced to their actual rejection surface; full native Android splash resource inspection; 25-item Phase-2 checklist fully closed to a classification)
- Available runtime audit: **PARTIAL** (one live cold-launch cycle on `emulator-5554`, logcat timing, 3 usable screenshots directly confirming both the blank-frame and the invisible-native-logo observations; frame-accurate sub-second transition ordering still not confirmed — two `screenrecord` attempts both produced corrupted output)
- Accessibility: **SOURCE-LEVEL COMPLETE, RUNTIME PENDING** (no live TalkBack session run)
- Outstanding verification: frame-accurate native→blank→JS ordering, live TalkBack, large-font-scale, physical-device timing (emulator's 9.3s cold-start figure is explicitly not claimed as device-representative)
- Implementation: **NOT STARTED** — audit-only pass, no application code changed

**Consolidated issue filed:** [#158](https://github.com/ghilmanITM360/offline-map/issues/158) — parent #126, cross-referenced #128 and #153 (confirmed no scope overlap with #153's launch-flow findings). Two CONFIRMED DEFECT checklist items (subtitle contrast, invisible native logo), one IMPROVEMENT CANDIDATE (time-gated loading affordance, owner-gated), two PENDING INVESTIGATION items kept visible rather than speculatively implemented (native/RN theme-handoff timing, TalkBack announcement need), and an explicit exclusions section (historical startup-freeze finding, Urdu-title contrast, process-kill/relaunch, dark-mode) so none of those get reimplemented. Searched #126/#128/#153 first — no pre-existing Splash-specific ticket found, so this is a new issue, not a duplicate.

**Evidence:** 3 screenshots moved from session scratchpad to `docs/audit/ui-ux/screenshots/01a-01c*.png` (local only — `git add` refused them under this repo's own `.gitignore:23` "Local QA evidence" rule, same rule that already applies to the pre-existing untracked screenshots in that directory from prior sessions). Flagged as an owner decision in the issue (§10) and the report (§16.5) if committed evidence is wanted going forward.

**#126/#128 status:** unchanged, **not marked DONE** — this pass closes out the Splash sub-scope specifically (now tracked under #158) but neither parent issue's full acceptance criteria are met.

## Session update: Screen 02 (Welcome) deep audit + consolidated issue (2026-09-26, fifth follow-up)

First Welcome-specific audit pass, same branch (`docs/ui-ux-audit-reconciliation`). New `WELCOME_SCREEN_DEEP_AUDIT.md` written and committed. No pre-existing Welcome-specific report or issue existed prior to this session (confirmed via `find` and `gh issue list --search welcome`).

**Screen 02 status:**
- Source audit: **COMPLETE** (full element inventory — 7 elements, all static, none invented; full execution-path trace through `StartupManager`/`WelcomeViewModel`/`OnboardingStatusService`; full onboarding-necessity analysis against Splash and Permission for content overlap; measured, not eyeballed, WCAG 2.2 contrast on every text/background pair — all 5 pairs PASS, no contrast defect found on this screen)
- Available runtime audit: **COMPLETE for non-destructive states** on the shared `emulator-5554` (app was already running from an earlier, non-session build — no `pm clear`/reinstall performed to respect Codex's shared use of that emulator): fresh render, hardware Back (exits app, no confirmation, no crash), relaunch while incomplete (Welcome correctly re-shown), rapid double-tap Continue (single clean transition, no duplicate nav), relaunch after completion (Welcome correctly skipped, confirming returning-user behavior). 4 screenshots captured.
- Accessibility: **SOURCE-LEVEL REVIEWED, NOT TALKBACK-VERIFIED** — two open items (`Pressable` missing explicit `accessibilityRole="button"`; decorative icon not explicitly hidden from the accessibility tree), neither live-tested this session
- Outstanding verification: live TalkBack pass, forced large-font-scale layout, physical-device pass, real first-time-user validation (this session's trunk test is expert-prediction only)
- Implementation: **NOT STARTED** — audit-only pass, no application code changed

**Findings:** no functional defects — every runtime-testable behavior (render, Back, relaunch, rapid-tap, persistence) passed. Seven findings recorded, all usability/consistency/accessibility-verification/test-coverage in nature: app name differs across Splash/Welcome/AppGuide (WEL-001), icon+branding partially repeats Splash within ~1-2s (WEL-002), missing `accessibilityRole="button"` (WEL-003), decorative icon not explicitly hidden from a11y tree (WEL-004), no debounce guard on Continue — not reproduced as a defect (WEL-005), "Find your location" benefit text duplicated verbatim as Permission's own heading (WEL-006), zero automated test coverage for `WelcomeScreen`/`WelcomeViewModel` (WEL-007, confirmed gap — `SplashScreen.test.tsx` exists as a counter-example precedent, nothing equivalent exists for Welcome).

**Existing issues checked:** #153 Finding 3 (storage-read failure silently re-shows Welcome) already covers Welcome's one source-level defect path — referenced, not duplicated. #128's Splash/Welcome/Permission single-primary-action checklist row re-confirmed true. No existing issue covers WEL-001/002/003/004/005/006/007.

**Consolidated issue filed:** [#159](https://github.com/ghilmanITM360/offline-map/issues/159) — parent #126, cross-referenced #128, #153, #158. Three confirmed-problem checklist items (WEL-001, WEL-006, WEL-007), one improvement candidate (WEL-002, owner-gated), three pending-investigation items kept visible pending a live TalkBack pass (WEL-003, WEL-004, WEL-005) rather than speculatively implemented, and an explicit exclusions section (contrast, dark mode, RTL, offline launch, Back-exits-app, #153 Finding 1) so none of those get reimplemented. Searched #126/#128/#153/#158 first — no pre-existing Welcome-specific ticket found.

**#126/#128 status:** unchanged, **not marked DONE**.

## Session update: Screen 03 (Permission) deep audit + consolidated issue (2026-09-26, sixth follow-up)

Third sequential screen-specific audit pass, same branch (`docs/ui-ux-audit-reconciliation`). New `PERMISSION_SCREEN_DEEP_AUDIT.md` written and committed. No pre-existing Permission-specific report or issue existed prior to this session (confirmed via `ls` and `gh issue list --search permission`/`--search location`).

Opened with an owner-confirmed naming decision to document first: official app name is English "Ijtema Map" / Urdu "اجتماع میپ" — cross-referenced against #158 (no naming content) and #159 (WEL-001 catalogued two other variants, not this one).

**Screen 03 status:**
- Source audit: **COMPLETE** (full element inventory — 12 elements including the native-dialog and 4 conditional-Alert states, none invented; full execution-path trace through `PermissionViewModel`/`StartupManager`/`OnboardingStatusService`/`GPSManagerService`, explicitly distinguishing permission status from device Location-Services status from actual GPS fix availability per this task's Phase 3 requirement; full double-confirmation-dialog Phase-8 review — recommendation KEEP, evidence-based; measured WCAG 2.2 contrast on every text/background pair)
- Available runtime audit: **COMPLETE for non-destructive/reversible states** on the shared `emulator-5554` (Codex-foreground-app check performed before touching anything; no `pm clear`/reinstall). Session opened on a pristine, never-interacted Permission screen left over from the prior Welcome-audit session's own testing. Live-tested: fresh render, skip-tap → confirmation dialog, cancel → state verified unchanged (screenshot + AsyncStorage-file check), grant-tap → loading state → native Android 16 permission dialog → grant → transition to DownloadMap, relaunch after grant → correctly re-skips both Welcome and Permission, and one reversible `pm revoke` (not a data clear) + relaunch to reproduce a real Settings-level revocation. 8 screenshots captured (14–21).
- Accessibility: **SOURCE-LEVEL REVIEWED, NOT TALKBACK-VERIFIED** — same two open-item pattern as Welcome (missing `accessibilityRole="button"`, decorative icon not explicitly hidden), plus one Permission-specific item (skip link's touch target source-estimated below 48dp).
- Outstanding verification: live TalkBack pass, forced large-font-scale, native "Don't allow"/"Only this time" branches, Location-Services-disabled toggle, no-internet-at-request-time, physical-device pass, real first-time-user validation.
- Implementation: **NOT STARTED** — audit-only pass, no application code changed.

**Findings:** no functional defects — every runtime-testable behavior (skip, cancel, grant, relaunch, external revocation) completed its transition correctly. Nine new findings recorded: native OS permission dialog (and app launcher/recents label) shows a fifth/sixth app-name variant, "Karachi Ijtema Offline Nav," sourced from `app.json:3` — the most OS-prominent naming surface found in this audit lineage so far, seen before the app is even opened (PERM-001); no in-app distinction between Precise/Approximate grant (PERM-002); permanent-denial Alert overstates the requirement given skip is always available (PERM-003); loading-state button background fails WCAG 1.4.11 non-text contrast for its white spinner, confirmed via live screenshot — genuinely hard to see (PERM-005); a rejected permission-request promise is silently logged with no user-facing Alert (PERM-006); Permission is the one screen in an otherwise-bilingual onboarding sequence with no Urdu text (PERM-007); skip link's touch target source-estimated under 48dp (PERM-008); missing `accessibilityRole`/icon accessibility-hiding (PERM-009).

**Existing issues checked and corroborated, not duplicated:** #153 Finding 2 (revoked permission indistinguishable from a first ask) was **live-reproduced this session** — the post-revocation screenshot is pixel-identical to the fresh-install screenshot — strengthening it from source-only to source+runtime evidence. #153 Finding 5 (skip consequence trapped in a transient Alert) corroborated via this audit's own Phase-8 dialog review. #128's NAV-UX-003 ("Open Settings" not wired) **appears already fixed** — `Linking.openSettings()` is correctly wired in current source — flagged for owner reconciliation rather than silently assumed. WEL-006 (title text duplicated with Welcome) corroborated from the Permission side.

**Consolidated issue filed:** [#163](https://github.com/ghilmanITM360/offline-map/issues/163) — parent #126, cross-referenced #128, #153, #159. Searched #126/#128/#153/#158/#159 first plus keyword searches for "permission"/"location"/"Mimbar" — no pre-existing Permission-specific ticket found (closest adjacent tickets: #148 dead background-permission config, #156 DownloadMap/GPS error messages, #116 unrelated field-survey ticket — none overlap this screen's own findings).

**Mimbar concept (Phase 9):** zero matches anywhere in `src/` (re-confirmed, consistent with the existing tracker note above and #153's own claim) — not implemented, not stubbed. No permission-flow contradiction found with the owner's proposed future fallback; recorded as not-yet-built, cross-referenced rather than duplicated.

**#126/#128 status:** unchanged, **not marked DONE**.

## Remaining audit work / next atomic task

Ranked candidates, per this task's Phase 12:
1. Diagnose and resolve the live-GPS-fix environment blocker above — try
   `adb shell dumpsys location` for provider/consent state, or get the debug build talking to
   Metro via the RN dev menu's manual "debug server host" override to `localhost:8081`
   (bypassing the WiFi-association failure, since `adb reverse` works over the ADB transport
   independent of the AVD's own network stack) — then re-attempt live Active Navigation,
   Rerouting, and Arrival on a build of confirmed current-source provenance.
2. Re-verify the reroute source logic (`RerouteService.shouldTriggerReroute`) at runtime once
   live GPS is reachable — this session only confirmed it by reading source; the previous
   runtime reroute evidence is invalidated (see build-provenance correction above).
3. Recheck the Active Navigation instruction-card text-truncation observation above
   ("…92 met…") on a confirmed-clean build.
4. Re-capture the 6 historical screens with a working basemap — this session saw the basemap
   render correctly on the release-shaped build without any config change, so the
   `DEVELOPER_ERROR`/API-key-restriction blocker may be intermittent rather than persistent;
   worth a fresh attempt before assuming a production-signed build is required.
5. Capture the true LocationSheet Details view via the correct tap target (never actually
   captured despite being logged as captured).
6. Confirm live TalkBack audible silence during GPS_LOST — the one piece of #156 Finding 2
   still open. Needs a GPS-cutoff method that doesn't disturb TalkBack or the foreground
   process: neither the device-wide `cmd location set-location-enabled false` toggle (spawns
   an Android/GMS dialog cascade that TalkBack's single-tap-to-focus makes hard to clear) nor
   `pm revoke` on the location permission (Android force-kills the foreground app on runtime
   permission revocation) worked cleanly in the session that first tried this. Also still
   open: #156 Finding 1 (needs real connectivity plus an actual Maps SDK failure).

Not started this session, per this task's established pattern of stopping after each
explicit, bounded ask.
