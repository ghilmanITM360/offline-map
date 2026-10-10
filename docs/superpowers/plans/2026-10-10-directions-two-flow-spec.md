# KARACHI IJTEMA OFFLINE MAP — DIRECTIONS SHEET REPAIR + TWO-MODE NAVIGATION FLOW

## ROLE AND AUTHORIZATION

Act as a Principal React Native Engineer, Navigation Architecture Specialist, Senior Mobile UX Designer, and QA Engineer.

**This is an IMPLEMENTATION task, not another audit-only task.**

The owner has approved a revised navigation policy and requires a complete investigation and repair of the Directions panel disappearing or becoming inaccessible.

First perform a short source/runtime-state audit, identify the exact affected components, prepare a dependency-aware plan, then implement, test, review and integrate the fixes.

Do not stop after producing a report unless a genuine blocker exists.

## 1. Repository and continuation state

Repository: `ghilmanITM360/offline-map`

Canonical branch: `integration/ijtema-clean-baseline`

Last reported canonical SHA:

`bce222b208dea446b81cdcf45c65d8182b096bcf`

Latest completed work:

- PR #357: GPS accuracy/precision validation
- PR #358: Journey authority/readiness
- PR #359: Live activation safety, GPS-loss behavior, reroute preservation
- PR #360: Destination-first Directory → Map preview and removal of automatic permission requests/automatic navigation

Reported final checks after PR #360:

- Typecheck: PASS
- Lint: 0 errors, 2 existing warnings
- npm test: 104 script commands PASS
- Components: 147 suites / 1,407 tests PASS
- CI and independent review: PASS

This is a reported checkpoint, not permission to assume current remote HEAD.

Last working tree:

`/Users/ghilmankhan/.codex/worktrees/journey-destination-preview/offline-map`

Last branch:

`codex/journey-destination-preview`

Last worktree HEAD:

`660a7d57befff4bedf29bf02ced0f9dd1ec199e4`

Previous implementation plan:

`docs/superpowers/plans/2026-10-10-approved-journey.md`

Previous progress ledger:

`docs/superpowers/plans/2026-10-10-approved-journey-progress.md`

Read those files if available.

### Mandatory preflight

1. Verify repository and fresh canonical HEAD.
2. Inspect existing worktrees and branches without overwriting work.
3. Read AGENTS.md and CLAUDE.md.
4. Discover and apply relevant available skills.
5. Review PRs #353, #357–#360 and other overlapping open PRs.
6. Check current CI and uncommitted changes.
7. Read existing component architecture and navigation tests.
8. Check all visible usage-limit indicators before expensive operations.
9. Provide a concise implementation plan, then proceed.

Do not redo validated merged work.

Do not use unrelated repositories or historical source snapshots as current truth.

---

# 2. NEW APPROVED PRODUCT POLICY — OVERRIDES PREVIOUS START RULE

The owner has explicitly changed one requirement from the previous prompt.

Previously:

Destination tap → Route Preview → Explicit Start Live Navigation.

**That is no longer the universal rule.**

There are now TWO AUTHORITATIVE FLOWS.

## FLOW A — NO USABLE LIVE LOCATION

**Directory → Select destination → Map → Resolve origin if necessary → Route Preview → Explicit Route Guide or Live Navigation → Arrival/Exit.**

Detailed behavior:

1. User opens Directory.
2. User selects Block, Gate, Rasta or another supported destination.
3. Map opens with destination visibly focused.
4. Application checks whether a usable live origin already exists.
5. If none exists, show the destination and an obvious origin-resolution panel.
6. User may choose:
   - Choose starting point
   - Use my location
   - Preview from Block 2 (optional, hypothetical)
7. If an actual manual origin is selected, calculate route.
8. Show Route Preview.
9. User explicitly taps **Open Route Guide**.
10. Manual route instructions become available without GPS.
11. GPS-based Live Navigation may be offered later only after genuine location acquisition and safe route recalculation.

