# Deep UI/UX Audit — Karachi Ijtema Offline Navigation

Findings register. See `SCREEN_AND_COMPONENT_INVENTORY.md` for what has and hasn't had
a full A–O pass. See `REDESIGN_AND_SIMPLIFICATION_PLAN.md` for KEEP/REFINE/REDESIGN
calls. See `CLAUDE_CODEX_HANDOFF.md` for anything needing owner or Codex input.

No completion percentage is claimed anywhere in this document, per mission instruction —
coverage is stated screen-by-screen in the inventory doc instead.

---

## FINDING #146 — Directory browse/search disagreed on unavailable-gate visibility

- **Screen/component**: `LocationsDirectoryScreen` (browse), `SearchService` (search),
  `PublicDestinationsService`, `V2PlaceAdapter`.
- **Problem**: Gate 18 and Gate 19 have real, verified coordinates but are blocked on
  physical ground-truth connector verification (`connectorStatus: 'ground_truth_required'`
  in `src/data/ijtema/gates.ts`). `SearchService.searchV2` passed
  `includeUnavailableGates: true` into `V2PlaceAdapter`, so these gates could surface in
  search. `PublicDestinationsService.getAll`/`getByCategory` (directory browse) passed no
  options, so the same gates were filtered out of browse entirely. A user could find
  Gate 18 by typing its name but never by scrolling the Gates category — or the reverse:
  see it in Recent (pushed there by a prior visit) with no way to find it again by
  browsing.
- **Supporting evidence**: `src/services/V2PlaceAdapter.ts` lines ~203–241 (the
  `includeUnavailableGates` filter, applied identically in both `getAllPlaces` and
  `getPlacesByCategory`); `src/services/SearchService.ts` `searchV2()` passing
  `includeUnavailableGates: true`; `src/services/PublicDestinationsService.ts` (pre-fix)
  passing no options.
- **User impact**: an attendee near Gate 18 searching for it by name would find it (with
  a route dead-end); the same attendee browsing the Gates list would never see it exists
  at all — an inconsistent, confusing model of "does this gate exist in the app."
- **Proposed improvement / owner decision**: approved direction (2026-09-27, this
  session): show verified-but-blocked gates consistently in both surfaces, muted,
  disabled, with a plain-language reason; never enable routing to them; rely on the
  directory's existing category-list adjacency (the gate sits in the same "Gates" list
  as available gates) to satisfy "obvious way to find available alternatives," rather
  than inventing a new "nearby gate suggestion" feature nothing else in the app has.
- **Implementation state**: **FIXED**. `PublicDestinationsService.getAll`/`getByCategory`
  now pass `{ includeUnavailableGates: true }`, matching search. Reused the existing #96
  `DestinationRow`/`LocationSheet` disabled+reason+accessible-label treatment — no new
  component. Commit `9b576a5`.
- **Test evidence**: `src/__tests__/PublicDestinationsService.test.ts` — rewrote the test
  that had codified the old hidden-in-browse behavior into one asserting parity between
  browse and search (same id set, same `isRoutable`/`unavailableReason` per gate).
  `src/__tests__/LocationsDirectoryScreen.test.tsx` RECENT-07 updated: the gate now
  legitimately renders twice (Recent section + its own Gates section), both instances
  disabled — was a single-instance assumption baked into the old test, not a weakened
  assertion. Full suite: `npm run test:components -- --runInBand` → 73/73 suites,
  641/641 tests passing. `npm run typecheck` and `npm run lint` clean.
- **Runtime verification state**: **RUNTIME UNVERIFIED** — no Android emulator/device in
  this session's environment; verified at the source/unit-test level only.

---

## FINDING V1V2-REACHABILITY — Navigation V1/V2 control-flow trace (resolved)

- **Screen/component**: `HomeScreen.tsx`, `useNavigationOverlayV1.ts`, `useNavigationOverlayV2.ts`,
  `NavigationViewModel.ts` (legacy), `NavigationViewModelV2.ts`, `V2NavigationAdapter.ts`,
  `DirectionsViewModel.ts`, `useMapMode.ts`.
