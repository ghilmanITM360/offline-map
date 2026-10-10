# KARACHI IJTEMA OFFLINE MAP — APPROVED UX & NAVIGATION IMPLEMENTATION

## ROLE & EXECUTION AUTHORIZATION

Act as a Principal React Native Engineer, Navigation Systems Architect, Senior Mobile UX Designer, Accessibility Specialist and QA Engineer.

**The owner has approved the recommendations from the previous Location Selection, GPS Permission, Block 2, Route Guide and Navigation UX Audit.**

Your task is now to **IMPLEMENT, TEST, REVIEW, COMMIT, PUSH and integrate** the approved changes into the actual `offline-map` project.

This is NOT another research-only or planning-only task.

However, do not start writing code blindly. First verify the current repository and prepare a short implementation plan, then execute the approved work in safe, cohesive stages.

Do not repeatedly ask for approval for decisions already authorized here. Escalate only genuine scope changes, destructive operations or irreconcilable product conflicts.

---

# 1. Project Identity & Source of Truth

Repository:

`ghilmanITM360/offline-map`

Canonical branch:

`integration/ijtema-clean-baseline`

Last audited remote canonical SHA:

`57529e305332c761358da51d18b8be292e5b7a7e`

The audit found:

- Workspace HEAD: `42451f1bc9deaeda822e5de5fca00782fd5e366b` (detached)
- Local canonical ref: stale `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`
- Remote canonical was newer.
- Working tree was clean.

These are historical audit observations, not guaranteed live truth.

**Mandatory initial steps:**

1. Confirm correct repository.
2. Fetch latest remote refs.
3. Verify actual canonical HEAD.
4. Check open PRs, CI and changed-file conflicts.
5. Inspect `AGENTS.md`, `CLAUDE.md` and relevant available skills.
6. Read current architecture and user-flow documentation.
7. Inspect the existing tests for affected functionality.
8. Check current visible usage limits.

Do not assume that the detached workspace checkout is canonical.

Use isolated worktrees and feature branches based on the verified latest canonical SHA.

Do not touch unrelated projects.

---

# 2. Locked Product Requirements

These rules must not regress:

1. Core navigation works 100% offline.
2. MapLibre + bundled PMTiles remains the map foundation.
3. Directory is the single place chooser.
4. Map is for route presentation and navigation, not duplicate searching.
5. No traditional bottom-navigation tabs.
6. GPS permission is optional for browsing and manual guidance.
7. Live Navigation requires a genuinely fresh, usable precise location.
8. Manual FROM + TO provides Route Guide, not fake GPS navigation.
9. Never invent, silently assume or reuse the user's actual position.
10. Never represent straight-line outside-venue guidance as a verified walking-road route.
11. Preserve navigation recovery and arrival correctness.
12. Maintain existing working FULL/PARTIAL/PEEK sheet behavior.
13. Preserve user-controlled map camera positioning and route context.
14. English, Roman Urdu and Urdu RTL must work.
15. Accessibility must remain supported.
16. Do not introduce remote tile, paid-routing, Google Maps or new internet requirements.

The design philosophy is **zero-thinking UX**: a user unfamiliar with map applications should immediately understand what happened and what to do next.

---

# 3. PHASE 1 — Fix GPS & Journey Safety

**Priority: P0 — Complete before changing navigation activation.**

Previous audit identified the following source-level problems:

### A. Invalid location accuracy

Previously observed:

- Missing accuracy becomes `0`, implying perfect accuracy.
- Negative accuracy can pass validation.
- `NaN` accuracy can pass validation.
- Unknown location precision may be treated as live-capable.

Inspect:

- `LocationCapability.ts`
- `LocationAccessService.ts`
- `LocationNavigationCapability.ts`
- Related location provider adapters
- Existing capability tests

Implement fail-closed validation.

Requirements:

- Missing accuracy never means perfect accuracy.
- Reject non-finite, negative and otherwise invalid values.
- Reject missing, stale, future-invalid or untrustworthy timestamps.
- Unknown permission precision must not authorize Live Navigation.
- A precise permission alone is not proof of a usable fix.
- Do not turn invalid data into a valid location through fallback defaults.
- Preserve valid provider support and existing GPS lifecycle protections.

Use the project's verified freshness and accuracy policies rather than inventing new thresholds.