Important: A manual Route Guide does not detect automatic arrival. Exiting or marking guide complete is not GPS-verified ARRIVED.

## FLOW B — FRESH USABLE LIVE LOCATION

**Directory → Select destination → Map → Live Navigation → Arrival/Exit.**

Detailed behavior:

1. User selects a valid destination.
2. Map opens and focuses the destination.
3. System verifies fresh usable live location and current journey authority.
4. System calculates a valid applicable pedestrian route.
5. Once calculation and activation guards succeed, **start Live Navigation automatically**.
6. Show active route, current position, live instructions, navigation controls and progress.
7. Continue until real arrival or explicit exit.

Do not require:

- A redundant Details screen
- A manual Route Preview confirmation
- A second Start button
- A location prompt if valid permission and fresh location are already available

### Essential qualification

"Location available" DOES NOT merely mean:

- Permission granted
- Cached coordinates exist
- `startSource === live_gps`
- A location object is non-null
- Last known coordinates were loaded

It must mean a fresh, precise, accurate, timestamp-valid live fix with valid current authorization, location services and journey context.

The route must also be valid and startable.

**Automatic Live Navigation must never bypass the safety guards implemented in PRs #357–#359.**

If the route cannot be calculated or activation fails, show an actionable non-active Map state instead of pretending navigation started.

### Auto-start ownership

Automatic activation must be tied to one explicit destination-selection intent.

- Exactly one activation attempt per eligible current journey.
- No repeated start caused by rerender, store hydration or sheet animation.
- No delayed start after user cancels or chooses manual mode.
- No stale callback can activate another destination.
- No automatic process-death resume.
- No automatic replacement of an already-active journey.
- Same-place and route-failure states cannot start.
- Outside direct straight-line guide is not automatically treated as a proper pedestrian route.

The latest owner instruction takes precedence over previous "always explicit Start" UX policy, but it does NOT override safety requirements.

---

# 3. PRIMARY PROBLEM — DIRECTIONS PANEL DISAPPEARS

The owner reports that the Directions screen/sheet may disappear completely.

This is unacceptable when the user still needs it.

## Required invariant

**Whenever the user is in an active route-planning or guidance context, they must always have a visible, discoverable and actionable way to access directions.**

There are two acceptable implementations depending on current navigation mode.

### A. Before Live Navigation

Directions/route-setup sheet should never collapse below a visible PEEK.

### B. During Live Navigation

The old route-setup sheet can be removed because navigation is active.

However, active directions must remain accessible through a visible instruction panel/strip or dedicated Directions control.

**A user must never be trapped on Map with no visible way to see directions again.**

Audit both cases separately.

---

# 4. Full Directions Sheet Audit

Inspect the real implementation and identify all sheet/panel lifecycle owners.

Likely areas:

- `HomeScreen.tsx`
- `LocationSheet.tsx`
- `DirectionsViewModel.ts`
- `JourneyPresentationState.ts`
- `RouteGuideCard.tsx`
- `NavigationViewModelV2.ts`
- Sheet gesture/detent helpers
- Map viewport/inset controllers
- Route Preview and active navigation components
- Back/cancel handlers
- Navigation overlays
- Store state and component mount keys

Inspect the exact sheet library and version before assuming native Android or @gorhom APIs.

### Investigate all ways the sheet can disappear

- Downward swipe
- Aggressive/fling gesture
- PEEK → hidden transitions
- Drag below the minimum snap point
- Back button
- Android predictive Back
- Outside/backdrop tap
- Map tap
- Component unmount
- Route recalculation
- GPS fix arriving
- Permission popup
- Destination change
- Route Guide activation
- Live Navigation activation
- Reroute
- Location authority loss
- Background/resume
- Process-death restoration
- Dynamic content height changes
- Keyboard opening/closing
- 200% font scaling
- RTL layout
- Gesture/navigation bar overlap
- Stale or mismatched sheet refs
- State-driven conditional rendering

Find root causes with file/function references.