- **Question**: is `NavigationChromeV1`/`NavigationMapLayersV1` dead code now that V2 exists?
- **Answer: no. V1 is genuinely live**, not legacy dead weight. Traced end to end:
  1. **Two destination models coexist by design**, tagged `Place.sourceVersion: 'v1' | 'v2'`.
     `'v1'` = legacy Blocks from `IJTEMA_DATA` (`constants/data.ts`); `'v2'` = the newer
     Gates/facility model (`V2PlaceAdapter`, the same one `PublicDestinationsService`/#146
     reads from). Both models are live simultaneously today — v2 has not fully replaced v1.
  2. **Two independent "Start Navigation" call sites, gated by that tag**:
     - `DirectionsViewModel.ts:544` (`handleStartNavigation`) — explicit guard
       `if (!destination || !route || isV2Destination) return;` — legacy-only, computes
       its route via the old `RoutingService` (not `RoutingServiceV2`), tagged `'v1'`
       (`src/services/RoutingService.ts:442`).
     - `HomeScreen.tsx:1163` (`handleStartPreviewNavigation`) — always builds its route
       via `V2NavigationAdapter.fromPreview`, which unconditionally tags
       `sourceVersion: 'v2'` (`V2NavigationAdapter.ts:236`).
     Both call the same store action, `startNavigation(dest, route, instructions)`
     (`useAppStore.ts:376-378`), which sets `destination` + `activeRoute` in one atomic
     `set()` — no separate-tick race between them.
  3. **Mutual exclusion is enforced structurally, not by a flag**:
     `NavigationViewModel.ts:101` — `if (activeRoute && activeRoute.sourceVersion === 'v2') return;`
     inside the effect that would otherwise adopt `activeRoute` as v1's own `route`. So
     whenever a v2 route is active, v1's `NavigationViewModel` never sets its local `route`
     state, `useNavigationOverlayV1().active` (`!!route`) stays `false`, and
     `NavigationChromeV1`/`NavigationMapLayersV1` early-return `null` (`if (!route) return null`,
     same pattern in both Chrome components). The reverse (v1 active, v2 idle) holds
     because `useNavigationOverlayV2`'s route only ever comes from the v2-tagged
     `activeRoute` the store holds.
  4. **`mode === 'NAVIGATION'` correctly reflects either version**: `HomeScreen.tsx`'s
     `showAnyNavOverlay = showNavOverlay || navOverlayV1.active` (not `showNavOverlay` alone)
     is what's passed into `useMapMode`, so legacy-Block navigation and v2-Gate navigation
     both collapse the map into the same single `'NAVIGATION'` mode — search bar, place
     markers, and category browsing all disappear via the same `mode !== 'NAVIGATION'`
     gates either way (verified at `HomeScreen.tsx:1341,1444,1469,1485,1503,1576,1602,1662,1678,1687`).