### B. Incorrect LIVE_READY classification

Inspect:

`JourneyPresentationState.ts`

Previously, `startSource === 'live_gps'` could cause misleading LIVE_READY classification.

Fix the semantic readiness contract so that Live Navigation is available only when all required conditions are valid:

- Current journey identity
- Current authorized live origin
- Appropriate foreground permission
- Required precise authorization
- Enabled location services where necessary
- Valid accuracy and timestamp
- Fresh usable location
- Valid route
- Correct destination
- Compatible route classification

A source string alone must never establish navigation readiness.

### C. Final navigation activation guard

Inspect:

- `DirectionsViewModel.ts`
- `NavigationViewModelV2.ts`
- `useAppStore.ts`
- Final navigation-command boundary

Revalidate prerequisites immediately before starting a live session.

Even if a UI incorrectly enables a CTA, the final command must reject unsafe activation.

### D. Journey identity and stale asynchronous results

Previously identified risks:

- Cancelled location acquisition completing after cancellation
- Old destination reappearing after a late response
- Previous manual origin leaking into a new journey
- One-shot refs surviving destination replacement
- Deferred Start callback acting on a different journey

Implement explicit current-journey identity and cancellation/generation guards.

A response from Journey A must never mutate or activate Journey B.

Distinguish:

- New journey
- Same-trip destination edit
- Manual guide
- Hypothetical Block 2 preview
- Live navigation activation
- Journey cancellation
- Recovery

Do not persist old GPS authority.

**Phase 1 acceptance:**

No invalid GPS fix becomes live-ready, no stale asynchronous result changes a newer journey, and no live session starts without valid current prerequisites.

Add focused regression tests.

---

# 4. PHASE 2 — Fix Directory → Map UX

## Current reported defect

1. User opens Directory.
2. Scrolls down the Blocks list.
3. Selects Block 28.
4. App transforms the Directory into a starting-point chooser.
5. A "Use my location" action appears above the user's viewport.
6. The scroll position remains unchanged.
7. Under some search/category states, the location action disappears.
8. Another Block tap may unexpectedly become starting-point selection.

**Replace this confusing behavior.**

## Approved new behavior

When the user taps any valid destination:

- Block
- Gate
- Rasta
- Special Route
- Recent place
- Any other genuinely supported public place

the app should open the **existing Map screen** with that destination visibly focused.

Do NOT add another navigation screen.

Do NOT create another Map search system.

Do NOT solve only the symptom with unconditional `scrollToTop()`.

The Map journey panel becomes responsible for explaining what happens next.

### Example

User selects Block 28.

Map opens.

Journey panel:

**To: Block 28**

If no usable origin exists:

**Where are you starting from?**

Primary:

`Choose starting point`

Secondary:

`Use my location`

Optional tertiary:

`Preview from Block 2`

These actions must be visible and reachable even at narrow widths or large font sizes.

### Manual starting-point selection

If the user taps Choose starting point:

- Open Directory in an explicitly labelled starting-point mode.
- Show a clear heading such as "Choose starting point".
- Keep the current destination visible or otherwise clearly identifiable.
- Make search and categories work.
- Do not silently reinterpret an ordinary destination list.
- Ensure the title and primary navigation controls are visible regardless of prior scroll position.
- Cancel returns safely to the existing destination-focused Map.
- Preserve and restore prior destination-browsing query, category and scroll where appropriate.
- Do not allow stale selection or asynchronous data to change another journey.

Use the application's existing navigation and state architecture rather than adding unnecessary global state.

### Details behavior

If user explicitly chooses Details:

Show place information without automatically beginning route calculation or live navigation.

Keep Details distinct from "Take me here".

---

# 5. PHASE 3 — Contextual Location Permission

## Approved behavior

Do NOT automatically show the Android permission popup merely because the user selected a Block.

A permission request should happen following an explicit location-dependent action, such as:

`Use my location`

or

`Start live navigation`, when permission is actually required.

If a previously granted, usable live fix already exists, reuse it after validating current capability.

## Permission scenarios to support

### Never requested

Explain briefly why location is useful, then request the required foreground permission following explicit user action.

### Denied once

Do not spam OS prompts.

Keep these alternatives available:

- Choose starting point
- Try my location again, if permitted

