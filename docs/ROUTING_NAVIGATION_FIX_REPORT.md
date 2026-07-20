# Routing & Navigation Correctness Fix Report

Date: 2026-07-20

## Summary

This fix pass addressed the 8 findings from a `/code-review high` pass on PR #9
(merged as `1ecaa53`, the v2 outside-venue street-graph routing feature),
restored a broken legacy (v1) navigation entry point, and audited the app's
existing v2 live-navigation UI against the "feel like Google Maps" product
requirement.

**Key finding from the architecture review that shaped scope:** the
Google-Maps-style live navigation experience — full-screen map-first UI, top
instruction card with next-step + distance, bottom ETA/distance/destination
bar, recenter button, mute toggle, arrival modal, automatic outside→inside
transition (one continuous stitched route, no manual restart) — already
existed for v2 routes, implemented across `NavigationChromeV2.tsx`,
`NavigationMapLayersV2.tsx`, and `useNavigationOverlayV2.ts`, rendered in
place on `HomeScreen`'s persistent map. That requirement did not need new UI
work; the real gap was underneath it (see Phase 4).

Every fix below is verified by an automated test — either a new/extended
script under `scripts/` (run via `npm run test:<name>`, wired into the
aggregate `npm test`) or the existing jest suite (`npx jest`). All fixes were
verified by reverting the change (`git stash`) and confirming the associated
test fails on the pre-fix code, then re-confirming it passes after. Final
state: `npm run typecheck`, `npm run lint`, and `npm test` (typecheck + lint +
~90 routing/UI scripts + jest component tests) all pass clean.

---

## Phase 1 — Outside/inside polyline split off-by-one

**File:** `src/services/RoutingServiceV2.ts` (`pathCoordinates`)

**Issue:** The outside-venue (amber, street-graph-routed) polyline visually
bled one segment into the venue interior instead of ending exactly at the
entry gate; the inside (blue) polyline started one node past the gate instead
of at it.

**Root cause:** `pathCoordinates()` recorded `outsideLegCoordinateCount` as
`coordinates.length` immediately after appending the street-graph leg's
coordinates — which already end on the gate's exact coordinate. It then
appended the internal graph path starting with `path.nodes[0]`, which is
*also* the gate (same coordinate). The 2m coordinate-dedup logic
(`appendCoordinate`) silently dropped this second, redundant gate coordinate
as a near-duplicate — so the array never grew at the index the count claimed,
and the real gate position was one index earlier than recorded.
`V2MapRenderingService.splitOutsideInsideCoordinates` assumes
`coordinates[count]` is the shared gate point, so it sliced one element too
far into the venue. The beeline path (no street graph) never hit this because
the user's raw GPS start coordinate is essentially never within 2m of the
gate, so no dedup collapse occurred there — this was street-graph-specific.

**Fix:** `pathCoordinates` now appends `path.nodes[0]` explicitly and derives
`outsideLegCoordinateCount` from where it actually landed post-dedup
(`coordinates.length - 1` after that append), instead of snapshotting the
length beforehand. Verified by hand that this reproduces the exact prior
count for the beeline case (no behavior change there) while correctly
pointing at the true gate index for the street-graph case.

**Validation:** `scripts/test-outside-street-graph-integration-v2.ts`
(extended) asserts `route.coordinates[route.outsideLegCoordinateCount]`
equals the entry gate's coordinate, and that
`splitOutsideInsideCoordinates`'s outside/inside slices share exactly that
point. Fails on pre-fix code with a 24.969422 vs 24.969435 coordinate
mismatch; passes after.

---

## Phase 2 — Turn-by-turn instruction `routeIndex` desync

**File:** `src/services/V2NavigationAdapter.ts` (`activeInstructions`)

**Issue:** Step-highlighting and voice-instruction timing could drift or fire
at the wrong location during outside-venue navigation.