- **Answers to the mission's 8 questions**:
  1. Can V1 render during a legitimate journey? **Yes** — any Block destination reached
     through the legacy model.
  2. Can V2 render simultaneously with V1? **No**, by the `sourceVersion` guard above —
     confirmed structurally, not just by convention.
  3. Does the app correctly distinguish the active route version? **Yes** —
     `sourceVersion` is the single discriminant, checked at the one place it matters
     (`NavigationViewModel.ts:101`) rather than duplicated per call site.
  4. Can unused overlays interfere with interaction/accessibility? **Not found** — the
     inactive version's Chrome component returns `null` before rendering anything, so it
     contributes zero views to the tree, not just zero visible pixels.
  5. Are important controls duplicated? **No** — only one Chrome ever renders content at
     a time (see #4). `HomeScreen.tsx` mounts both `<NavigationChromeV2 .../>` and
     `<NavigationChromeV1 .../>` unconditionally side by side (lines 1557-1558) but this
     is safe only because of the `null`-return guard, not because of the JSX condition
     itself — see the fragility note below.
  6. Do V1 and V2 communicate equivalent navigation states? **Mostly** — both expose
     `arrived`/`reroutePending`/`isWeakGps`/`rerouteStatusMessage`/`snappedLocation` with
     the same names, but V2 additionally has `gpsSignalState` (`'GPS_LOST'` distinct from
     weak-GPS) and outside-routing/gate-selection state that V1 has no equivalent for
     (V1 never leaves the venue, so this is an intentional scope difference, not a gap).
  7. Are the presentation contracts consistent? **Largely yes** — same top-bar/bottom-bar/
     recenter/arrival-modal layout, same touch-target hit slop
     (`NAV_TOUCH_TARGET_HIT_SLOP`), same bilingual arrival copy. V2's arrival subtitle
     reads `route.destination.label` (always defined); V1's reads `destination?.name`
     (optional-chained) — see NAV-003 below.
  8. Does either version show misleading information under unsupported conditions?
     **Not found in this pass** — not yet checked exhaustively (V1's GPS/reroute banner
     wording not yet compared against V2's for consistency).
- **Fragility identified (not a confirmed bug)**: mutual exclusion is real and verified,
  but it depends on every one of the ~10 `mode !== 'NAVIGATION'` checks scattered through
  `HomeScreen.tsx` staying in sync with each other and with `showAnyNavOverlay`. A single
  shared wrapper (e.g. one `!isNavigatingMode` derived boolean used everywhere instead of
  repeating the mode comparison) would remove a class of future regression, but this is a
  maintainability observation, not a user-facing defect today — **not implemented this
  session** since it's a refactor with no attached user-facing bug, and refactoring
  without a driving defect isn't this mission's mandate.
- **Implementation state**: N/A — investigation only, no defect requiring a fix found.
- **Runtime verification state**: **RUNTIME UNVERIFIED** for the actual simultaneous-render
  question (#2/#5) — verified by static trace of the guard logic, not by forcing the race
  on a device/emulator (none available). The guard is unconditional (`if (x) return`,
  not timing-dependent), so a runtime confirmation would be corroborating, not decisive.

## Active-navigation audit — partial pass (NavigationChromeV2)

Scope: sections A (primary info), a slice of D (GPS/rerouting presentation), and E
(interaction safety) for `NavigationChromeV2.tsx`. B (full instruction-wording pass), C
(map presentation), F (accessibility beyond what's noted below), and the equivalent V1
pass are **NOT AUDITED** yet.

- **NAV-001 — Single top status slot, GPS warnings don't interrupt the instruction card
  (KEEP)**: `NavigationChromeV2.tsx:120` (`navigation-maneuver-surface`, the current-step
  card) and `:176` (`navigation-subordinate-surfaces`, the GPS/reroute/basemap banner) are
  two separate slots, not one shared card — a GPS warning renders *below* the maneuver
  instruction, never replacing it. The banner slot itself has an explicit priority chain
  (comment at `:174`: "GPS lost/weak outranks rerouting, which outranks basemap
  degradation — never stack more than one"), so at most one status message shows at once.
  This directly answers the mission's "does a GPS warning interrupt navigation
  instructions" question for the visual layer: **no**, they coexist. Verified by source
  read; not yet confirmed on-device.
- **NAV-002 — `GPS_LOST` banner uses `accessibilityLiveRegion="assertive"`; other status
  banners use `"polite"` (RUNTIME UNVERIFIED, flagged not fixed)**: `:178` vs `:182`/`:186`/
  `:190`. `assertive` is appropriate for a safety-relevant interruption in principle, but
  if `gpsSignalState` flaps between `'GPS_LOST'` and recovered while TalkBack is mid-sentence
  reading the current maneuver, an assertive region can cut that announcement off — and the
  banner text is static, so repeated re-entries into the same state may or may not
  re-announce depending on the platform's live-region diffing (not something verifiable
  from source alone). No Android emulator/TalkBack available this session to confirm
  either way. Flagged as a **device-testing checklist item**, not changed speculatively.
- **NAV-003 — V1 arrival subtitle can read blank; V2's cannot (P2, not yet fixed)**:
  `NavigationChromeV1.tsx` arrival modal renders `destination?.name` (optional-chained —
  `destination` comes straight from the store and its non-null-ness at arrival time isn't
  guaranteed by a type); `NavigationChromeV2.tsx`'s equivalent renders `route.destination.label`
  (always defined, since it's baked into the `V2ActiveRoute` object at `fromPreview` time,
  not read from a separately-nullable store field). Impact: a legacy-Block arrival could
  in theory show "You've Arrived!" with a blank destination line instead of a name. Not
  yet confirmed reachable — `destination` is set atomically with `activeRoute` by the
  same `startNavigation()` call, so it's unclear if any code path can null it out before
  arrival fires. **NOT FIXED** — needs one more trace (does anything clear `destination`
  independent of `activeRoute` mid-navigation?) before deciding whether this is a real
  P2 bug or an impossible state; recorded here rather than guessed at.
- **Exit safety (KEEP)**: `useNavigationExitConfirmation` backs both the visible Exit
  button and the Android hardware back button with the same confirm-dialog gate
  (`requestNavigationExit`), and deliberately skips confirmation only for the arrival
  "Done" path, which is a deliberate terminal action, not an accidental one. No accidental-
  cancellation defect found.
- **Touch targets (KEEP)**: recenter button 48×48dp (`recenterButton` style) meets the
  Android-recommended 48dp minimum outright; mute/exit/arrival buttons are smaller visually
  but all carry `NAV_TOUCH_TARGET_HIT_SLOP` (`{top:8,bottom:8,left:8,right:8}`), bringing
  effective hit area at or above 48dp. No defect found.
- **Instruction wording (KEEP, partial)**: `InstructionService.maneuverLabel` returns
  "Left Turn"/"Right Turn"/"Arrive"/"Continue Straight" — plain language, no jargon. Not
  yet cross-checked against every instruction-generation path for edge-case wording.

## NAV-003 — RESOLVED this session: blank arrival subtitle is structurally impossible

Traced every writer of the store's `destination` field (`src/store/useAppStore.ts`):
only two exist — `startNavigation` (sets `destination` + `activeRoute` together in one
`set()`) and `stopNavigation` (nulls both together in one `set()`, line 382). No other
call site anywhere in `src` writes `destination:` directly (verified by grep across the
whole tree). So `destination` can never be null while `activeRoute`/the local `route`
state is non-null **except** across whatever gap exists between the store update and
the hook's own local `route` state catching up.

That gap was the real question. `NavigationViewModel.ts`'s `route` is a *separate*
`useState`, only synced from the store via a `useEffect` — normally a one-render lag
risk. But the only path that calls `stopNavigation()` is `handleExit`
(`NavigationViewModel.ts:387-401`), and `handleExit` calls `stopNavigation()` **and**
`setRoute(null)` synchronously in the same function body — both updates land in the
same React batch, so there is no intermediate render where the store already reports
`destination: null` but the local `route` state is still the stale non-null value.
Confirmed `handleExit` is the only caller of `stopNavigation` reachable from the chrome:
`useNavigationOverlayV1.ts:48` wires `onExit: vm.handleExit` into
`useNavigationExitConfirmation`, whose `exitOnce` (backing both `requestNavigationExit`
after confirmation and `completeArrivalNavigation` directly) calls `onExitRef.current()`
— i.e. `handleExit` — synchronously, with an `exitStartedRef` guard preventing a second
call.

**Verdict: NAV-003 closed, not reachable.** No test added beyond the existing exit-flow
tests in `NavigationChromeV1.test.tsx` (`completeArrivalNavigation` call-count
assertions) — this is a documented structural proof, not a behavior needing new
coverage; per mission instruction "do not invent a defect merely because a property is
optional."

## B-001 — FIXED: next-step preview could lose the destination name to truncation

- **Screen/component**: `NavigationChromeV1.tsx` and `NavigationChromeV2.tsx`, the
  "Then: ..." next-step preview line inside the instruction card.
- **Problem**: both rendered `Then: {nextStep.text}` — the full raw instruction
  sentence generated by `InstructionService.generateInstructions` (e.g. "Then: Turn left
  at Rasta 11 & Rasta 04 Junction onto Rasta 05 & Rasta 01 Junction."), inside a
  `<Text numberOfLines={1}>`. At the card's actual rendered width (full width minus a
  40px icon column and a ~44px mute-button column, 15px font) this sentence routinely
  exceeds one line, and the ellipsis lands wherever the text happens to overflow — which
  is exactly the junction/place name at the end of the sentence, the one piece of
  information the preview exists to convey. The maneuver type (left/right/straight),
  which is at the *start* of the sentence, survives truncation; the destination name,
  at the *end*, does not.
- **User impact**: an attendee glancing at "Then: Turn left at Rasta 11 & Rasta 04
  Junct…" learns a turn is coming but not where, defeating the preview's purpose. Same
  defect in both V1 and V2 (identical wording, identical style, identical
  `numberOfLines={1}`).
- **Fix**: replaced the raw sentence with `Then: {InstructionService.maneuverLabel(nextStep.type)}{nextStep.roadName ? \` onto ${nextStep.roadName}\` : ''}`
  — same short vocabulary the current-step card's own maneuver label already uses
  ("Left Turn", "Right Turn", "Continue Straight", "Arrive"), plus the road name when
  known. Always short enough to fit one line; never truncates away the useful part.
  Applied identically to both `NavigationChromeV1.tsx` and `NavigationChromeV2.tsx`.
- **Implementation state**: **FIXED**, this session.
- **Test evidence**: new tests `B-001: next-step preview shows short maneuver + road
  name, not the full raw sentence` in both `NavigationChromeV1.test.tsx` and
  `NavigationChromeV2.test.tsx` — asserts the short form renders and the raw sentence
  does not. Full suite: 73/73 suites, 643/643 tests passing (`npm run test:components --
  runInBand`). `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check` all
  clean.
- **Runtime verification state**: **RUNTIME UNVERIFIED** — no emulator/device available.
  Verified by source + automated test only; visual line-wrap behavior on an actual device
  at real font scale is the remaining unverified piece (see touch-target/visual-hierarchy
  device-test checklist below).

## NAV-004 — V1 has no equivalent of V2's background-resume GPS-staleness fix (Codex dependency, not independently fixable)

- **Screen/component**: `NavigationViewModel.ts` (v1, legacy) vs `NavigationViewModelV2.ts`.
- **Evidence**: `NavigationViewModelV2.ts` registers an `AppState.addEventListener('change', ...)`
  handler (confirmed via `scripts/test-navigation-background-resume.ts`, which asserts
  its exact wiring) that, on resume from background, forces an immediate fresh GPS fix
  via `GPSManagerService.forceFix()` and marks `GPS_LOST` immediately rather than waiting
  out the normal ambient-poll timeout — fixing a real prior bug where a user backgrounding
  the app mid-walk (locking the phone, walking several minutes, unlocking) would see
  stale pre-lock progress/ETA on resume until the next natural `watchPositionAsync`
  callback arrived. Grepping the whole `src` tree for `AppState` shows this listener
  exists **only** in `NavigationViewModelV2.ts` — `NavigationViewModel.ts` (v1) has no
  such handler. V1 still relies solely on `GPSManagerService`'s own generic
  watch-restart, which is the same gap V2 had before this fix.
- **User impact**: an attendee navigating to a legacy Block destination (v1) who
  backgrounds the app for several minutes and returns will see the same stale-progress
  bug V2 attendees no longer see. This is a genuine V1/V2 inconsistency, not an
  intentional architectural difference — V1's legacy destinations are just as reachable
  mid-walk as V2's.
- **Classification**: **INCONSISTENT** (per mission's V1/V2 difference taxonomy) — not
  classified CONFIRMED DEFECT in the code-review sense, since the underlying behavior
  (`GPSManagerService`'s watch-restart) still functions; it's a missing UX-quality
  parity fix, not a crash or data-loss bug.
- **Why not fixed this session**: this is GPS-staleness detection and forced-refix
  behavior — explicitly Codex-owned territory per this mission's own boundary ("GPS
  logic... route-progress calculations"), not a visual/UI presentation change. Adding an
  equivalent `AppState` handler to legacy `NavigationViewModel.ts` would mean writing new
  GPS-recovery business logic, which this mission's UI-only mandate does not authorize.
- **Codex dependency**: recorded in `CLAUDE_CODEX_HANDOFF.md` — asking whether the v2
  background-resume fix should be ported to v1, or whether v1 is considered low-priority
  enough (legacy, presumably lower usage) to leave as-is.
- **Implementation state**: NOT FIXED — correctly deferred, not a UI-ownable fix.
- **Runtime verification state**: RUNTIME UNVERIFIED, and not independently verifiable
  from source alone either — confirmed by the *absence* of the handler, not by
  reproducing the bug.

## Active-navigation audit — sections B and C completed this session

- **B (instruction wording), full pass**: `InstructionService.generateInstructions`
  wording ("Turn left at X onto Y.", "Continue N meters on Y to X.", "You have reached
  X.") uses plain sentence structure with no technical jargon. Place names come from
  `getFriendlyName`, which prefers real names (`node.name`/`node.urduName`) or block-entry
  labels ("X Entrance") before falling back to junction codes like "Rasta 09 & Rasta 01
  Junction" — these are genuine venue path names (`IJTEMA_DATA`'s "Rasta" naming, also
  used throughout `RastaLayer`/`AGENTS.md`), not developer-internal identifiers, so this
  is **KEEP**, not a jargon problem — though this assumes venue signage actually uses
  "Rasta NN" labeling, which hasn't been confirmed against physical signage (flagged as a
  device/field-verification item, not a code defect). Outside-routing's "Direct gate
  guide" / "Direct entry guide" heading (`OutsideRouteLocalizationService`) reads as
  plain English. **B-001 above is the one confirmed defect found in this section, now
  fixed.**
- **C (map presentation), full pass**: V2's `NavigationMapLayersV2.tsx` reuses the same
  shared `RastaLayer`/`SpecialRouteLayer`/`BlockLayer` components used elsewhere in the
  app (browse mode, route preview), so its visual language during navigation matches
  what the user already saw while selecting a destination. **V1's
  `NavigationMapLayersV1.tsx` does not** — it hand-rolls its own venue-boundary
  `Polygon`, block `Polygon`s, and edge `Polyline`s inline with different styling
  (`rgba(232,245,233,0.06)` fill, `rgba(60,64,67,0.38)`/`rgba(255,255,255,0.86)` double-
  stroke edges) instead of reusing those same shared layer components. **Classification:
  INCONSISTENT** — an attendee navigating to a legacy Block destination sees a visibly
  different map style (edges, block highlighting) than one navigating to a Gate/facility,
  even though both are "the same app, the same map." Route/user/start/destination marker
  styling (`styles.startMarkerWrap`, `styles.destinationMarker`, `styles.userMarkerWrap`)
  is shared via the same `navOverlayStyles.ts` file for both, so that part is consistent
  — only the *underlying venue rendering* (edges/blocks/boundary) diverges. **Not fixed
  this session**: unifying V1's venue rendering onto the shared layer components is a
  real (if lower-urgency) improvement, but it's a larger visual-regression-risk change
  (V1 is still live, still used, and its current inline rendering has presumably been
  stable for a long time) that deserves its own reviewed pass rather than a drive-by
  edit bundled into this one. Recorded here rather than silently left unaudited.
- **Recenter/zoom/rotation/camera**: both versions share `useCameraManager`'s
  `enterNavigationCamera`/`fitRoute` (confirmed identical call shape in
  `useNavigationOverlayV1.ts` and the V2 equivalent) — no divergence found.
- **Marker overlap / bottom-sheet interference**: no bottom sheet renders during
  `mode === 'NAVIGATION'` (confirmed via the `mode !== 'NAVIGATION'` gates already traced
  in FINDING V1V2-REACHABILITY), so no overlap with navigation chrome is structurally
  possible while navigating. Overlap between the instruction card and the top status
  banner is prevented by the two-slot layout (NAV-001). Not yet checked: overlap between
  the recenter button and the bottom trip bar at unusual screen heights (see touch-target
  section below).

## Arrival experience audit — both versions, this session

Scope: source-level trace of every edge case the mission lists. No device to observe
actual pixels; findings below are what the code guarantees, not what was seen rendered.

- **Normal arrival**: `arrivedRef`-gated one-shot transition (`NavigationViewModel.ts:218-238`
  for v1; V2's equivalent in `NavigationViewModelV2.ts`, not re-read line-by-line this
  session but already confirmed same-shaped `arrived` state in FINDING V1V2-REACHABILITY).
  Modal shows destination name (V2 always; V1 — see NAV-003, closed, cannot be blank),
  bilingual "You've Arrived!" / "منزل پر پہنچ گئے" heading, Done + Recenter actions,
  TalkBack announcement (#64 effect). **KEEP.**
- **Repeated arrival events**: `if (dest && !arrivedRef.current)` (v1) / equivalent ref
  guard means arrival can only latch once per navigation session — a GPS blip that
  re-crosses the threshold after arrival cannot re-trigger the modal or re-announce.
  **KEEP**, no defect.
- **Rapid cancellation**: `exitStartedRef` in `useNavigationExitConfirmation.ts:43-47`
  guards `exitOnce` against being invoked twice (e.g. double-tapping "Done" or hitting
  hardware Back right after Done) — second call is a no-op. **KEEP.**
- **Returning from background**: see NAV-004 above — V2 has a dedicated fix, V1 does not.
  This is the one confirmed arrival-adjacent gap, and it's a Codex dependency, not a UI
  fix.
- **GPS uncertainty during/around arrival**: arrival detection uses `snapped` location
  (already smoothed by `SnapToRoadService`/reroute projection), not raw GPS — a single
  noisy fix can't spuriously trigger or block arrival on its own. This is Codex-owned
  logic; not re-verified beyond confirming it isn't naively reading raw GPS.
- **Destination change / starting another journey**: `navigationSessionId` increments on
  every `startNavigation()` call (`useAppStore.ts:376`); `useNavigationOverlayV1.ts:68-71`
  resets `isAutoFollowing`/`initialCameraFitDone` keyed on that id, and
  `NavigationViewModel.ts:70-81`'s destination-keyed effect resets `arrived`,
  `currentStepIndex`, and all progress/off-route refs. A second `startNavigation()` call
  (new destination while one is already active, or starting fresh after arrival) cannot
  carry over stale progress or a stale `arrived=true` from the previous session. **KEEP.**
- **Missing destination information**: covered by NAV-003 (closed — structurally cannot
  happen while `route` is truthy).
- **Rapid navigation-mode transitions** (e.g. arrive, then immediately trigger a new
  preview before tapping Done): not fully traceable from source alone — depends on
  whether `HomeScreen`'s mode-derivation and the arrival modal's `visible={arrived}` can
  ever be in conflicting states for one frame if a new `startNavigation()` fires while
  `arrived` is still true from the previous session. Given `arrived` is local state reset
  by the same destination-keyed effect as above, and that effect runs on the very next
  render after a new `destination` arrives, this should self-heal within one frame — but
  this specific interleaving was not built into an automated test this session. Flagged
  as a **device-testing checklist item**, not assumed safe by inspection alone.
- **Accessibility focus on arrival**: `accessibilityViewIsModal` traps TalkBack focus
  within the arrival card once it lands there, and `AccessibilityInfo.announceForAccessibility`
  fires an announcement the instant `arrived` becomes true. Whether TalkBack actually
  *moves* focus to the card (vs. leaving focus wherever it was, relying on the
  announcement alone) is platform behavior not controllable or verifiable from source —
  **device-testing checklist item**, not claimed either way.

## Touch-target reassessment (mission section 8)

Re-examined with the mission's explicit warning that "a calculated hitSlop area does not
automatically prove practical usability" in mind. Source-level facts unchanged from the
prior pass (48dp recenter button, hitSlop-widened mute/exit/arrival buttons) — nothing
new found that changes the KEEP call, but the following **must** be checked on an actual
device before this is called practically (not just calculably) verified:

1. **Adjacent overlap**: recenter button (`bottom: computeNavRecenterInset(...)`,
   `right: 16`) sits close to the bottom trip bar's Exit button on short screens — hitSlop
   regions could theoretically overlap if `bottomBarHeight` is measured smaller than
   expected on a very short device. Not reproducible from source; needs a small-screen
   device/emulator test.
2. **Large-font layouts**: `instructionTextContainer` has no fixed height (relies on
   content to grow it) — confirmed by style read, so text scaling shouldn't clip, but the
   mute button's fixed-width column next to a taller, wrapped maneuver label at 200%
   font scale hasn't been visually confirmed.
3. **Gesture-handler conflicts**: no bottom sheet mounts during `NAVIGATION` mode (see
   above), so no Gorhom BottomSheet gesture-recognizer conflict is structurally possible
   — this one **is** resolvable from source, unlike 1–2.

**Device-test procedure for items 1–2** (for whoever next has device/emulator access):
start v1 and v2 navigation on a small-screen device (e.g. a 5" 1080×1920 emulator profile)
and at Android's largest font-scale setting; visually confirm the recenter button and
Exit button hit-slop regions don't visually or functionally overlap, and that the
instruction card's text doesn't clip or overlap the mute button at max font scale.

## Previously-reported GitHub issues confirmed already fixed on this branch

Verified by `git log --oneline -- <file>` plus `git merge-base --is-ancestor <fix
commit> HEAD` for each, in an earlier session on this same branch. Listed here for the
audit register rather than closed on GitHub without the owner's say — **owner
permission not yet given to close these issues**.

| Issue | Status | Fixing commit |
|---|---|---|
| #150, #151 | FIXED | `617a327` (WCAG-AA outside-venue banner contrast + gate/facility marker names) |
| #153 | FIXED | `2dd8a8a` (returning-user copy, permission contrast/error handling) |
| #154 | FIXED | `7494b88` (Locations Directory headings + Urdu search) |
| #155 | FIXED | `8a0d102` (Settings/Help/About row semantics/copy) |
| #156 | FIXED | `f038153` (live-region status banners + map-warning copy) |
| #157 | FIXED | `7d764e4` (accessible names for map layers/nav markers) |
| #158 | FIXED | `9d9b700` (splash subtitle contrast + real splash logo) |
| #159, #163 | FIXED | `2dd8a8a` (unified download fallback) |

## Screens/components with NO deep A–O pass yet

Per the inventory doc: AppGuideScreen, the full `RoutePreviewSection` start/destination
search flows (only the manual-gate-picker sub-section got a deep pass this session), and
a full component-level pass on every map layer beyond the accessible-name fixes already
made. These are **NOT AUDITED**, not silently assumed fine. (`LayersSheet`,
`LocationTutorialTooltip`, `MapControls`, and the NavigationChrome/MapLayers V1+V2 pair
now have a deep pass — see below and prior sessions.)

## Batch A — Home/Map (this session, fast-track UI/UX mission)

**MapControls** (`src/views/components/map/MapControls.tsx`):
- All buttons are genuine 48×48dp / 56×56dp (recenter) physical size, not hitSlop-only —
  confirmed from `mapControlStyles.ts`, no defect, KEEP.
- **CONFIRMED DEFECT, FIXED** — the north-up/compass "helper badge" (sighted-only text
  under the compass button) duplicated the compass button's own `accessibilityLabel` as a
  second, redundant TalkBack stop. Same class of bug already fixed once in this branch for
  `LayersSheet`'s `OverlayRow` (Switch/row double-announcement). Fixed with
  `importantForAccessibility="no-hide-descendants"` on the badge's wrapping `View`.
  Commit `066d3bc`. Regression test: `MapControls.test.tsx` (badge query uses
  `includeHiddenElements: true`, confirming the suppression actually removes it from the
  default a11y-query tree — i.e. behaves like real TalkBack hiding, not just a prop).
- **JUSTIFIED ADDITION, IMPLEMENTED** — the recenter button's tap-success feedback was a
  hard icon cut (spinner → static checkmark) with zero motion confirming the tap
  resolved. Added a small `Animated.spring` scale-pop on entering the `'success'` state,
  adapted from react-bits' "SpringCheck" micro-interaction (see React Bits matrix below),
  using this codebase's own established `Animated` convention (not
  `react-native-reanimated`, which nothing in `src` actually uses yet — see matrix).
  Skips entirely under Reduce Motion. Scoped to browse-mode button feedback only; never
  touches nav chrome, GPS warnings, or safety-critical presentation. Commit `644ee0b`.

**LocationTutorialTooltip** (`src/views/components/map/LocationTutorialTooltip.tsx`):
- **CONFIRMED DEFECT, FIXED** — the one-time "You're here" teaching moment was
  `pointerEvents="none"` plain `Text` with no focus or live-region wiring. A screen-reader
  user got no signal it ever appeared — a real gap for exactly the target audience (first-
  time users, who benefit most from this exact teaching moment). Fixed with the same
  one-shot `AccessibilityInfo.announceForAccessibility` pattern NavigationChromeV2 already
  uses for its arrival announcement (#64).
- **INCONSISTENCY, FIXED** — this was the one animated component in `src` that hadn't
  picked up the project's own `useReducedMotion` hook (already reused by `HomeScreen`,
  `NavigationChromeV2`, `LocationSheet`'s `FadeContent`). Wired it in; the fade is now
  skippable like every other animation in the app. Commit `066d3bc`. Regression tests:
  `LocationTutorialTooltip.test.tsx` (5 tests — announcement, animated/skipped fade both
  directions, static render).

**LayersSheet** (`src/views/components/map/LayersSheet.tsx`): read in full. Already
correct — `OverlayRow`'s `importantForAccessibility="no-hide-descendants"` fix and the
segmented control's `accessibilityState={{selected}}` are the exact patterns the two fixes
above now match. `minHeight: 56` rows, `bounces={false}` scroll, backdrop-press-to-close —
KEEP, no defect found. One latent inconsistency **not fixed** (no evidence it's reachable):
`mapType` prop type includes `'hybrid'`, but no segment button ever reflects `'hybrid'` as
selected — REQUIRES INVESTIGATION whether `'hybrid'` is ever actually passed from
`HomeScreen`; flagged, not assumed broken.

**Diagnostics banner** (`HomeScreen.tsx`, `styles.diagnosticsBanner`): confirmed CLOSED,
not a leak risk — gated on `__DEV__ && developerModeEnabled`. `__DEV__` is a build-time
constant Metro dead-code-eliminates from release bundles (standard RN behavior, not just a
runtime flag), so this cannot appear in a production build. No fix needed.

**Empty-state sheet** ("Tap a block or search to see details"): "block" is real venue
terminology used consistently elsewhere in the app (Blocks are actual physical venue
divisions), not dev jargon — matches the KEEP precedent already established for
"Rasta"/"Gate" wording in the nav audit. No defect.

## Batch B — Route Preview / Gate Selection (this session)

**Manual gate picker** (`RoutePreviewSection` inside `LocationSheet.tsx`):
- **CONFIRMED DEFECT, FIXED** — the "Automatic gate" / per-gate buttons conveyed which
  gate was currently selected only through `variant` color (secondary vs outline) —
  nothing for TalkBack. Directly on point for the mission's own Batch B ask ("users can
  recognize incorrect selections"). Same fix already applied once in this branch for
  `LayersSheet`'s Standard/Satellite toggle (#65):
  `accessibilityState={{selected}}` added to all three buttons. Commit `d7a05c6`.
  Regression test added to `LocationSheet.test.tsx`.

**OutsideRouteStatusCard + OutsideRouteLocalizationService** — investigated the mission's
specific worry (does the UI imply the direct-guide fallback is verified street routing?).
**CLOSED, no defect** — `direct.notRoadRoute` ("Direct guide — not a road route") and
`direct.warning` ("may not follow walkable roads") are explicit and unambiguous; the
Google/offline-OSM provider labels ("Google walking route" / "Offline walking route") are
both genuinely road-following routes, so labeling them as such is accurate, not
overclaiming. Bilingual (Urdu RTL), live-region-announced warning already in place. No
code change made — evidence-based closure, per the same "do not invent a defect" standard
applied to NAV-003.

## React Bits compatibility matrix (mission Phase 3)

Investigated `github.com/DavidHDev/react-bits` directly (not assumed): read the actual
`package.json` dependencies, `LICENSE.md`, and the full `src/content/{Animations,
Components, Micro, TextAnimations}` category listing via `gh api`.

**License**: MIT + Commons Clause v1.0. Permits use, copy, modification, and distribution
**as part of an application** (including commercial use) — the one restriction is
selling/sublicensing/redistributing the components themselves as a standalone product or
library. Adapting a pattern's *technique* into our own native app, with attribution
retained, is within license. Confirmed by reading the actual license text, not assumed.

**Confirmed dependencies** (from the real `package.json`): `three` / `@react-three/fiber`
(WebGL/3D), `gsap`, `motion` (Framer Motion), `matter-js` (2D physics), `lenis` (smooth-
scroll), `face-api.js`, `react-confetti`, `react-virtualized`, `shiki`, `tailwindcss`. This
independently confirms the mission's own stated constraint — none of these run in React
Native; the library is fundamentally a web (Vite/DOM/Canvas/WebGL) component gallery.

**Category survey** (`Animations`, `Components`, `Micro`, `TextAnimations` — full listing
read, not sampled): the large majority are cursor-follow effects, WebGL/3D scenes,
canvas particle systems, or scroll-linked DOM/CSS effects (`BlobCursor`, `MetaBalls`,
`Ribbons`, `DomeGallery`, `FluidGlass`, `ParticleText`, etc.) — **NOT SUITABLE** for this
app on both technical grounds (no native equivalent) and product grounds (mission
explicitly excludes cursor/particle/glassmorphism effects for a crowded-outdoor
navigation tool).

| Component/pattern | Category | Screen | Native compatibility | Decision |
|---|---|---|---|---|
| SpringCheck | Micro | MapControls recenter button | Technique (scale-spring on success) fully expressible via RN `Animated`/Reanimated; original is DOM+Motion | **REQUIRES NATIVE ADAPTATION — IMPLEMENTED** (commit `644ee0b`, plain `Animated.spring`, reduced-motion aware) |
| StatusMark | Micro | (considered for compass/recenter active state) | Same as above in principle | **INSPIRATION ONLY** — not implemented; existing `controlButtonActive`/`recenterButtonActive` border+background swap already communicates state clearly without new motion; no identified problem to fix |
| WarmTooltip | Micro | (considered for LocationTutorialTooltip) | DOM-positioned tooltip w/ CSS transitions | **INSPIRATION ONLY** — the existing tooltip's structure (fixed position, fade, auto-dismiss) already covers the same need; the actual defect found there was accessibility wiring, not visual design, so no redesign was warranted |
| CountUp / Counter | TextAnimations / Components | (considered for route distance/ETA) | Trivially portable (JS interval + `Text`) | **NOT SUITABLE** — mission explicitly excludes animating live navigation distance/ETA; static, immediately-readable numbers matter more than a counting effect for this content |
| AnimatedList / AnimatedContent | Components / Animations | (considered for search results, LocationsDirectory) | Portable via `Animated`/`LayoutAnimation` | **INSPIRATION ONLY** — no identified comprehension problem with the current instant list render; adding entrance animation here would be motion for its own sake, against the mission's own caution |
| BlobCursor, MetaBalls, Ribbons, GooeyNav, FluidGlass, ParticleText, DomeGallery, SplashCursor, etc. (majority of catalog) | Animations/Components/TextAnimations | — | WebGL/Three.js/canvas-particle/cursor-tracking; no native equivalent, and explicitly excluded product-wise | **NOT SUITABLE** |
| Everything else in `Micro` (BellToggle, FlipCard, HoldButton, JellyRadio, PulseHeart, SquishSwitch, SwipeRow, etc.) | Micro | — | Individually portable in principle | **INSPIRATION ONLY (not evaluated further)** — none map to an identified, evidence-backed problem in this app this session; selecting more without a concrete usability gap would be motion added to demonstrate activity, which the mission explicitly warns against |

Only one candidate crossed from research into implementation this session, matching the
mission's own instruction to select a small number of genuinely useful candidates rather
than integrate broadly.

## Remaining REQUIRES PRODUCT DECISION items carried from prior sessions

Not re-litigated here since no new evidence changes them: PERM-001/002/003/007/008,
#153 Finding 1, #154 Findings 2/3, #155 bilingual coverage, #156 Finding 4,
WEL-001–006, #127, SPLASH-UX-003/004, F005. See `CLAUDE_CODEX_HANDOFF.md`.
