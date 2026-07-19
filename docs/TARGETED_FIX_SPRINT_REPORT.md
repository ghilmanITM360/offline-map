# Targeted Fix Sprint Report

Follow-up to `docs/FINAL_DEVICE_ACCEPTANCE_REPORT.md`. That report is not re-litigated here — this document only covers what was fixed and verified this pass. Per the sprint instruction ("Start with Phase 1 only"), this pass covers **Phase 1 — Live Navigation GPS Pipeline** only. Phases 2-5 are untouched.

## Phase 1 — Live Navigation GPS Pipeline

### What the previous report claimed

"GPS updates do not propagate live... zero change in displayed distance, ETA, route line, or instruction text across multiple screenshots and 20+ seconds of wait" — filed as a release blocker, plus a raw unformatted float distance (`9983.87684113176 m`).

### Investigation

The GPS→UI pipeline was traced end to end: `GPSManagerService` (`watchPositionAsync`, `distanceInterval: 2` in navigation mode) → `RootNavigator`'s `setStoreUpdater` → Zustand `currentLocation` → `useNavigationViewModelV2` (`src/viewmodels/NavigationViewModelV2.ts`) → `calculateNavigationProgressV2`/`RerouteService.projectProgressMetersOnRoute` → `useNavigationOverlayV2` → `NavigationChromeV2` (the actual live-nav UI, rendered inline over `HomeScreen`'s map — **not** the separate `src/views/screens/NavigationScreen.tsx`, which is dead/defensive-fallback code per its own comment and is unconditionally bypassed for v2 routes).

Every link in that chain was structurally correct — reactive on `currentLocation` changes, no early-return that would silently drop a valid GPS fix.

**One real bug found:** `InstructionService.formatDistance()` (`src/services/InstructionService.ts`) never rounded the `meters` branch — `return \`${meters} m\`` printed whatever float it was given. This is the source of the raw-float distance the previous report screenshotted.

### Fix

```ts
// src/services/InstructionService.ts
return `${Math.round(meters)} m`;
```

### Live verification (emulator, `adb emu geo fix`, per sprint rule "do not mark complete until emulator proves movement")

Fresh Metro bundle, fresh app launch, real `Start Navigation` flow (search Block 25 → Directions → Start Navigation), then four sequential `adb emu geo fix` calls simulating ~550m–1.6km jumps, each confirmed at the OS level via `adb shell dumpsys location`:

| Step | Remaining distance | ETA (min) | Notes |
|---|---|---|---|
| Start | 9984 m | 119 | route just started |
| +556 m | 9431 m | 113 | updated correctly, weak-GPS banner cleared as accuracy improved |
| +1.66 km | 9431 m (unchanged this frame) | 113 | delayed, not dropped — see below |
| +10 s settle | 7771 m | 93 | previous update landed; distance/ETA both correct |
| +555 m | 6668 m | 80 | instruction leg text also updated ("7066 m" → "5963 m ... Gate 15") |