### Permanently denied

Offer:

`Open app settings`

This must be an explicit action, not an automatic redirect.

### Approximate permission

Manual Route Guide remains available.

Explain that live pedestrian guidance requires a usable precise location and offer an appropriate upgrade action.

### Location Services disabled

Provide:

`Turn on phone location`

Do not confuse disabled services with denied app permission.

### Permission granted, no GPS fix

Show bounded location acquisition.

On failure:

- Try again
- Choose starting point

Do not leave endless loading.

### Stale/inaccurate/unknown fix

Do not activate Live Navigation.

Offer recovery options.

### Permission revoked during navigation

Reevaluate capability, avoid falsely advancing the route, and show appropriate recovery behavior.

Preserve route context without inventing GPS movement.

### Android requirements

Respect Android 12+ precise/approximate behavior and the foreground permission rules supported by the installed Android/React Native stack.

Relevant official reference:

https://developer.android.com/develop/sensors-and-location/location/permissions/runtime

No repeated permission request loops.

No forced permission for browsing or manual Route Guide.

---

# 6. PHASE 4 — Route Preview Before Navigation

## Approved decision

**A normal destination tap must NOT automatically start Live Navigation.**

This explicitly replaces the old auto-start behavior.

### With fresh usable GPS

Flow:

Directory
→ Select Block 28
→ Map focuses Block 28
→ Route calculated
→ Route Preview displayed
→ User reviews FROM and TO
→ User taps **Start live navigation**
→ Actual tracked navigation begins

If acquisition is required and already authorized, show a bounded progress state and allow manual fallback.

### Route Preview must include

- FROM
- TO
- Route displayed on map
- Total distance
- Walking-time estimate where justified
- Correct route classification
- Clear primary action
- Change start/destination affordances
- Back/cancel behavior
- Correct unavailable-route messages

Avoid misleading ETAs.

### Manual start

Flow:

Directory
→ Destination
→ Map
→ Choose starting point
→ Select Block/Gate/Rasta
→ Calculate route
→ Route Preview
→ **Open Route Guide**

Do not automatically activate Route Guide before the user can understand or review the route.

### Mode naming

Reserve:

**Start live navigation**

for actual GPS-tracked navigation.

Use:

**Open Route Guide**

for manual guidance.

Do not use vague "Start route" language where the distinction matters.

### When preview must not falsely appear as ready

- No origin
- Invalid route
- Same start and destination
- Unsupported routing pair
- Unresolved location acquisition
- Route calculation error

Display clear actionable states instead.

---

# 7. PHASE 5 — Optional Block 2 Preview

## Approved policy

Block 2 (Mimbar Block) may be offered as an optional **hypothetical preview origin**.

It must NEVER silently become the user's actual location.

### User journey

Destination: Block 28

GPS unavailable.

Show:

- Choose starting point
- Use my location
- Preview from Block 2

If user explicitly taps:

`Preview from Block 2`

calculate the route from the actual canonical Block 2 data to Block 28, if supported.

Show:

**From: Block 2 (Preview)**

**To: Block 28**

Add a persistent, understandable notice:

"This preview starts at Block 2. Your actual location is not being tracked."

Provide:

- I'm at Block 2
- Change starting point

### Critical technical distinction

**Hypothetical preview origin ≠ manual confirmed origin ≠ live GPS origin.**

Keep these separate in state and presentation.

A hypothetical preview must not:

- Write to `currentLocation`
- Create a GPS user-position dot
- Trigger automatic progress
- Trigger automatic reroute
- Trigger automatic arrival
- Start Live Navigation
- Become the origin of a new journey without explicit authorization

If the user taps "I'm at Block 2", they explicitly authorize Block 2 as their current manual starting point for that journey.

That can enable manual Route Guide, subject to a valid route.

### Special cases

- Block 2 → Block 2: SAME_PLACE, not ARRIVED.
- GPS becomes available: Offer an explicit live-location route switch.
- New destination/new journey: No silent Block 2 reuse.
- Outside-venue attendee: Block 2 preview only represents a hypothetical venue route, not a real outside walking route.

Resolve Block 2 from canonical place data.

Do not fabricate coordinates.

---

# 8. PHASE 6 — Route Guide & Live Navigation Separation

Preserve two truthful modes.