**Root cause:** `routeIndex` was set to `Math.min(index, coordinates.length -
1)` — the instruction's position in the *instructions* array — with no
relationship to where that instruction's target coordinate actually sits in
the *coordinates* array. This coincidentally worked for pure-inside routes
(roughly one instruction per path node ≈ one coordinate) but broke for any
route with an outside leg, since the street-graph leg contributes far more
rendering coordinates than turn-by-turn instructions.
`NavigationViewModelV2.ts`'s `instructionIndexForProgress` reads
`route.coordinates[instruction.routeIndex]` to project instruction progress,
so this directly drove both `currentStepIndex` and `Speech.speak` timing.

**Fix:** Every instruction already carries its own `coordinate` field.
`activeInstructions` now resolves `routeIndex` by finding that coordinate's
nearest actual position in `previewRoute.coordinates`, scanning forward from
the previous instruction's resolved index to keep the mapping monotonic.

**Validation:** New `scripts/test-street-instructions-routeindex-v2.ts` builds
a real street-graph-routed active route and asserts every instruction's
resolved `routeIndex` points at a coordinate within 5m of its own `coordinate`
field, non-decreasing across the sequence. Fails on pre-fix code (146m off
on the first street instruction); passes after.

---

## Phase 3 — Street-graph gate selection ignored verification penalty

**Files:** `src/services/OutsideStreetRoutingService.ts`
(`selectStreetGraphOutsidePath`), `gatePenaltyM` moved here from
`RoutingServiceV2.ts` (re-exported, avoids a circular import since
`RoutingServiceV2` already imports from this module)

**Issue:** The street-graph outside-routing path could route a user through
an unverified (`needs_verification`) gate purely because it was nearer,
even when the beeline path would have preferred a slightly farther, verified
gate.

**Root cause:** The beeline path (`resolveOutsideGateSeeds` /
`findBestOutsidePath`) bakes the 120m `needs_verification` penalty into each
gate's seed cost *before* the search runs, so it can change which gate wins.
`selectStreetGraphOutsidePath` ran a plain single-source A* to the first
candidate-gate connector reached — pure distance, no penalty in the search at
all; the penalty was only added afterward, in `RoutingServiceV2.ts`, for
cost *reporting* once the gate was already locked in.

**Fix:** Virtual-goal-node technique — the standard way to fold a per-target
arrival cost into a single-pass A* without losing early-termination
optimality. "Arriving at the goal via gate g" is modeled as node `g` plus a
synthetic non-negative edge of weight `gatePenaltyM(g)` to one shared virtual
sink. Whenever a candidate gate's connector node is settled, the sink is
relaxed through it; real neighbor expansion continues (a path can
legitimately thread past one gate's connector toward a cheaper one). The
search stops only when the sink itself is popped — by then nothing
unexplored can beat it (non-negative weights; the existing heuristic already
lower-bounds pure distance, which stays a valid admissible lower bound for
distance+penalty too).

**Validation:** New `scripts/test-street-gate-penalty-parity-v2.ts` uses two
real gates (GATE_02, GATE_07) from a probe point where GATE_02 is ~83m nearer
by street-graph distance — below the 120m penalty. Asserts: (a) with both
verified, the nearer gate wins; (b) with the nearer gate forced to
`needs_verification`, the farther-but-verified gate wins; (c) a >120m gap is
not overridden by the penalty. Fails on pre-fix code (GATE_02 always wins);
passes after. Confirmed zero regression across the full routing suite,
including `test:all-routing-combinations-v2` (5329 combinations, 4692
routable, 0 failures — identical pass count before and after).

---

## Phase 4 — Legacy (v1) destinations had no working "Start Navigation"

**Files:** `src/viewmodels/DirectionsViewModel.ts`,
`src/views/screens/DirectionsScreen.tsx`, `src/views/screens/HomeScreen.tsx`

**Issue:** A destination sourced from the legacy (v1) data model had no way
to start turn-by-turn navigation anywhere in the app.

**Root cause:** `HomeScreen`'s route-preview card — the only place in the
app that calls the store's `startNavigation()` action — is hard-gated to
`routePlannerDest.sourceVersion === 'v2'`. `DirectionsScreen`'s primary
button was unconditionally `onPress={onClose}` ("Show route on map") for
every destination, relying entirely on that v2-only preview card to actually
start navigation. `DirectionsViewModel`'s `handleStartNavigation` (which used
to bridge this for v1) was deleted in PR #9 as apparently-dead code — it was
already unreachable *before* that PR too (the pre-PR `DirectionsScreen`'s
button already just called `navigation.goBack()`), so this wasn't a new
regression introduced by PR #9 so much as PR #9 removing the last remaining
piece needed to fix it. Confirmed via `git log`/grep that
`navigate('Navigation')` was called from nowhere in the codebase, and the
`'Navigation'` stack screen (backed by `NavigationScreenV1`) was fully
registered but unreachable through any normal app flow.