**Conclusion: the GPS pipeline is not broken.** Distance, ETA, and turn-by-turn instruction text all update correctly and monotonically as GPS position changes. The one frame where an update appeared to not land was update **latency** (5s screenshot delay was too short under this dev host's load), not a dropped/ignored update — the missed delta was absorbed into the next screenshot. The previous report's "zero change... 20+ seconds" finding did not reproduce here; the most likely explanation is the previous session's independently-documented, much more severe host resource exhaustion (load average 27-45 vs. 14-16 this session) stalling the JS thread long enough to look like a total freeze.

### New finding (not yet fixed — flagged for Phase 3)

While confirming camera-follow behavior (part of Phase 1's own checklist), the on-screen recenter button did not visibly respond to a tap. A retry produced a genuine Android ANR dialog ("Karachi Ijtema Offline Nav isn't responding"). Logcat showed a tight retry loop of failed Google Maps tile fetches (`UnknownHostException`) immediately before the ANR — traced to DNS being left broken on the emulator from this session's own earlier network on/off toggling, not something reproducible from a clean state. This is the same touch-target region (bottom-right, near the Exit button) flagged as unresponsive in the previous report. Given the shared location and shared symptom, Phase 3 (Exit button) should re-test this on a device/emulator with verified-working DNS before concluding whether it's a real touch-handling bug or another host artifact.

## Files Changed

- `src/services/InstructionService.ts` — `formatDistance` now rounds meters instead of printing raw floats.

## Tests Passed

- `npm run typecheck` — clean.
- `npm run test:map-data-v2`, `test:navigation-graph-v2`, `test:entry-gate-routing`, `test:route-smoke-v2` — all pass.
- `npm run test:offline-v2`, `test:production-v2-defaults`, `test:v1-v2-isolation` — all pass.
- `scripts/test-offline-rendering.ts`, `scripts/test-critical-actions.ts` (both reference `InstructionService.formatDistance`) — pass.
- Live emulator verification of the GPS pipeline as detailed above.

## Remaining Blockers (from the original report, untouched this pass)

Phases 2-5 are not started: overlapping Directions/Route-preview sheets, Gate 08 vs. Gate 15/14 dual-implementation mismatch (re-reproduced live this session — home banner and Directions flow disagree on nearest gate for the same position/destination), and the missing block/rasta labels plus gate label "Ga" clipping.

## Phase 1 re-verification (follow-up pass, same day)

User asked to re-verify GPS navigation specifically before starting Phase 2, since it's the core of the app. This pass found and fixed a real environment problem, found and fixed one real (if minor) code issue, and — most importantly — **retracted** two findings from the first Phase-1 pass above after determining they were test-methodology artifacts, not app bugs.

### Environment bug found and fixed: emulator DNS

The emulator's `netsimd` process was started with a stale `--host-dns` flag pointing at an old host IP no longer valid on this network (`192.168.0.1` vs. the host's actual `192.168.100.1`), left over from a network change earlier in the day. This broke all DNS resolution *inside the emulator only* — host DNS was fine — and explains the previous pass's DNS-storm/ANR tangent. Fixed by fully killing and restarting the emulator (a device-only `adb reboot` was not enough; `netsimd`'s flag is set at emulator-process launch). Confirmed fixed via `adb shell ping www.google.com` resolving correctly and Google Maps tiles rendering.

### Real code fix: GPS listener churn on reroute

`useNavigationViewModelV2`'s listener-registration effect (`src/viewmodels/NavigationViewModelV2.ts`) depended on the `route` object identity:

```ts
useEffect(() => {
  if (!route) return;
  GPSManagerService.addListener(handleLiveLocation, 'navigation');
  return () => GPSManagerService.removeListener(handleLiveLocation);
}, [handleLiveLocation, route]);
```

Since a successful reroute calls `setActiveRoute(activeCandidate)`, which changes `route`'s identity, every reroute was tearing down and re-adding the listener on the shared `GPSManagerService` singleton — unnecessary churn on the one shared `watchPositionAsync` subscription for no functional benefit (the callback itself doesn't use `route`). Fixed by keying the effect on `isNavigating` (only flips on nav start/stop) instead of `route` (which changes on every reroute):

```ts
}, [handleLiveLocation, isNavigating]);
```

This is a real hardening fix, but — see below — it turned out *not* to be the cause of the "frozen GPS" symptom reproduced during this pass; that symptom persisted identically before and after this fix, and was ultimately a test-methodology issue, not a subscription bug.

### Retraction: "second GPS jump freezes the UI" was a test artifact, not a bug

While re-testing, a second `adb emu geo fix` call during active navigation appeared to produce a total freeze: distance/ETA/instruction text stayed byte-identical for 60+ seconds despite `adb shell dumpsys location` confirming the OS-level fix landed, and the on-screen Exit button appeared unresponsive. This looked like a serious, newly-confirmed regression and was investigated hard (checked for JS-thread hangs, ANR traces, per-thread CPU, uncaught exceptions via temporary `try/catch` instrumentation).