## Manual Route Guide

Requires:

Explicit actual manually selected FROM + TO and a valid walking route.

Supports:

- Full route geometry
- Distance
- Walking steps
- Previous/Next step
- Directional guidance where supported
- Manual route completion/exit

Does NOT automatically provide:

- GPS-driven progress
- Automatic next-step advancement
- Automatic rerouting
- Automatic arrival

Does not require location permission.

## Live Navigation

Requires:

- Fresh usable precise location
- Valid route
- Authorized current journey
- Explicit live Start

Supports existing tracked functionality:

- Current location
- Route progress
- Instruction advancement
- Rerouting
- Arrival detection

Preserve existing GPS noise, parallel-corridor and arrival protections.

## Manual → Live transition

If a user is reading a manual Route Guide and chooses to use live location:

1. Confirm that the user wants to switch.
2. Obtain and validate fresh location.
3. Recalculate route using the true current position.
4. Show updated FROM, TO and route.
5. Explicitly offer Start live navigation.
6. Replace manual mode only after safe activation.

If location acquisition fails or the user cancels, preserve their existing manual guide.

## Outside venue

Preserve the hybrid routing architecture.

A direct straight-line gate connector must never be labelled as an ordinary walkable route.

No fabricated outside-route ETA, walking turns or arrival claim.

If only directional guidance exists, show **gate-direction guidance** with clear limitations.

Ordinary live walking navigation must require a valid applicable route.

---

# 9. PHASE 7 — Directions Sheet, Camera & Accessibility

Preserve the working sheet behavior reported in PR #353.

### Before navigation

During:

- Place preview
- Needs-start state
- Route calculation
- Route preview
- Manual guidance

the appropriate journey panel must remain discoverable.

A swipe may collapse it to visible PEEK.

It must not disappear entirely.

### During Live Navigation

When actual live tracking begins:

- Remove the setup Directions sheet.
- Show active navigation controls.
- Ensure old controls are no longer focusable or touchable.
- Do not leave stacked duplicate panels.

### Camera behavior

Selecting a destination should focus that destination appropriately.

Changing FULL/PARTIAL/PEEK must affect viewport padding, not the semantic navigation target.

Do not repeatedly override user pan due to stale effects.

### Accessibility

Support:

- TalkBack-compatible semantic roles and labels
- Logical focus transfer after Map transition
- Screen-reader announcement for the new destination and next action
- Minimum effective 48dp touch targets
- 200% font scaling
- 320dp layout
- Reduced motion
- Keyboard dismissal
- Gesture and three-button navigation
- RTL icon behavior
- Safe-area handling

Check the installed React Native version before selecting accessibility-focus APIs.

Do not introduce screen-reader announcements that repeat continuously on rerender.

Actual audible TalkBack acceptance remains part of the physical-device phase if no suitable test environment is available.

---

# 10. PHASE 8 — Complete Journey Localization

Use the existing localization infrastructure.

Required locales:

- English — `en`, LTR
- Roman Urdu — `ur-Latn`, LTR
- Urdu — `ur`, RTL

Cover all touched flows:

- Directory selection
- Starting-point selection
- Permission rationale
- Location acquisition
- Permission denial
- Precise-location recovery
- Map journey panel
- Route Preview
- Block 2 hypothetical notice
- Manual Route Guide
- Start Live Navigation
- Outside gate-direction guidance
- Route failures
- Same Place
- Back/Cancel
- Active navigation controls
- Accessibility labels and announcements

Avoid introducing new hardcoded English strings.

Maintain consistent localization keys.

Do not mirror geographic map geometry in RTL.

Check Urdu wrapping and mixed numerals/English labels.

If native Urdu linguistic review is unavailable, report it as unverified rather than claiming production-ready translations.

---

# 11. Source Areas to Inspect

Previous audit highlighted these files:

- `src/views/screens/LocationsDirectoryScreen.tsx`
- `src/views/screens/HomeScreen.tsx`
- `src/views/components/map/LocationSheet.tsx`
- `src/views/components/map/RouteGuideCard.tsx`
- `src/viewmodels/DirectionsViewModel.ts`
- `src/viewmodels/NavigationViewModelV2.ts`
- `src/services/JourneyPresentationState.ts`
- `src/services/LocationCapability.ts`
- `src/services/LocationAccessService.ts`
- `src/services/PublicDestinationsService.ts`
- `src/store/useAppStore.ts`

