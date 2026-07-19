# Real-Device UX Audit — Android Emulator, First-Time-User Pass

**Verdict: FAIL — not production-ready.** The app is functionally correct end-to-end (search → directions → outside-gate routing → live navigation all completed successfully with a real computed route), but the on-screen experience does not read as a finished, Google-Maps-quality product. A first-time elderly user would be confused by an orange banner overlapping the filter row, would see a native "Gat[e]" clipped label on every zoomed-in gate, would see a dev-only "Open debugger to view warnings" toast sitting permanently at the bottom of the screen, and would have to scroll past a duplicated search bar to find the "Show route on map" button. None of these break the app outright, but together they make the screen look unfinished, which is the harshest fair reading of "does it look like Google Maps" — it does not.

Audit performed on Android emulator `emulator-5554`, cold-launched (`force-stop` + `monkey` launch) against a fresh Metro bundle, package `com.aicrafted.karachiijtema`, dated 2026-07-20. The host machine was under heavy load for part of this session (`load average` peaked at 61, causing several `System UI isn't responding` ANRs and a ~30s GPS-resolution delay) — this is called out per-finding below and is not attributed to the app where it is clearly a `com.android.systemui`/host artifact, matching the same host-resource-exhaustion pattern already logged in `docs/TARGETED_FIX_SPRINT_REPORT.md`.

## Per-Screen Assessment

### Home / map browse
Screenshot evidence: `qa_home_wait.png`, `qa_after_wait2.png`

- **Understandable in 3 seconds?** Mostly yes — the venue boundary (green outline), the purple special-route line, and numbered gate markers are legible at the default zoom.
- **Labels readable?** At this zoom (below `MEDIUM_ZOOM`), gates render as bare 2-digit numbers in filled circles (e.g. "05", "08", "13", "21") with no "Gate" word — acceptable at this LOD tier, but a first-time user has no way to know these numbers mean "Gate" until they tap one.
- **Controls discoverable?** Search bar and category chips (All/Blocks/Rastas/Gates) are clear and Google-Maps-familiar. The floating layers/compass/zoom/recenter buttons on the right are a recognizable pattern.
- **Anything clipped?** No, at this zoom.
- **Google Maps quality?** Reasonably close at this zoom level specifically.

### Search
Screenshot evidence: `qa_search_open.png`, `qa_search_results.png`

- Opens cleanly with a "Recent" list (Block 40, Gate 08, Block 1, Block 25 from prior test sessions on this emulator — not a fresh-install artifact).
- Typing "Gate" returns a clean, fast, correctly-ranked list (Gate 01–Gate 07 visible) with bilingual EN/UR labels and category subtext. This screen is genuinely close to Google Maps quality — no issues found.

### Filters
Screenshot evidence: `qa_home_wait.png` (chip row: All / Blocks (42) / Rastas (11) / Gates (17))
- Chips are legible, show live counts, and the pattern is standard. The only issue with this UI is not the chips themselves but what gets rendered on top of them — see "Outside-venue banner overlaps filter chips" below.

### Place selected (Gate 08)
Screenshot evidence: `qa_place_selected_gate08.png`

- **Understandable in 3 seconds?** Yes — "Gate 08", Urdu name, category, a prominent green "Directions" button, Save/Share/Details row, and a description line. This bottom-sheet content is clean and well laid out.
- **Labels readable?** The bottom-sheet text is fine. The **on-map marker label is not** — see "Gate label clipping" below, directly visible in this same screenshot ("Gat" with the rest of "Gate 08" cut off vertically).
- **Controls discoverable?** Yes, "Directions" is unambiguously primary.
- **Anything clipped?** Yes — the gate marker label on the map (not the sheet text).
- **Google Maps quality?** No — three simultaneous issues stack in this one screenshot: the clipped gate label, the orange banner overlapping the filter chips, and a dev-only debugger toast pinned to the bottom of the screen.