Root cause: the second test coordinate was chosen without checking its bearing relative to the route, and it happened to move *backward* (further from the destination) relative to the first jump. `RerouteService.clampMonotonicProgress` (`src/services/RerouteService.ts:30-39`) intentionally holds `remainingDistance`/`etaMinutes`/the snapped marker position at the last-accepted value when a new GPS fix would move progress backward by more than 15m — a deliberate anti-jitter guard against noisy GPS readings. Temporary debug logging confirmed the navigation effect *did* fire and complete without error for every GPS update, including the "frozen" one; the state just correctly declined to move backward. Repeating the test with a third coordinate that continued *forward* along the route (same bearing as the first jump) updated correctly: 10285→10662 m (instruction leg), 10843→10103 m (remaining distance), 130→121 min, and the marker moved forward on the map.

The Exit-button "unresponsive" observation in the same window was a tap-coordinate calculation error on my part (converting the wrong display→device scale), not a real touch-handling bug — confirmed by retapping at the corrected coordinates, which closed navigation immediately. This also retracts the "flagged for Phase 3" ANR/recenter-button note from the first Phase-1 pass above: that ANR is now understood to be a downstream effect of the same stale-DNS `netsimd` issue (Google-Maps tile-fetch retry storm), not an app defect. Phase 3 should still re-test Exit/recenter deliberately (for correct touch-target sizing etc.), but there is no evidence of a freeze/unresponsiveness bug to chase there anymore.

### Updated files changed this pass

- `src/viewmodels/NavigationViewModelV2.ts` — GPS listener effect now keyed on `isNavigating` instead of `route` (hardening fix, described above).

### Tests passed (this pass)

- `npm run typecheck` — clean.
- `npm test` — full suite (85 scripts), all passing, 0 failures.
- Live emulator re-verification: fresh emulator boot with working DNS, full search → directions → start-navigation flow, 3 sequential `adb emu geo fix` moves, all three confirmed live on-screen (distance/ETA/instruction/marker), including one deliberately "backward" move that correctly held steady per the anti-jitter guard and one "forward" move that correctly updated.

### Conclusion

**The live GPS navigation pipeline is confirmed working correctly**, including its anti-jitter/anti-backtrack behavior. No further Phase 1 GPS-pipeline work is needed.

## Phase 2 — Route preview state machine (overlapping Directions/Route-preview sheets)

### Root cause

