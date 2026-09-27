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

Per the inventory doc: AppGuideScreen, LayersSheet, LocationTutorialTooltip, MapControls,
the full NavigationChrome/MapLayers V1+V2 pair (active navigation + arrival — highest
priority), the diagnostics banner, the empty-state sheet, and a full component-level pass
on every map layer beyond the accessible-name fixes already made. These are **NOT
AUDITED**, not silently assumed fine.

## Remaining REQUIRES PRODUCT DECISION items carried from prior sessions

Not re-litigated here since no new evidence changes them: PERM-001/002/003/007/008,
#153 Finding 1, #154 Findings 2/3, #155 bilingual coverage, #156 Finding 4,
WEL-001–006, #127, SPLASH-UX-003/004, F005. See `CLAUDE_CODEX_HANDOFF.md`.