Also inspect:

- Journey start planner
- Navigation capability resolver
- Map camera helpers
- Sheet lifecycle helpers
- Language files
- Permission helpers
- Route providers
- Existing test fixtures
- Journey and product documentation

These are investigation starting points, not instructions to edit every file.

Use actual repository state and exact dependency versions.

Avoid unnecessary refactoring.

---

# 12. Mandatory End-to-End Acceptance Matrix

Cover at least the following scenarios.

| ID | Scenario | Expected result |
|---|---|---|
| UX-01 | Deep-scroll Block selection | Map opens with visible destination panel |
| UX-02 | Filtered/search Block selection | No hidden location action |
| UX-03 | Gate/Rasta/Special Route selection | Same correct selection flow |
| UX-04 | No permission | Destination visible; choose start or location |
| UX-05 | Permission denied | Manual Route Guide available |
| UX-06 | Permanently denied | Optional Settings recovery |
| UX-07 | Approximate only | No false live readiness |
| UX-08 | GPS unavailable | No fake location or active tracking |
| UX-09 | Fresh GPS | Route Preview, explicit Start |
| UX-10 | Manual FROM + TO | Preview then manual Route Guide |
| UX-11 | Block 2 shortcut | Labelled hypothetical preview |
| UX-12 | Confirm "I'm at Block 2" | Manual route only |
| UX-13 | Block 2 → Block 2 | SAME_PLACE |
| UX-14 | Destination changed | Previous journey cannot auto-activate |
| UX-15 | Cancel during GPS request | No late destination/navigation |
| UX-16 | Invalid/NaN/negative accuracy | Rejected |
| UX-17 | Unknown precision | Not LIVE_READY |
| UX-18 | Manual guide → GPS | New route preview before live Start |
| UX-19 | Outside direct guide | Honest gate-direction presentation |
| UX-20 | Route calculation failure | Clear error; no dead Start |
| UX-21 | FULL → PARTIAL → PEEK | Panel remains reachable |
| UX-22 | Live navigation begins | Setup panel replaced by live controls |
| UX-23 | Arrival | Proper arrival then Directory |
| UX-24 | Process death/recovery | Fresh journey; no auto-resume |
| UX-25 | Airplane mode | Core map and Route Guide remain functional |
| UX-26 | 320dp and 200% font | All essential controls reachable |
| UX-27 | Urdu RTL/Roman Urdu/English | Correct flow and readable labels |
| UX-28 | Multiple consecutive journeys | No source or callback leakage |

For each:

- Add/update appropriate automated test.
- Execute applicable tests.
- Record PASS/FAIL/BLOCKED.
- Cite specific evidence.
- Do not call source-only assertions emulator verification.

Check further relevant edge cases uncovered by the implementation.

---

# 13. Engineering & Integration Workflow

Execute the work in small, cohesive, dependency-aware PRs.

Suggested grouping:

**PR A — GPS safety and journey authority**
- Accuracy validation
- Readiness classification
- Final live guard
- Stale response and journey identity protection

**PR B — Directory and origin-resolution UX**
- Directory → Map handoff
- Visible Map journey panel
- Explicit starting-point chooser
- Contextual permission handling
- Scroll/focus/back correctness

**PR C — Preview and navigation activation**
- Remove destination-tap auto-start
- Route Preview
- Explicit live Start
- Manual guide preview and clear CTA
- Safe manual-to-live transition

**PR D — Block 2 hypothetical preview**
- Optional shortcut
- Hypothetical origin isolation
- Explicit manual confirmation
- Route/label regression tests

**PR E — Localization and responsive UX**
- Three-language coverage
- Accessibility
- RTL/LTR
- Sheet/camera regression coverage

Use the actual code dependencies to refine this grouping. Split or consolidate only when it improves safe, reviewable delivery.

### PR requirements

For every coherent validated change:

1. Focused tests
2. Typecheck/lint and required regressions
3. Review changed files
4. `git diff --check`
5. Commit
6. Push
7. PR targeting verified canonical
8. CI verification
9. Exact-head merge, only if authorized checks are green and merge state is safe
10. Confirm canonical contains the merge