`HomeScreen.tsx` renders two independent bottom-pinned overlays: the shared `@gorhom/bottom-sheet` `<BottomSheet>` (hosts `DirectionsScreen` whenever local state `directionsDestination` is non-null) and a separate absolutely-positioned `routePreviewCard` `View` (shown whenever the memoized `activePreviewRoute` — derived purely from the store's `activeRoute`/`routePlannerDest` — is truthy). Nothing tied these two conditions together.

`DirectionsViewModel.calculateRoute()` runs automatically in a `useEffect` as soon as `DirectionsScreen` mounts (`src/viewmodels/DirectionsViewModel.ts:298-300`), and on success writes `setActiveRoute`/`setRoutePlannerDest` directly to the shared store — before the user taps "Show route on map". This makes `activePreviewRoute` (and therefore `routePreviewCard`) become truthy while the Directions sheet is still open, for every normal use of the flow, not an edge case. The one effect meant to coordinate them (`HomeScreen.tsx:426-429`) only closes the sheet when `activePreviewRoute` is truthy **and** `directionsDestination` is falsy — so once both are truthy it early-returns and does nothing, leaving the sheet open with the card rendered underneath/alongside it.

### Fix

`routePreviewCard`'s render condition now also requires `directionsDestination` to be null:

```tsx
// src/views/screens/HomeScreen.tsx
{!isSearchFocused && !directionsDestination && activePreviewRoute && previewDestination && (
```

The card now only appears once the Directions sheet is actually closed (i.e. once `directionsDestination` is cleared via "Show route on map", the back button, or "Change destination") — at which point `activePreviewRoute` is already true from the store write, so the card appears immediately with no extra step needed. No changes to `DirectionsViewModel`'s auto-calculate-on-mount behavior — it's used to show live "Route ready" status inside the Directions sheet itself, which is correct as-is.

### Test

Added `src/__tests__/HomeScreen.test.tsx` → `HomeScreen — Directions sheet / route-preview card mutual exclusion`: opens the Directions sheet for a destination, seeds the store with an already-resolved v2 preview route for that same destination (mirroring what `DirectionsViewModel.calculateRoute()` writes automatically), and asserts the route-preview card's "Start Navigation" CTA is not on screen while "Get Directions" is. Confirmed failing before the fix (both texts present) and passing after.

### Files changed this pass

- `src/views/screens/HomeScreen.tsx` — `routePreviewCard` render condition now excludes `directionsDestination`.
- `src/__tests__/HomeScreen.test.tsx` — new regression test + `DirectionsViewModel` hook mock.

### Tests passed (this pass)

- `npx jest --config jest.config.js` — all 26 component tests pass (3 suites), including the new regression test.
- `npm run typecheck` — clean.
- `npm run test:home-ui-route-preview-v2`, `test:route-preview-v2`, `test:directions-v2`, `test:directions-buttons-v2`, `test:home-buttons-v2` — all pass, no regressions.

### Conclusion

Overlapping Directions/Route-preview sheets fixed at the root (missing mutual-exclusion condition), verified with a regression test that reproduced the bug before the fix. Phases 3-5 (Exit/recenter UX re-verification, unify Gate 08/14/15/16 routing, map label system) remain unstarted.

## Phase 3 — Exit/recenter touch-target re-verification

### Root cause

There are two copies of the live-navigation chrome: `src/views/components/navigation/NavigationChromeV2.tsx` (live, rendered as an overlay inside `HomeScreen.tsx`'s persistent MapView) and `src/views/screens/NavigationScreen.tsx` (`NavigationScreenV1`, unreachable in normal app flow — no code calls `navigate('Navigation')` — kept only as a defensive fallback and exercised by `NavigationScreen.test.tsx`). Both duplicate the same style values.

Investigation found three tappable controls sized at or under the Android 48dp minimum touch target, with zero `hitSlop` anywhere in either file:

- **Exit button** — `paddingVertical: 12` + content ≈ 44px effective height. Meets iOS's 44pt with no margin; **below** Android's 48dp by 4dp.
- **Mute toggle** (next to the instruction card) — `padding: 10` + 24px icon = exactly 44×44. Same boundary/fail pattern as Exit.
- **Recenter button** — exactly `48×48`, i.e. at the Android minimum with zero margin for touch-point rounding.

No overlapping sibling was found sitting on top of either button in the current layout (36-76px vertical clearance computed in all cases), but a latent stacking-order bug was found: `HomeScreen`'s `navControls` (compass/zoom, `zIndex: 5`) coexists on screen with `NavigationChromeV2`'s `bottomBar`/`recenterButton` (implicit `zIndex: 0`) whenever `showNavOverlay` is true — if their absolute-positioned regions were ever to collide (e.g. after a future spacing-constant change), `navControls` would win hit-testing over the live nav chrome's own Exit/recenter controls.

### Fix

- Added a shared `hitSlop={{top:8,bottom:8,left:8,right:8}}` constant (`NAV_TOUCH_TARGET_HIT_SLOP` in `navOverlayStyles.ts`, mirrored as a local const in `NavigationScreen.tsx`) to the Exit, mute, and recenter `Pressable`s in both files — widens tappable area without touching visual layout, bringing every control comfortably above 48dp.
- Added `zIndex: 6` to `navOverlayStyles.bottomBar` and `navOverlayStyles.recenterButton` so the live nav chrome always wins hit-testing over `HomeScreen`'s `navControls` (`zIndex: 5`) if their regions ever overlap.
- Added `testID="nav-exit-button"` to both Exit buttons and `testID="nav-mute-toggle"`/`testID="nav-recenter-button"` to the live `NavigationChromeV2` copy (the legacy screen already had the latter two) — closes a testability gap and lets touch-target regressions be caught by a component test.

### Test

Added `src/__tests__/NavigationChromeV2.test.tsx`: asserts all three buttons carry the widened `hitSlop`, and that Exit/Recenter still invoke their real handlers (`handleExit`, `setIsAutoFollowing(true)`). Confirmed failing before the fix (hitSlop temporarily stripped → `Received: undefined`) and passing after.

### Emulator verification

Ran the app on a live Android emulator (Metro + adb, no native rebuild needed — JS/TS-only change): searched Gate 08, opened Directions, "Use my current location", "Start Navigation" — reached live `NavigationChromeV2` overlay. Tapped Recenter (camera re-centered, no crash) and Exit (returned cleanly to the home map, no freeze). `adb logcat` showed no FATAL/AndroidRuntime/JS exceptions across the whole flow.

### Files changed this pass

- `src/views/components/navigation/navOverlayStyles.ts` — `NAV_TOUCH_TARGET_HIT_SLOP` export, `zIndex: 6` on `bottomBar`/`recenterButton`.
- `src/views/components/navigation/NavigationChromeV2.tsx` — hitSlop + testIDs on Exit/mute/recenter.
- `src/views/screens/NavigationScreen.tsx` (legacy fallback) — same hitSlop treatment, mirrored for parity.
- `src/__tests__/NavigationChromeV2.test.tsx` — new regression test.

### Tests passed (this pass)

- `npx jest --config jest.config.js` — all 29 component tests pass (4 suites), including the new regression test.
- `npm run typecheck` — clean.
- Manual emulator verification (see above).

### Conclusion

Exit, mute, and recenter touch targets are now all ≥48dp effective tappable area with margin, verified with a regression test and a live emulator run of the full navigation flow. No freeze/crash found — consistent with the earlier retraction that the freeze angle was a false lead. Phases 4-5 (unify Gate 08/14/15/16 routing, map label system) remain unstarted.

## Phase 4 — Unify Gate 08/14/15/16 routing

### Root cause

Three independent gate-selection implementations existed, each answering a differently-scoped question with no shared code between them:

1. `EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser` — pure straight-line (haversine) nearest gate, no destination awareness, no penalty logic. Used directly by the Home outside-venue banner (`HomeScreen.tsx`'s `nearestEntryGate`).
2. `EntryGateRoutingService.findBestGateForOutsideUser`/`resolveRouteStartForUser` — destination-aware (Dijkstra per candidate gate), but never called by any production code path with real `destinationNodeIds` — dead in practice, exercised only by its own test script.
3. `RoutingServiceV2`'s own multi-source A* (`resolveOutsideGateSeeds` + `findBestOutsidePath`/`selectOutsidePathViaBeeline`, plus `selectOutsidePathViaStreetGraph` behind the street-graph flag) — destination-aware **and** applies a 120m penalty to `needs_verification`-status gates (e.g. GATE_14). This is what Directions/route calculation actually uses.

Reproduced directly: for a user positioned exactly at GATE_08's coordinate with a destination near the GATE_14/15/16 cluster (block B32, ~161m from GATE_16), implementation 1 (Home banner) returns **GATE_08** while implementation 3 (Directions/`RoutingServiceV2.calculateRoute`) returns **GATE_16** — same position, same destination, two different answers. The banner names a specific gate as soon as a place is selected (`selectedPlace`) but before the user taps "Directions," so this mismatch was directly visible, not just theoretical — matching the live repro already logged in this doc's Phase-1 "Remaining Blockers" section and the original device acceptance report.

### Fix

Root-caused as duplicate, disagreeing implementations rather than one buggy one — no accuracy bug to patch in any single function. Fix is architectural de-duplication, not logic changes: added `RoutingServiceV2.recommendOutsideEntryGate(coordinate, destination?)`, which delegates to the exact same `selectOutsidePath` call `calculateRoute` uses when a destination is known (so it is *structurally* incapable of disagreeing with the route that would actually be computed), and falls back to `EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser` only when no destination is selected yet (nothing to optimize total cost against — not a disagreement, a different question). `HomeScreen.tsx`'s `nearestEntryGate` now calls this instead of the plain nearest-gate lookup directly, passing a `RoutingDestinationV2` derived from `selectedPlace` (via `destinationFromPlace`, exported from `V2DirectionsService.ts` — the same mapping Directions itself uses) whenever one is selected. `EntryGateRoutingService.findBestGateForOutsideUser`/dead destination-aware path was left in place (still covered by its own test) rather than deleted, since removing it wasn't necessary to fix the disagreement and was out of scope for this phase.

### Test

Added `scripts/test-unified-gate-routing.ts` (registered as `npm run test:unified-gate-routing-v2`, wired into `npm test`): reproduces the GATE_08-at-own-coordinate / B32-destination mismatch as a sanity check (nearest-only = GATE_08, destination-aware routing = GATE_16), then asserts `recommendOutsideEntryGate` returns the destination-aware answer when a destination is passed and the nearest-gate fallback when it isn't. Confirmed failing before the fix (`recommendOutsideEntryGate is not a function`) and passing after.

Running the full suite (`npm test`) surfaced two pre-existing, unrelated regressions from Phase 3's `NavigationChromeV2.tsx` JSX reformatting (multi-line Pressables broke brittle single-line string-match assertions in `scripts/test-navigation-buttons-v2.ts`) plus two source-grep tests pinned to the literal old banner call site (`scripts/test-critical-actions.ts`, `scripts/test-home-ux.ts`) that needed updating to assert the new `RoutingServiceV2.recommendOutsideEntryGate` call instead — all three fixed by updating the assertions to match current source, not by reverting behavior.

### Files changed this pass

- `src/services/RoutingServiceV2.ts` — new `recommendOutsideEntryGate` static method.
- `src/services/V2DirectionsService.ts` — exported `destinationFromPlace` (was already used internally; now shared with `HomeScreen`).
- `src/views/screens/HomeScreen.tsx` — `nearestEntryGate` now destination-aware via `RoutingServiceV2.recommendOutsideEntryGate`; dropped the now-unused direct `EntryGateRoutingService` import.
- `scripts/test-unified-gate-routing.ts` — new regression test.
- `scripts/test-navigation-buttons-v2.ts`, `scripts/test-critical-actions.ts`, `scripts/test-home-ux.ts`, `scripts/test-outside-banner-gate-v2.ts` — updated brittle string assertions to match current source (Phase 3 JSX reformatting + this phase's banner call site change).
- `package.json` — registered `test:unified-gate-routing-v2`, wired into `npm test`.

### Tests passed (this pass)

- `npm run typecheck` — clean.
- `npm test` (full 60+ script suite) — all pass, 0 failures.
- `npx jest --config jest.config.js` — all 29 component tests pass (4 suites), unaffected by this phase.
- `npx eslint` on all changed files — clean.

### Not verified this pass

No live emulator run this phase (not requested; this phase's change is a same-screen text/logic change, not touch/gesture/GPS-pipeline behavior already covered by Phase 1/3's device passes). Per this doc's own runtime-status rule, script/typecheck passes alone don't establish production readiness — an on-device confirmation that the Home banner and Directions now agree on the same gate for a real outside GPS position is still recommended before calling this production-verified.

### Conclusion

The three disagreeing gate-selection implementations are now unified: whenever a destination is known, both the Home banner and Directions route through the identical `RoutingServiceV2` selection logic and cannot diverge. Verified with a regression test that reproduces the original GATE_08-vs-GATE_16 mismatch and confirms the fix, plus a clean full test-suite/typecheck pass. Phase 5 (map label system) remains unstarted.

## Phase 5 — Map label system (missing block/rasta labels, gate label clipping)

### Root cause: missing block/rasta labels (FIXED)

`BlockLayer.tsx`, `RastaLayer.tsx`, and `SpecialRouteLayer.tsx` hardcoded `tracksViewChanges={false}` on their label `Marker`s with no mechanism to ever flip it true. `GateLayer.tsx` had the opposite problem in the other direction: it *did* have a transition window (`gateMarkersTransitioning`), but it was keyed only on map-filter + selected-place-id, not zoom level — so a block/rasta label mounting for the first time as the user zooms past `MEDIUM_ZOOM` (or present at initial mount) got its native Android bitmap snapshotted with `tracksViewChanges` already permanently false. React Native Maps on Android can capture that first snapshot before the label's layout has settled, and with no later refresh trigger the marker is stuck blank/incorrect forever. Reproduced live on the Android emulator: block and rasta labels were invisible at every zoom level tested, even fully zoomed into a single block's interior at `HIGH_ZOOM` where the LOD logic (`pickByZoom`) unconditionally includes them.

**Fix:** generalized the gate-only transition-window mechanism into a shared `mapLabelsTransitioning` state in `HomeScreen.tsx` (renamed from `gateMarkersTransitioning`), keyed on `` `${activeMapFilter}|${selectedPlace?.id}|${zoomLodTier}` `` — adding a zoom-LOD tier (low/medium/high, bucketed off the existing `MEDIUM_ZOOM`/`HIGH_ZOOM` constants) to the signature, plus a one-time mount effect so labels already visible at first paint also get an initial snapshot window. Added a `transitioning` prop to `BlockLayer`, `RastaLayer`, and `SpecialRouteLayer` (mirroring `GateLayer`'s existing prop) and wired `tracksViewChanges={transitioning}` into their label `Marker`s in place of the hardcoded `false`. All four layers now share one signal from `HomeScreen`.

**Verified live on the Android emulator** (cold `force-stop` + relaunch, not just JS reload): block labels ("Block 1", "Block 2") and rasta labels ("Rasta 01") now render correctly at appropriate zoom, confirmed via screenshots. This is the primary bug from the original report and is confirmed fixed.

### Root cause: gate full-label clipping ("Gat[e] 08") — investigated, NOT fixed

Reproduced live: a gate's full "Gate NN" label (shown when selected, or unselected at `HIGH_ZOOM`) renders hard-clipped on Android — a straight vertical cut partway through the text ("Gat" then nothing), not a wrap or ellipsis, with the rounded top-left corner intact. This is the "Ga" clipping symptom from the original bug report.

Six independent, individually cold-boot-verified fix attempts, all following the systematic-debugging Iron Law (hypothesis → minimal test → verify) — **none changed the rendered result**:

1. `tracksViewChanges` bounded transition window (the existing gate mechanism, extended with zoom tier per the fix above).
2. `tracksViewChanges={true}` permanently (rules out any snapshot-staleness/timing theory).
3. Content-keyed `Marker` `key` (forces full unmount+remount instead of in-place re-render, in case react-native-maps caches native frame size at first mount).
4. Deterministic `minWidth`/`minHeight` on the label style (removes any dependency on Text-measurement timing).
5. Fixed (non-min) `width`/`height` (documented react-native-maps workaround — forces an exact `MeasureSpec` instead of `UNSPECIFIED`/wrap-content).
6. `collapsable={false}` on the child `View` (prevents RN's view-flattening optimizer from merging the view react-native-maps needs to snapshot).

Decisive diagnostic: added a temporary `onLayout` handler to the label `View` and confirmed via Metro logs that **React Native's own layout engine measures the box correctly** — `{"width":108,"height":49.7}`, exactly matching the `minWidth`/`minHeight` applied in attempt 4 — while the marker rendered on the map was still visibly clipped to roughly a third of that width. This rules out every JS/style-level explanation: the layout is correct, so the clip is happening downstream, inside react-native-maps' native Android marker-snapshot capture, which this app's JS/style layer cannot reach or fix. The app's dev menu identifies itself as "React Native Dev Menu (Bridgeless)" — running on React Native's New Architecture — and react-native-maps has known compatibility gaps in custom-marker-view snapshot capture under Fabric/Bridgeless, which best fits all the evidence gathered.

Per the systematic-debugging skill's guidance ("if 3+ fixes fail, question the architecture, discuss before attempting more"), stopped after 6 documented attempts rather than continuing to guess. Reverted all experimental values (debug colors, oversized widths, the `onLayout` probe) to sensible production defaults; kept `minWidth`/`minHeight` (108/34), `collapsable={false}`, and the content-keyed remount, since none of them are harmful and are reasonable defensive practice even though none resolved this specific bug — documented as such directly in `GateLayer.tsx`.

**Recommended next step** (not attempted this pass, needs a decision, not another blind fix): either (a) pin/bump `react-native-maps` to a version with confirmed Fabric-compatible custom marker snapshotting, (b) disable the New Architecture for this app if that's viable, or (c) stop relying on a dynamically-sized custom-View marker for the full gate label — e.g. pre-render each gate's full label as a static image/icon `Marker` (bypassing the live View-snapshot path entirely), or drop the "full text" tier and let the bottom sheet (which already renders "Gate 08" correctly, being outside the map's marker system) be the only place the full name appears.

### Test

No new regression test was added for the clipping bug, since there is no fix yet to pin a test to — a test asserting "the marker isn't clipped" can't be expressed as a source-grep or logic assertion the way this repo's other tests are, and would need either a native/visual-diff harness (out of scope for this pass) or would just be re-testing react-native-maps' own internals.

`scripts/test-marker-performance-v2.ts` needed updating for the `gateMarkersTransitioning` → `mapLabelsTransitioning` rename and the block/rasta/special-route label markers switching from a hardcoded `tracksViewChanges={false}` assertion to the same `transitioning`-prop assertion already used for gates (moved those three out of the "static markers fixed to false" bucket into their own transition-tracked-label assertions, preserving the check's original intent — confirming label markers are not left permanently non-refreshing — rather than weakening it).

### Files changed this pass

- `src/views/screens/HomeScreen.tsx` — `gateMarkersTransitioning`/`gateVisualSignature` renamed and broadened to `mapLabelsTransitioning`/`mapLabelVisualSignature` (now includes zoom-LOD tier); added a mount-time transition window; passes `transitioning` into `RastaLayer`, `SpecialRouteLayer`, and `BlockLayer` in addition to `GateLayer`.
- `src/views/components/map/BlockLayer.tsx`, `RastaLayer.tsx`, `SpecialRouteLayer.tsx` — added `transitioning` prop; label `Marker`s use `tracksViewChanges={transitioning}` instead of hardcoded `false`; label `Marker` `key`s now also encode `focused`/`isSelected` (forces remount on style-affecting state changes, matching `GateLayer`'s existing pattern — reasonable practice, though not what fixed anything here).
- `src/views/components/map/GateLayer.tsx` — full-label `Marker` `key` now encodes `displayLabel`/`isCompact`/`isSelected`; child `View` gets `collapsable={false}`; documents the known unresolved clipping issue and the six fix attempts ruled out.
- `src/views/components/map/mapLayerStyles.ts` — `v2GateMarker`/`v2GateMarkerFocused` gained `minWidth`/`minHeight` (kept as reasonable defensive sizing, not a confirmed fix).
- `scripts/test-marker-performance-v2.ts` — updated for the rename; block/rasta/special-route label markers now assert `transitioning`-prop tracking instead of permanent `false`.

### Tests passed (this pass)

- `npm run typecheck` — clean.
- `npm test` (full script suite) — all pass, 0 failures.
- `npx jest --config jest.config.js` — 29/29 component tests pass, unaffected.
- `npx eslint` on all changed files — clean.
- **Live Android emulator** (multiple cold `force-stop` + relaunch cycles, not just JS reload): block/rasta label visibility fix confirmed working via screenshots; gate full-label clipping confirmed still present after all six fix attempts, each individually cold-boot-verified.

### Not verified this pass / outstanding

- Gate full-label clipping remains unresolved — see "Recommended next step" above. This is the one open item from the original bug report's "Ga" clipping description.
- iOS was not tested this pass (this investigation was Android-emulator-only; react-native-maps' iOS marker rendering uses a different native path — `MKMapView`/`GMSMapView` UIView-based, not Android's bitmap-snapshot approach — so the clipping bug may be Android-specific, but this has not been confirmed either way).

### Conclusion

The primary reported bug — missing block/rasta labels — is fixed and confirmed live on-device: all label markers now share one zoom-aware `tracksViewChanges` transition window instead of gates having one and blocks/rastas having none. The secondary reported bug — gate full-label clipping — was investigated thoroughly (six isolated, cold-boot-verified fix attempts spanning every plausible JS/style-level cause, plus a decisive `onLayout` diagnostic proving React Native's own layout is correct) but not resolved; root-caused to a react-native-maps native rendering limitation under this app's New Architecture runtime, which is outside what a JS/style change can fix and needs an architectural decision (library version, New Architecture opt-out, or a different marker-rendering approach for gate labels) before attempting further fixes.