**Fix:** Reintroduced `handleStartNavigation` in `DirectionsViewModel.ts`,
scoped to the v1 path only (v2 keeps its existing, separate
`handleStartPreviewNavigation` in `HomeScreen`). `DirectionsScreen`'s primary
button now branches: v2 destinations keep the existing "Show route on map" →
`onClose()` behavior (reveals the v2 preview card); legacy destinations show
"Start Navigation", calling `handleStartNavigation()` then a new
`onStartLegacyNavigation` prop. Rather than having `DirectionsScreen` call
`useNavigation()` itself, navigation is passed in as a prop from `HomeScreen`
(which already holds a `nav` object) — `DirectionsScreen` is rendered inline
inside `HomeScreen`'s bottom sheet, not a routed screen, and this keeps it
renderable/testable without a `NavigationContainer` in its render tree
(discovered via the existing jest suite, which renders `DirectionsScreen`
standalone — see Testing notes below).

**Validation:** Extended `scripts/test-directions-buttons-v2.ts`
(source-level) and `src/__tests__/DirectionsScreen.test.tsx` (jest,
behavioral — new test presses "Start Navigation" on a v1 destination and
asserts `handleStartNavigation` and the injected navigation callback both
fire, and the sheet is *not* closed). Both fail on pre-fix code; pass after.

---

## Phase 5 — Inconsistent inside/outside venue boundary checks

**Files:** `src/viewmodels/DirectionsViewModel.ts`,
`src/views/screens/DirectionsScreen.tsx`

**Issue:** For a v2 destination, different parts of the same Directions flow
could disagree about whether the user's location was "inside" or "outside"
the venue.

**Root cause:** `EntryGateRoutingService.isInsideIjtemaArea` (precise block
polygon / rasta-polyline-buffer geometry) was used for exactly one check
(`forceOutside`). Several *other* checks in the same file — some explicitly
gated to `sourceVersion === 'v2'` only, making them unambiguously v2-scoped —
still called `RoutingService.isInsideVenue` (a coarse bounding rectangle).
Not every coarse-check call site was wrong, though: several
(`startSource === 'live_gps' && !RoutingService.isInsideVenue(...)` gates,
and the ones already conditioned on `sourceVersion !== 'v2'`) are legitimate
legacy-routing-*validity* gates — the v1 graph's actual coverage is defined
by that rectangle, and switching them to precise geometry would incorrectly
reject legacy start points that are within the box but outside any
block/rasta polygon (open space the legacy graph still covers).
`HomeViewModel.ts` already got this right, branching explicitly on
`MapFeatureFlagsService.useIjtemaV2Map()` — the pattern the other files
should have followed.