Do not assume PR #353 already solved every case simply because the original PEEK behavior was merged.

---

# 5. FIX — NON-DISMISSIBLE DIRECTIONS SETUP SHEET

Before actual Live Navigation, including:

- Destination-focused Map
- Needs-start state
- Permission recovery
- Route calculation
- Route Preview
- Same-place explanation
- Route failure
- Manual Route Guide
- Outside-venue guide

the relevant directions/journey panel must have a guaranteed accessible presentation.

Expected detents:

**FULL**
- Expands close to available top safe area.
- Essential content scrollable.
- Primary actions reachable.

**PARTIAL**
- Comfortable middle position.
- Shows key journey information.

**PEEK**
- Minimum visible collapsed state.
- Clearly tappable.
- Can reopen PARTIAL/FULL.

### Strict requirements

1. Downward swipe from FULL goes to PARTIAL/PEEK.
2. Downward swipe from PARTIAL goes to PEEK.
3. Downward swipe from PEEK must not hide the panel.
4. Tapping PEEK expands it.
5. Upward dragging PEEK expands it.
6. PEEK must remain above system navigation/gesture bars.
7. No zero-height or off-screen resting position.
8. No transparent but touch-blocking overlays.
9. No hidden controls receiving accessibility focus.
10. No state change should silently dismiss the panel.

If the current library supports a hidden index such as `-1`, prevent that state in contexts that require visible PEEK.

If the library supports pan-down-to-close, disable it for setup/preview/guide surfaces where appropriate.

Do not blindly change every sheet globally.

The exact implementation must be compatible with the installed library and existing detent code.

### IMPORTANT: collapse ≠ cancel

Swiping the sheet down should not:

- Cancel destination
- Clear route
- Exit Route Guide
- End navigation
- Clear manually chosen origin
- Reset map camera
- Drop pending calculation
- Reset steps

Only explicit user actions or legitimate lifecycle transitions may do those things.

---

# 6. ACTIVE LIVE NAVIGATION — DIRECTIONS MUST BE RETRIEVABLE

Once Live Navigation actually starts:

The previous setup/preview Directions sheet should disappear from the active UI.

It must not remain mounted as a duplicate interactive layer.

Instead, active navigation should provide:

- Current maneuver/instruction
- Remaining distance
- Destination context
- Next-step information where supported
- Visible access to complete step-by-step directions
- Clear Stop/Exit action
- Correct route-progress display

## Active direction panel behavior

Preferred:

A compact visible active-navigation instruction strip remains on screen and can expand to show full directions.

If the existing architecture instead hides full instructions:

Provide an unmistakable, accessible **Directions** button that reopens them.

That control must remain available through all valid active-navigation states.

### Mandatory cases

The user must be able to reopen directions after:

- Collapsing the guidance panel
- Panning the map
- Recentring
- Background/resume
- GPS signal loss
- Rerouting
- Reaching an area with inaccurate GPS
- Changing map orientation
- Returning from Settings
- Temporary system overlays

Do not create a duplicate route engine or new unrelated navigation screen.

Use existing active navigation state.

### Safety on GPS authority loss

PR #359 introduced frozen progress when GPS authority disappears.

Preserve that behavior.

Show a clear location warning, keep the last valid route visible, and keep Directions accessible.

Do not fabricate progress, rerouting or arrival.

---

# 7. RECONCILE AUTO-START WITH DIRECTIONS LIFECYCLE

The new Flow B changes the exact moment the app transitions from setup to active navigation.

Implement a single deterministic transition.

### Valid example

User selects Block 28.

Fresh GPS exists.

Map focuses Block 28.

App calculates route.

On verified success:

- Publish correct active journey.
- Activate tracking exactly once.
- Replace setup sheet with live instruction UI.
- Keep Directions accessible.
- Preserve destination and route identity.

No blank Map interval where both setup and active instruction controls are missing.

### During calculation

Show a visible non-active progress state with Cancel.

Do not claim navigation is running.

### On calculation failure