### Directions (route preview)
Screenshot evidence: `qa_no_toast.png`, `qa_directions_route_ready.png`, `qa_tap_sanity.png`

- **Understandable in 3 seconds?** Yes — "Get Directions", "Going to: Gate 08", "Where are you starting from?" with three clearly-labeled options (current location / last known / manual).
- **Labels readable?** Yes.
- **Controls discoverable?** Yes, but the primary CTA ("Show route on map") is pushed below the fold — see "Redundant search UI in Directions sheet" below.
- **Anything clipped?** No.
- **Google Maps quality?** The card design itself (rounded cards, blue accent, metric pills for ETA/distance/speed) is genuinely good and close to production quality. The layout problem (wasted vertical space above it) is what drags this screen down.
- Functionally this screen is correct: with a simulated GPS position ~13.75 km south of the venue, it correctly computed a 13,754 m / 164 min outside-to-gate route and displayed "Outside Ijtema" / "Enter through Gate 08" messaging exactly per `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`.

### Navigation (live)
Screenshot evidence: `qa_start_nav.png`, `qa_after_exit4.png`, `qa_back_test.png`

- **Understandable in 3 seconds?** Yes — large green instruction banner ("Walk 13754 meters to enter through Gate 08"), bottom summary card (164 min · 13754 m · ETA 4:13 AM · Gate 08), red Exit button.
- **Labels readable?** Yes, good contrast and size.
- **Controls discoverable?** Yes for Exit (impossible to miss, red pill). Mute-toggle icon (top-right of green banner) is small but has an obvious purpose from the icon.
- **Anything clipped?** No.
- **Google Maps quality?** This is the strongest screen in the app — closest to a real turn-by-turn product.
- One process note, not filed as an app defect: on-screen taps on the red "Exit" button did not register several times in a row in this session (screen simply re-rendered with no state change), while the hardware Back button correctly triggered a proper "Exit navigation? / Cancel / Exit" confirmation dialog on the first press, and tapping "Exit" inside that dialog worked immediately. Given this exact button already received a `hitSlop` fix and was live-verified working in `docs/TARGETED_FIX_SPRINT_REPORT.md` Phase 3, and given this session had independently-confirmed host overload (`System UI isn't responding` ANRs, load average 50-61) actively dropping/delaying `adb input tap` events during the same window, this reads as an artifact of this session's host load rather than a new regression. Flagged for awareness, not filed as a numbered issue.

## Issues Found

1. **Gate label hard-clipping on Android markers**
   - **Screenshot evidence:** `qa_place_selected_gate08.png` (navy marker below "Gate No 9" POI shows "Gat" with the rest cut off)
   - **Root cause:** Confirmed pre-existing, documented issue. `GateLayer.tsx`'s full "Gate NN" label `Marker` renders via react-native-maps' native Android marker-snapshot capture, which clips the bitmap short of the view's actual measured size on this app's New Architecture ("Bridgeless") runtime. `docs/TARGETED_FIX_SPRINT_REPORT.md` documents six independently cold-boot-verified fix attempts (tracksViewChanges toggling, content-keyed remount, min/fixed width+height, `collapsable={false}`) that did **not** resolve it, plus a decisive `onLayout` diagnostic proving RN's own layout is correct (108×49.7dp) while the native snapshot still renders clipped. This audit re-confirms the bug is still present and visually identical to what was previously documented.
   - **File/component:** `src/views/components/map/GateLayer.tsx` (see the in-code "KNOWN ISSUE" comment, lines 73-85); `src/views/components/map/mapLayerStyles.ts` (`v2GateMarker`, lines 88-108).
   - **Priority:** P1 — degrades every gate label at `HIGH_ZOOM` or when selected, but the bottom-sheet ("Gate 08") remains fully readable as a fallback, so it does not block task completion.
   - **Fix recommendation:** Per the report's own "Recommended next step": pin/bump `react-native-maps` to a version with confirmed Fabric-compatible custom marker snapshotting, evaluate disabling New Architecture for this app, or replace the dynamic-text full-label marker with a pre-rendered static image/icon marker (bypassing the live View-snapshot path). A cheaper stopgap: drop the "full text" LOD tier entirely and let the bottom sheet be the only place the full "Gate NN" name appears, showing only the always-legible compact `G08`/`08` marker on the map itself.