**Fix:** Four call sites now use precise geometry, all already v2-scoped or
made explicitly version-aware: `DirectionsScreen.tsx`'s `outsideStart`
banner-trigger; `DirectionsViewModel.ts`'s `chooseCurrentLocation` outside
messaging; a new `isInsideVenueForDestination` helper (precise for v2,
coarse for v1) used by `rememberedLocationInsideVenue`,
`currentRouteOriginInsideVenue`, and `chooseRememberedLocation`'s messaging.
Legacy-only validity gates were left untouched.

**Validation:** New `scripts/test-directions-boundary-consistency-v2.ts` uses
a real coordinate (a map-bounds corner) that is inside the coarse rectangle
but outside the precise geometry, confirms the fixture actually exercises the
disagreement, then asserts the source-level fix is in place and the
legacy-only gates are untouched. Fails on pre-fix code; passes after.

---

## Phase 6 — Removed dead gate-selection algorithm

**File:** `src/services/EntryGateRoutingService.ts`

**Issue / decision:** `findBestGateForOutsideUser` and its `dijkstraCost`
helper implemented a complete, documented, total-cost gate-selection
algorithm that was never reachable — its only trigger
(`resolveRouteStartForUser`'s `destinationNodeIds` option) was never passed a
non-empty array by any caller. Real outside-venue routing goes through
`RoutingServiceV2.selectOutsidePath` directly, which bypasses this service
entirely for that case and has its own, actively-used, heap-based
multi-source A* (`findBestOutsidePath`). Per the task's own instruction
("integrate if better, remove if obsolete"): this was strictly *worse* than
what's in production — an unheaped O(V²) Dijkstra run once per gate, and
critically, it never called `gatePenaltyM` at all, so wiring it up today
would have reintroduced the exact bug Phase 3 fixed. Removed rather than
integrated.

**Fix:** Deleted `dijkstraCost` and `findBestGateForOutsideUser`. Simplified
`resolveRouteStartForUser`'s outside branch to always call
`findNearestOfficialEntryGateForOutsideUser` (the only branch that was ever
actually reachable). Removed the now-dead `destinationNodeIds` field from
`ResolveRouteStartOptionsV2`. No test referenced either deleted symbol.

**Validation:** `npm run typecheck` clean; `scripts/test-entry-gate-routing.ts`
and `scripts/test-unified-gate-routing-v2.ts` (which exercise the surviving
`resolveRouteStartForUser` paths) both still pass.

---

## Phase 7 — Extracted shared A* core

**New file:** `src/utils/AStar.ts` (`runAStar`, `reconstructAStarPath`)
**Changed:** `src/services/RoutingServiceV2.ts` (`calculateShortestPath`,
`findBestOutsidePath`), `src/services/OutsideStreetRoutingService.ts`
(`selectStreetGraphOutsidePath`)

**Issue:** The same A* search algorithm was hand-duplicated three times,
across two files and two different graph types.

**Fix:** A generic binary-heap A* core, parameterized by seed(s),
heuristic, neighbor lookup, and goal test — built on the existing
`MinHeap<T>` (reused, not reimplemented a fourth time). Each of the three
call sites differs genuinely in shape (single-source/single-destination;
multi-source/multi-destination; single-source/multi-target-with-penalty over
a different graph), so the reuse is a shared *core* with each caller
supplying its own graph access and reconstructing its own result shape —
not a single literal copy-paste target. The multi-source variant's "which
seed did this path come from" tracking (previously a separately-maintained
`sourceGateId` map updated during the search) is now derived after the fact
by walking the reconstructed path back to its root, since seeds are never
reached via relaxation and are therefore always a path's true origin — this
removed a parallel piece of state without changing behavior. Phase 3's
virtual-sink logic folds cleanly into the generic core: the sink is just
another node reached via a synthetic neighbor entry the street-graph caller
injects conditionally.

Done last, after Phases 1-3 and their new tests landed, since it's the
highest-regression-risk change (touches every routing code path) and is
pure cleanup — never entangled with a correctness fix in the same diff.