Stay in a visible route-failure state.

Provide Try Again, Change Start or Change Destination as appropriate.

### On GPS loss before activation

Do not auto-start.

Show recovery/needs-start controls.

### On GPS recovery after cancellation

Do not auto-start a cancelled journey.

### On GPS recovery during manual Route Guide

Do not silently replace the manual guide.

Only a deliberate user-requested upgrade may do so.

---

# 8. PREVIOUS HANDOFF — REMAINING WORK MUST NOT BE LOST

The previous session explicitly reported the following work incomplete.

Continue it without regressing the new owner-approved policy.

## A. Manual → Live upgrade preservation

Current risk:

Manual guide, route and selected step index may be discarded before replacement routing succeeds.

Implement a ViewModel-owned upgrade transaction.

The old manual guide must remain intact while:

- Requesting permission
- Acquiring location
- Validating fix
- Calculating replacement route
- Preparing live activation

If failed or cancelled:

Restore exactly the previous guide, including:

- Original route
- FROM/TO
- Selected step
- Sheet presentation
- Manual guide status

When the user deliberately chooses to upgrade, show and confirm the replacement route before Live Start.

**Exception:** This explicit upgrade flow is separate from Flow B's automatic start after a fresh destination tap.

Do not reuse the automatic activation rule for an existing manual guide.

## B. Contextual permission and Settings recovery

Implement:

- Use my location
- Choose starting point
- Try location again
- Enable phone location
- Open app settings
- Allow precise location where supported

Respect denied, permanently denied, approximate, stale, invalid and services-off states.

Do not repeatedly prompt without user action.

Do not request permission merely for browsing.

## C. Start chooser ownership

Guard selection callbacks against stale journey identity.

Preserve and restore Directory browsing position when cancelling the start chooser.

No late chooser answer can update a newer journey.

## D. Optional Block 2

Block 2 is a hypothetical preview shortcut only.

Never silently treat Block 2 as detected GPS position.

Must be explicitly labelled:

**Preview from Block 2**

Only an explicit "I'm at Block 2" action may convert it into manual route origin.

No automatic movement, rerouting or arrival in hypothetical preview.

## E. Localization

English `en`, Roman Urdu `ur-Latn` and Urdu `ur`.

Cover all touched Directions, preview, active-navigation and permission copy.

Preserve RTL semantics and map geography.

## F. Acceptance matrix

Continue UX-01–28 from previous approved implementation plan, adjusting tests to the updated fast-path policy.

Do not mark the entire plan finished after only solving the Directions sheet.

---

# 9. Mandatory State Matrix

Audit, implement and test each distinct behavior.

| Scenario | Expected result |
|---|---|
| Fresh usable GPS + Block tap | Map → valid route → automatic Live Navigation |
| Fresh GPS + Gate tap | Same valid fast-path behavior |
| Fresh GPS + Rasta/Special Route | Fast-path only if route is supported and safe |
| Granted permission but stale fix | No auto-start; recovery |
| Approximate-only permission | No false live activation |
| No permission + destination | Map → visible origin chooser |
| Manual FROM + TO | Route Preview → Open Route Guide |
| Explicit Block 2 preview | Labelled hypothetical preview |
| Block 2 confirmed manually | Manual Route Guide eligible |
| GPS unavailable during calculation | Safe non-active fallback |
| Route calculation fails | Visible failure panel |
| Same origin/destination | SAME_PLACE, not ARRIVED |
| Outside direct guide | Labelled direction-only mode |
| Sheet FULL dragged downward | PARTIAL or PEEK |
| Sheet PARTIAL dragged downward | PEEK |
| Sheet PEEK dragged downward | Still visible/reopenable |
| PEEK tapped/swiped up | Expands |
| Hardware Back with expanded sheet | Predictable collapse or navigation action |
| Route recalculated | Directions remain accessible |
| Live activation succeeds | Setup replaced by active instruction UI |
| Active instruction panel collapses | Visible instruction strip/reopen control |
| Active navigation loses GPS | Route visible; progress frozen; directions accessible |
| Manual upgrade cancelled | Previous guide and step index preserved |
| New destination selected mid-trip | Explicit conflict resolution; no silent replacement |
| Destination changed rapidly | No stale activation |
| Permission response arrives late | Cannot activate old journey |
| Screen background/resume | Correct UI restored from current authorized state |
| Process death | Existing destination-only recovery policy, no auto-resume |
| Arrival | Actual arrival UI; Done/Exit works |
| English/Roman Urdu/Urdu | Localized, reachable controls |
| 320dp / 200% fonts | Visible, usable panel and reopen controls |
| Airplane mode | Offline map and manual guide functional |