2. **Orange "Outside Ijtema" banner overlaps the category filter chip row**
   - **Screenshot evidence:** `qa_place_selected_gate08.png`, `qa_final_home.png` (chips "Gates (17)" and the left edge of the chip row visibly peek out from behind/above the orange banner instead of the banner sitting cleanly below them)
   - **Root cause:** `HomeScreen.tsx` positions the banner stack with `const bannerStackTop = topInsetBase + 140;` (line 379) — a **hardcoded magic-number** vertical offset meant to clear the search bar + filter chip row above it. The comment directly above this line (lines 375-378) explains that a prior fix ("Phase 7") replaced hardcoded per-banner height guesses with `onLayout`-measured heights for `rightControlsTop`/`rightControlsBottom` — but that fix only measures the banner stack's own height (`bannerStackHeight`), never the height of the search bar + chip row sitting above it. The `140` constant under-estimates the actual rendered height of the search bar (52dp + 8dp margin) plus the chip row (~54-58dp with padding), so the banner's fixed top position lands partway into the chip row instead of below it.
   - **File/component:** `src/views/screens/HomeScreen.tsx`, line 379 (`bannerStackTop`), and the `SafeAreaView`/chip row at lines 879-978.
   - **Priority:** P1 — the banner remains readable and the chips remain tappable (it's a visual overlap, not a hit-testing loss, since the banner has its own `X` dismiss and the important text is fully visible), but it looks broken/unfinished on first glance, which is exactly the kind of thing a first-time user notices immediately.
   - **Fix recommendation:** Measure the search bar + chip row height the same way `bannerStackHeight` is already measured (an `onLayout` on the wrapping `SafeAreaView`/chip container) and use that measured value instead of the hardcoded `140`.

3. **Dev-only "Open debugger to view warnings" toast permanently visible**
   - **Screenshot evidence:** `qa_place_selected_gate08.png`, `qa_directions_route_ready.png`, `qa_start_nav.png` (visible pinned to the bottom of every screen throughout the session)
   - **Root cause:** This is React Native's built-in LogBox component (`node_modules/react-native/Libraries/LogBox/Data/LogBoxData.js:500`, literal string `'Open debugger to view warnings.'`), not custom app code. It surfaces because at least one native warning is logged during startup — `logcat` shows `BridgelessReactContext: [WARNING] Bridgeless doesn't support CatalystInstance. Accessing an API that's not part of the new architecture is not encouraged usage.`, which fires because some native module (very plausibly `react-native-maps`, given the New-Architecture marker-snapshot issue above) still calls a legacy Bridge API path under the app's New Architecture runtime. This toast **only appears in `__DEV__`/Metro-connected builds** and will not appear in a release APK — but it recurred continuously across every screen transition in this dev session, which is itself worth noting since it will be seen on every internal QA/dev-build test pass.
   - **File/component:** Not app code — `react-native`'s LogBox, triggered indirectly by a New-Architecture compatibility warning likely originating in a native module (probably `react-native-maps`, same root cause family as finding #1).
   - **Priority:** P2 — invisible in production release builds, but worth investigating the underlying Bridgeless warning since it is the same architectural class of issue behind the gate-label clipping bug.
   - **Fix recommendation:** Track down which native module triggers the `BridgelessReactContext` warning (`adb logcat | grep BridgelessReactContext` at startup) and confirm whether it correlates with an outdated/incompatible native-module version — this may also inform the fix path for finding #1.

4. **Redundant search bar + filter chips consume space above the Directions sheet**
   - **Screenshot evidence:** `qa_no_toast.png`, `qa_directions_route_ready.png` (the "Search blocks, rastas, gates" bar and All/Blocks/Rastas/Gates chips remain fully rendered above the "Get Directions" sheet header, forcing two full swipes to reach "Route ready" / "Show route on map")
   - **Root cause:** The `SafeAreaView` containing the search bar and filter chips (`src/views/screens/HomeScreen.tsx`, line 879) has no condition excluding it when `directionsDestination` is set. It is `pointerEvents="box-none"` so taps pass through to the sheet below where the sheet doesn't cover it, but it still occupies its normal layout position underneath/behind the `BottomSheet`, pushing the Directions sheet's own header and content down and requiring extra scrolling to reach the primary "Show route on map" CTA.
   - **File/component:** `src/views/screens/HomeScreen.tsx`, lines 879-978 (search bar `SafeAreaView`), condition should also check `!directionsDestination`.
   - **Priority:** P1 — this is issue #6 from the audit brief ("search/filter UI consumes too much vertical space, crowding out the map/content") and directly delays reaching the primary action on the single most important screen in the app (starting a route).
   - **Fix recommendation:** Hide (or animate-collapse) the search bar + chip row whenever `directionsDestination` is non-null, mirroring how the outside-venue banner and route-preview card already exclude themselves in that state.

5. **Recenter button visually overlaps/replaces the zoom-out control when the route-preview card is showing**
   - **Screenshot evidence:** `qa_tap_sanity.png` (right-side control stack shows layers → compass → "Free rotate" → "+" → recenter, with no visible "−" button)
   - **Root cause:** `rightControls` (layers/compass/zoom pill) is positioned `top: rightControlsTop` (anchored from the top) while `bottomControls` (just the recenter button) is positioned `bottom: rightControlsBottom + 80` (anchored from the bottom) as two fully independent absolute-positioned `View`s (`src/views/screens/HomeScreen.tsx`, `rightControls`/`bottomControls` styles + their usages around lines 1062-1100). `rightControlsBottom` grows by `routePreviewCardMeasuredHeight + 16` whenever the route-preview card is visible, pushing the bottom-anchored recenter button upward with no collision check against the top-anchored zoom pill above it. This is the same class of bug already flagged (but not previously reproduced in this exact pairing) as a "latent stacking-order bug" in `docs/TARGETED_FIX_SPRINT_REPORT.md` Phase 3, there described for the nav-mode `navControls`/`bottomBar` pair.
   - **File/component:** `src/views/screens/HomeScreen.tsx`, `rightControls`/`bottomControls` absolute-positioning logic and the `rightControlsTop`/`rightControlsBottom` calculations (lines 379-381).
   - **Priority:** P2 — visually confusing (Google Maps never lets its own zoom control disappear behind another button) but the zoom pill remains reachable by zooming via pinch gesture, so it does not block a core task.
   - **Fix recommendation:** Compute both stacks' effective screen rectangles and either clamp `bottomControls`' position so it cannot rise above `rightControls`' bottom edge, or move the recenter button into the same top-anchored `rightControls` stack so they can never separate.

6. **Recenter / "use current location" GPS resolution takes ~30 seconds with zero loading feedback**
   - **Screenshot evidence:** not directly screenshottable (the failure state is silence, not a visible screenshot difference); confirmed via `adb logcat`: `01:09:23.786 [HomeControl] pressed=recenter action=resolve_location_and_center` followed 30 seconds later by `01:09:54.008 [HomeControl] { pressed: 'recenter', action: 'location_unavailable', message: 'Current location is unavailable. Choose start manually.', canAskAgain: true, granted: true }` despite location permission already being granted.
   - **Root cause:** `handleRecenter` in `src/viewmodels/HomeViewModel.ts` (lines 190-294) calls `LocationAccessService.resolveCurrentLocation(true)` (`src/services/LocationAccessService.ts`, lines 42-140), which awaits `Location.getCurrentPositionAsync({ accuracy: Balanced })` with no timeout and no intermediate UI state — `handleRecenter` sets no "resolving..." flag anywhere in this window, so the recenter button gives the user zero visual feedback for the entire duration of the underlying OS location call. When that call is slow (observed here) or fails, the fallback `getLastKnownPositionAsync()` was also empty, producing a plain native `Alert.alert('Location unavailable', ...)` after the full delay. This may be substantially emulator-specific (real devices typically return a GPS/network fix in 1-5s), but the missing "resolving" affordance is a real, device-independent gap: a first-time user tapping recenter and seeing nothing happen for any noticeable period (let alone 30s) will assume the button is broken and tap it repeatedly.
   - **File/component:** `src/viewmodels/HomeViewModel.ts` (`handleRecenter`, lines 190-294); `src/services/LocationAccessService.ts` (`resolveCurrentLocation`, lines 42-140).
   - **Priority:** P1 — directly affects the "finding their location" core task named in the priority guidance, and the missing loading state is a genuine app gap independent of the emulator's actual GPS latency.
   - **Fix recommendation:** Set a `resolvingLocation` boolean around the `await LocationAccessService.resolveCurrentLocation(true)` call and show a spinner/disabled state on the recenter button while it's in flight; consider adding an explicit timeout (e.g. 8-10s) to `getCurrentPositionAsync` so the fallback to last-known-location or the "unavailable" alert triggers faster instead of waiting on the OS call indefinitely.

7. **Transient blank/tan map area on cold start (not a bug, but worth documenting)**
   - **Screenshot evidence:** `qa_after_skip.png` (fully blank/pale map, no tiles, no data layers) vs. `qa_home_wait.png` (fully rendered, ~5s later)
   - **Root cause:** Standard Google Maps tile-load latency after the `MapView` mounts, compounded here by the "Offline Maps" interstitial screen shown first (background tiles not yet downloaded on this emulator — "Skip - Use online mode" was used to proceed). Not persistent; resolved on its own within ~5 seconds in every cold-launch observed this session.
   - **File/component:** N/A — normal `react-native-maps`/Google Maps tile loading behavior, and `src/views/screens/DownloadMapScreen.tsx`-style offline-map onboarding gate (not investigated further as it is out of scope and working as designed).
   - **Priority:** P2 — worth a loading skeleton/spinner over the map area during this window so it doesn't read as broken, but it is not a functional defect.
   - **Fix recommendation:** Show a lightweight loading indicator over the `MapView` until `onMapReady`/first tile paint fires, rather than a blank pale background.

8. **Developer-mode debug overlay controls did not reproduce this session (informational — not a defect)**
   - The pre-seeded concern about a debug button cluster (Nodes/Rasta Names/Diagnostics) is real code (`src/views/screens/HomeScreen.tsx` lines 1102-1114, `1035-1049`) but is correctly gated behind `__DEV__ && developerModeEnabled`, and `developerModeEnabled` defaults to `false` and is persisted via the store (`src/store/useAppStore.ts` line 322). It was not visible at any point in this session. The debug-looking element that **was** visible throughout is the separate RN LogBox toast documented as finding #3 above, which the audit brief's item #4 concern is best understood as referring to in practice — that one small distinction (persisted developer setting vs. a stock Metro/dev-client toast) is worth keeping straight when triaging.
   - **Priority:** N/A (informational, not a filed defect).

## Fix Verification Log (P1 fix pass, 2026-07-20)

### Issue #2 — Orange banner overlapping filter chips: FIXED, verified
- **Root cause (recap):** `bannerStackTop = topInsetBase + 140` hardcoded guess in `HomeScreen.tsx`.
- **Fix applied:** Added `topOverlayHeight` state, measured via `onLayout` on the search-bar+chip-row `SafeAreaView`. `bannerStackTop` now derives from that real measured height (`topOverlayHeight + 8`), falling back to the old constant only for the one frame before first layout.
- **Before screenshot:** `qa_place_selected_gate08.png` (prior audit — banner overlapped "Gates (17)" chip).
- **After screenshot:** `verify_fix1_home_after_skip.png` — banner ("Outside Ijtema · Enter through Gate 14") sits cleanly below the full chip row with visible separation, no overlap.
- **Visually verified by me directly** (not just agent report): confirmed clean stacking in the after screenshot.

### Issue #4 — Redundant search bar/chips crowd the Directions sheet: FIXED, verified
- **Root cause (recap):** search+chip `SafeAreaView` had no exclusion for `directionsDestination` being set.
- **Fix applied:** Search+chip overlay condition changed to `!showNavOverlay && !directionsDestination` — fully unmounts (not just visually covered) while the Directions sheet is open.
- **Before screenshot:** `qa_no_toast.png` (prior audit — search bar + chips rendered above Directions sheet, pushing CTA below the fold).
- **After screenshot:** `verify_fix2_directions_screen.png` — Directions ("Get Directions" → "Gate 14") sheet visible with plain map above it, no search bar, no chip row.
- **Visually verified by me directly.**

### Issue #6 — Recenter button had no loading feedback: FIXED, verified
- **Root cause (recap):** `handleRecenter` awaited GPS resolution with zero UI state; button looked frozen for up to ~30s.
- **Fix applied:** `handleRecenter` (`HomeViewModel.ts`) now returns a `boolean` success flag. `HomeScreen.tsx` wraps it in `handleRecenterPress` driving a `recenterState: idle|loading|success|failure` state machine — spinner while resolving, green check or red warning-triangle flash on settle, auto-revert to idle after 1200ms.
- **Before:** silent 30s wait, then a plain native alert (see original finding #6 logcat evidence).
- **After screenshot:** `verify_fix3_t2600ms.png` — blue spinner rendered in the recenter button slot while GPS resolves (this session's emulator took ~7s); agent's fuller capture sequence confirms spinner → resolution → dialog → revert to idle icon.
- **Visually verified by me directly** (loading-spinner frame); success/failure flash + revert confirmed via delegated agent's multi-frame sequence, consistent with a straightforward one-way state transition.

### Issue #1 — Gate label hard-clipping on Android markers: ATTEMPTED, NOT FIXED, reverted
- **Attempt (2026-07-20):** Built a shared `MapLabelBubble` component (`src/views/components/map/MapLabelBubble.tsx`) computing each label's pixel width/height from its actual text content at mount time — a character-count heuristic with a safety buffer — instead of the old static CSS `minWidth`. Wired into `GateLayer`/`BlockLayer`/`RastaLayer`/`SpecialRouteLayer`'s full-label markers. Rationale: all six prior fix attempts kept a static size and hoped it was big enough; this was the one untried variable.
- **Result: did not fix the clip.** Cold-boot verified on-device (two rounds — one delegated-agent pass, one I checked directly against the screenshots myself): the selected "Gate 08" marker rendered with almost no text at all, worse than the pre-existing "Gat[e] 08" clip. Screenshots: `verify_labelbubble_12_clean.png`.
- **Scope correction:** while verifying this attempt, the same clip pattern ("Bloc[k] NN") turned up on Block labels at a dense-cluster zoom level. Reverting `MapLabelBubble` entirely and re-testing the exact original, unmodified code (`revert_check_blocks_zoomed.png`) reproduced the identical "Bloc" truncation — confirming this is a **pre-existing bug on Block labels too**, not something this attempt introduced. The bug's real scope was undercounted in the original audit (which only screenshotted gate labels at this density); it is not gate-specific.
- **Action taken:** reverted `MapLabelBubble` and all four layer files to their pre-attempt working state (`git`-visible as a revert, not left half-applied). Typecheck, `test:marker-performance-v2`, and the full jest suite all pass post-revert. `GateLayer.tsx`'s in-code comment updated with this finding for the next attempt.
- **Status: still P1, unresolved, now attempt #7 failed.** Per this repo's own documented debugging discipline (`docs/TARGETED_FIX_SPRINT_REPORT.md`), 3+ failed fixes on the same symptom means stop guessing and question the architecture rather than trying an eighth variant blind. Every attempt so far — including this one — has kept the label as a `Marker` child (a JS-composed View/Text tree captured by react-native-maps' native Android snapshot pipeline); that pipeline itself is the common failure point across all seven attempts, static or dynamic sizing alike, gate or block. **The one architecture not yet tried that stays within the "no image markers" constraint:** render labels as a plain React Native overlay positioned *above* the `MapView` (not as `Marker` children at all), driven by manual lat/lng-to-screen-pixel projection synced to camera region changes — this fully bypasses the native marker-snapshot code path rather than trying to out-tune it again. This is a materially bigger change (new projection math, continuous region tracking across pan/zoom, touches all 4 label layers structurally) and is not attempted in this pass — flagging for an explicit go-ahead before spending further budget on it.

### Bonus (not a filed audit issue, added per this fix pass's "Google Maps style" filter requirement) — chip row fades while panning the map
- **Fix applied:** `onPanDrag` sets `isMapDragging=true`; chip row opacity animates 1→0 over 150ms via `Animated.timing`, reverts on `onRegionChangeComplete`.
- **Verification status: INCONCLUSIVE, not claimed as PASS.** adb-synthesized swipes + screenshot capture could not reliably catch a 150ms opacity animation frame — every captured frame showed the chips fully opaque (either too early or after the revert already fired). Code path was reviewed and the wiring is correct (`chipsAnim`/`isMapDragging` in `HomeScreen.tsx`), but per this audit's own rule, code review is not proof — this sub-feature is not marked verified-working, only implemented.

## Fix Queue

### P0 — Blocking usability issues
None found. Every core task attempted (search, place selection, get directions, outside-gate routing, start navigation, exit navigation) completed successfully.

### P1 — Major UX issues
- Gate label hard-clipping on Android markers (#1) — **still unresolved after 7 attempts** (attempt #7, MapLabelBubble, made and reverted this fix pass — see Fix Verification Log). Now confirmed to also affect Block labels, not just Gates. Needs an architecture decision (off-map projected overlay, bypassing react-native-maps' Marker snapshot pipeline entirely) before attempt #8.
- ~~Orange outside-venue banner overlaps the filter chip row (#2)~~ — **FIXED, verified 2026-07-20**, see Fix Verification Log.
- ~~Redundant search bar/filter chips crowd the Directions sheet (#4)~~ — **FIXED, verified 2026-07-20**, see Fix Verification Log.
- ~~Recenter/current-location resolution has no loading feedback (#6)~~ — **FIXED, verified 2026-07-20**, see Fix Verification Log.

### P2 — Polish
- Dev-only "Open debugger to view warnings" toast, worth tracing its `BridgelessReactContext` trigger (#3).
- Recenter button visually overlaps the zoom-out control when the route-preview card is open (#5).
- No loading indicator over the map during the first ~5s tile-load window on cold start (#7).

Total: **0 P0, 4 P1, 3 P2** (8 numbered issues; item #8 is informational only, not counted).

The 3 worst issues, in order: (1) the gate label clipping, because it is the single most visible, most-repeated defect on the map itself and has already resisted six fix attempts; (2) the outside-venue banner overlapping the filter chips, because it is a simple hardcoded-offset bug with an easy, well-understood fix and currently makes the Home screen's very first impression look broken; (3) the missing loading feedback on recenter/current-location, because it directly touches the "find my location" core task and a silent 30-second wait reads as a hung/broken button to a first-time user.