**Validation:** No new tests — the correctness bar for this phase was zero
behavior change. Confirmed via the full existing routing suite:
`test:route-selection-total-cost-v2`, `test:outside-to-gate-total-cost-v2`,
`test:all-routing-combinations-v2` (identical 4692/5329 pass count, 0
failures, before and after), `test:street-graph-v2`,
`test:outside-street-routing-v2`, and all Phase 1-3 regression tests —
all pass identically before and after the refactor.

---

## Phase 8 — Unmemoized coordinate split on every GPS tick

**File:** `src/views/components/navigation/NavigationMapLayersV2.tsx`

**Issue:** `V2MapRenderingService.splitOutsideInsideCoordinates` recomputed
on every GPS-driven re-render during live navigation (every 1s foreground),
unlike `HomeScreen`'s equivalent preview-path call, which is memoized.

**Fix:** Wrapped in `useMemo`, keyed on `route.coordinates` /
`route.outsideLegCoordinateCount`, matching `HomeScreen`'s pattern.

**Implementation note:** The `useMemo` had to be placed *above* the
component's existing `if (!route) return null;` early return (using
`route?.coordinates ?? []` inside the memo) — hooks must run unconditionally
on every render, and the early return sits before where the memoized call
used to live. Caught before landing by tracing the Rules of Hooks, not by a
test failure.

**Validation:** `npx jest src/__tests__/NavigationChromeV2.test.tsx
src/__tests__/NavigationScreen.test.tsx` pass (render the surrounding nav
chrome without crashing). `npm run typecheck` clean.

---

## Testing notes / incidental fixes found during verification

Running the full suite after all phases surfaced three test failures caused
by legitimate source changes, not regressions — fixed as part of this pass:

- `scripts/test-offline-v2.ts` and `scripts/test-navigation-ui.ts` both
  did a literal source-text search for `'route.coordinates'` in
  `NavigationMapLayersV2.tsx`. Phase 8's `route?.coordinates` (optional
  chaining, required by the hook-ordering fix) no longer contains that exact
  substring. Updated both assertions to `'route?.coordinates'`.
- `src/__tests__/DirectionsScreen.test.tsx` rendered `DirectionsScreen`
  standalone (no `NavigationContainer` in the tree), which is exactly what
  led to the props-over-`useNavigation()` design in Phase 4 above rather than
  the more direct `useNavigation()`-in-component approach. The existing
  "pressing 'Show route on map' closes the sheet" test used a v1 destination
  fixture and asserted the *old, broken* behavior (closing the sheet
  instead of starting navigation) — this is exactly the bug Phase 4 fixes,
  so the test's premise was updated: it now uses a v2 destination fixture
  (matching what "Show route on map" actually means today), and a new test
  covers the v1 "Start Navigation" path.
- `npm install` was required to make `jest`/`jest-expo` available at all —
  they were declared in `package.json` but not present in `node_modules` in
  this environment. Unrelated to this fix pass; `package-lock.json` was
  updated as a side effect of filling in already-declared dependencies.

## Remaining risks

- **Phase 4 restores reachability only** — it does not modernize
  `NavigationScreenV1`'s UI to match the v2 experience. The user's own
  instructions scoped this explicitly ("Legacy mode: Start Navigation →
  existing navigation flow").
- **Phase 4's device-level verification is incomplete.** All verification in
  this pass was automated (script + jest); no live device/emulator pass
  confirmed the restored v1 "Start Navigation" button end-to-end on-screen.
  See the cross-reference added to `docs/REAL_DEVICE_UX_AUDIT.md`.
- **Phase 3's virtual-goal-node algorithm is new** and, while covered by a
  dedicated test and the full existing routing regression suite (zero
  behavior change observed), has less real-world mileage than the
  long-standing beeline path it's now at parity with.
- **Phase 7 touches every routing code path.** Verified via the full
  existing test suite with identical pass/fail counts, but a refactor this
  central warrants extra attention in review.