### More concurrency tests

Specifically test:

1. Tap Block A then rapidly Block B.
2. Route A completes after B was selected.
3. Cancel while live route calculates.
4. GPS becomes usable during manual preview.
5. Permission is revoked immediately before activation.
6. GPS recovery occurs after a previously cancelled attempt.
7. Collapse sheet while asynchronous route update completes.
8. Start/Stop/Start in consecutive journeys.
9. Change language while panel is collapsed.
10. Reroute while instructions are expanded.

No old request may publish stale state or steal current journey authority.

---

# 10. Automated and Runtime Verification

Start with focused tests.

After each cohesive patch, run applicable:

- TypeScript typecheck
- ESLint
- Component/unit regression tests
- Relevant GPS capability tests
- Journey authority tests
- Navigation lifecycle tests
- Sheet detent/gesture tests
- Routing provider tests
- `git diff --check`

Before final integration, run the required full validation suite.

Inspect package.json for real script names; do not invent commands.

### Emulator acceptance

If an emulator is available:

Exercise actual touch/drag interaction rather than source assertions alone.

Capture evidence for:

- FULL → PARTIAL → PEEK
- Attempt to drag PEEK completely off-screen
- Tap PEEK to reopen
- 320dp width
- 200% font
- Gesture navigation
- 3-button navigation
- Urdu RTL
- Reduced motion
- Keyboard transitions
- Location granted
- Location denied
- Actual Live Navigation fast path using controlled location provider
- GPS loss/recovery
- Active instructions reopen
- Back/cancel
- Background/resume

If emulator is unavailable, report EMULATOR UNVERIFIED.

Do not claim physical-device, actual TalkBack audio or field validation from emulator tests.

---

# 11. UX Details & Non-Regression Rules

Maintain zero-thinking UX.

The user should never wonder:

- Where did Directions go?
- How do I open them again?
- Did navigation start?
- Is this a preview or real GPS tracking?
- Where am I starting from?
- Why is my position not moving?
- Did the app change my destination?

Avoid unnecessary setup screens.

Avoid duplicated Directions headers, duplicate start buttons and stacked route panels.

Do not add random floating controls if an existing clear control can perform the same function.

Keep touch targets sufficiently large and use accessible text labels.

### Camera invariants

Sheet movement changes available viewport padding only.

It must not:

- Change destination
- Reset origin
- Recalculate route unnecessarily
- Teleport camera
- Undo intentional manual map pan
- Miscenter the route due to stale inset values

Ensure the live-navigation follow camera still behaves appropriately without blocking manual exploration.

---

# 12. Official Technical References

Consult documentation corresponding to installed library versions.

Android bottom-sheet state:
https://developer.android.com/reference/com/google/android/material/bottomsheet/BottomSheetBehavior

React Native Bottom Sheet:
https://gorhom.dev/react-native-bottom-sheet/props

React Native accessibility:
https://reactnative.dev/docs/accessibilityinfo

Android permission guidance:
https://developer.android.com/training/permissions/requesting

Google Maps navigation reference:
https://support.google.com/maps/answer/3273406

Use these as guidance, not proof of the application's actual implementation.

---

# 13. GitHub Delivery Workflow

Use small cohesive PRs with clear ownership.

Suggested order:

**PR 1 — Directions accessibility and sheet lifecycle**

Fix FULL/PARTIAL/PEEK transitions, forbidden hidden states, active instruction access, gesture and Back behavior.

**PR 2 — Fresh-GPS automatic Live Navigation**

Implement the newly approved fast path, preserve PR #359 activation guards and avoid activation races.

**PR 3 — Remaining journey continuity**

Implement manual-to-live preservation, permission recovery, chooser ownership and browser restoration.

**PR 4 — Block 2 and localization**

Finish hypothetical preview and all affected translations/accessibility.

Adapt grouping to actual changed-file dependencies. Prevent overlapping PRs from editing the same active files.

For each validated PR:

1. Review scope and diff.
2. Run relevant tests.
3. Typecheck/lint.
4. Commit.
5. Push.
6. Open PR against canonical.
7. Verify exact-head CI.
8. Independent review.
9. Merge only when safe, with expected-head guard.
10. Verify canonical result.

Do not force-push canonical or bypass branch protections.

Do not delete useful historical issues.

Do not build a new release APK unless separately authorized.

---

# 14. Mandatory Usage-Limit Rule

Continuously check visible capacity indicators in this order:

1. Five-hour/daily/short-term usage
2. Weekly usage
3. Context/compaction warnings
4. Other paid/tool limits

Checkpoint thresholds:

- 90% short-term used
- 95% weekly used
- Critical context/compaction warning

Never invent percentages.

At a triggered checkpoint:

- Begin no new major task.
- Finish only the current safe atomic operation.
- Preserve raw evidence and validated results.
- Commit/push completed validated work if possible.
- Do not label incomplete work finished.
- Produce a detailed continuation handoff **IN CHAT**.
- Include canonical SHA, worktree, branch, PRs, finished stages, remaining work, tests, blockers and the precise next step.

Use bounded waits:

- General stalled process: investigate around 5 minutes.
- Gradle: around 12 minutes.
- Emulator boot: around 3 minutes.
- ADB command: around 30 seconds.

Do not waste long sessions on inactive/background processes.

Prefer targeted diffs, test counts and concise reports over large source dumps.

---

# 15. Required Final Handoff

At the end report:

1. Canonical branch and current SHA.
2. Which previous PRs were already complete.
3. Exact Directions-sheet root causes.
4. How hidden/collapsed/expanded behavior was fixed.
5. How Directions reopen during Live Navigation.
6. Whether fresh-location automatic Live Navigation works.
7. Whether unavailable-location/manual Route Guide works.
8. Whether GPS loss and late callbacks are safe.
9. Status of manual-to-live upgrade preservation.
10. Block 2 shortcut status.
11. Localization/accessibility status.
12. All PRs and merge SHAs.
13. Typecheck/lint/test results.
14. Emulator evidence or explicitly unverified states.
15. Remaining software work.
16. Exact next action.

Use explicit evidence categories:

- SOURCE VERIFIED
- AUTOMATED VERIFIED
- EMULATOR VERIFIED
- PHYSICAL UNVERIFIED
- FIELD UNVERIFIED

---

# FINAL OWNER DIRECTIVE

**AUDIT AND FIX THE DIRECTIONS PANEL, THEN IMPLEMENT THE APPROVED TWO-FLOW NAVIGATION POLICY.**

The final product must follow:

### NO USABLE LOCATION

Directory → Destination → Map → Resolve Origin → Route Preview → Explicit Route Guide / Live Navigation when eligible → Arrival/Exit.

### FRESH USABLE LOCATION

Directory → Destination → Map → **Automatic Live Navigation** → Arrival/Exit.

The route must still be calculated and verified before live activation.

**Directions must never become inaccessible while route planning or guidance is active.**

Before navigation: visible expandable PEEK.

During Live Navigation: accessible active directions and a reliable reopen mechanism.

Preserve the safety protections and existing offline routing behavior.

Continue from the last validated checkpoint. Implement, test, review and integrate the changes rather than producing another audit-only report.