Do not force-push canonical, bypass checks or use admin merge shortcuts.

Do not merge a PR that became stale or conflicts with another active change.

If an operation fails, diagnose rather than repeatedly retrying it without progress.

### Validation commands

Inspect package scripts before running.

Expected relevant commands may include:

```
npm run typecheck
npm run lint
npm test
npm run test:components -- --runInBand
git diff --check
```

Run routing-specific regression suites when route behavior or state ownership changes.

Preserve previous passing tests where applicable and update assertions intentionally for the approved removal of automatic live-start behavior.

Do not manipulate tests solely to obtain a green result.

### Scope restrictions

- No unrelated repository changes.
- No new paid services.
- No unnecessary dependencies.
- No production signing.
- No Play Store release.
- No physical/field verified claims without evidence.
- No new APK in this implementation campaign unless separately authorized.
- No premature ticket closing.

Update affected documentation so it matches the implemented behavior.

---

# 14. Mandatory Usage-Limit & Recovery Rules

Follow the owner's standing capacity and efficiency requirements.

Always prioritize:

1. Short-term / five-hour / daily limit
2. Weekly limit
3. Context/compaction warnings
4. Tool-specific limits

Trigger a safe checkpoint at:

- 90% short-term usage
- 95% weekly usage
- Any critical context or compaction warning

If usage percentages are unavailable, explicitly acknowledge that and do not invent them.

At checkpoint:

- Begin no new major operation.
- Finish only the current safe atomic step.
- Preserve evidence and checksums where appropriate.
- Commit/push validated complete units when possible.
- Do not publish incomplete work as finished.
- Provide an immediate detailed continuation handoff **IN CHAT**, not just in a file.
- Stop safely.

The handoff must include:

- Current canonical and feature HEADs
- Completed work
- Remaining work
- PR numbers and status
- Tests and exact results
- Failed checks
- Files modified
- Artifacts/evidence
- Blockers
- Exact next command/task

### Execution time limits

Do not wait indefinitely on background commands.

- General stalled local process: investigate after approximately 5 minutes.
- Gradle: approximately 12-minute diagnostic bound.
- Emulator startup: approximately 3-minute diagnostic bound.
- ADB command: approximately 30-second diagnostic bound.

Treat these as stall-investigation thresholds, not excuses to skip necessary validation.

### Token efficiency

- Avoid repeating full project history.
- Read only relevant source sections when enough to establish truth.
- Prefer diffs to complete file dumps.
- Keep routine progress updates concise.
- Use exact error output.
- Avoid repeating the same unsuccessful command without changing the diagnostic approach.

---

# 15. Final Delivery Requirements

At completion, report IN CHAT:

1. Latest canonical branch and exact SHA
2. Every PR created and merged
3. Features implemented
4. GPS and journey-state bugs fixed
5. Actual Directory → Map behavior
6. Permission behavior
7. Block 2 behavior
8. Manual Route Guide behavior
9. Live Navigation behavior
10. Route Preview decision behavior
11. Localization status
12. Automated test results and counts
13. Emulator proof, if available
14. Anything still unverified
15. Remaining physical/field work
16. Any follow-up actions

Provide a concise explanation of how journey state, location capability and navigation activation now work so the owner can maintain the system.

Use evidence labels:

- SOURCE VERIFIED
- AUTOMATED VERIFIED
- EMULATOR VERIFIED
- PHYSICAL UNVERIFIED
- FIELD UNVERIFIED

Do not claim success for an operation that was not executed.

---

# FINAL OWNER INSTRUCTION

**Implement the approved design now.**

The final experience must be:

**Directory → Select destination → Map → Resolve origin if necessary → Route Preview → Explicit Route Guide or Live Navigation → Arrival/Exit.**

No confusing hidden location card.

No silently assumed starting location.

No GPS permission required for manual planning.

No automatic live navigation from an ordinary destination tap.

No false LIVE_READY.

No previous-journey state leakage.

Block 2 is an explicit hypothetical preview shortcut, never fake detected location.

Maintain existing 100% offline navigation and accessibility contracts.

**Start by verifying latest canonical state, preparing a short dependency-aware implementation plan, and then execute the approved changes with tests and safe GitHub integration. Do not stop at another audit unless a genuine blocker prevents implementation.**