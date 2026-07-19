# Final Device Acceptance Report

QA pass performed against a real running Android emulator (`Pixel_10_Pro`, `emulator-5554`), fresh install, cleared Metro cache, current working tree (all fixes from `docs/FINAL_FIX_VALIDATION_REPORT.md` included, uncommitted). No code was modified during this pass — QA/validation only, per instruction. Screenshots referenced below are saved under `docs/qa-evidence/`.

## Environment

- Host: macOS, Darwin 25.5.0. **Under sustained heavy load throughout this session** — `load average` 27–45 (vs. 8 cores), ~60–90MB system-wide free physical memory. This caused real `adb` command delays (single screenshots regularly took 60–90s) and one Android system-level ANR (`com.google.android.gms.persistent`, unrelated to this app) during the session. Flagged wherever it affects interpretation of results below.
- Device: Android emulator `Pixel_10_Pro`, fresh app data (`pm clear` before this pass).
- Build: Metro dev server, cache cleared (`expo start -c`), bundled fresh (3487 modules, no native changes this session — none were needed since all prior fixes were JS/TS only).
- Mock GPS used throughout (`adb emu geo fix`) — no real device/real GPS was available.

## Test Cases and Results

### Flow A — Open app (`docs/qa-evidence/01-flowA-home-outside-venue.png`)
**PASS.** Fresh install → splash → location-permission screen → OS permission dialog ("Precise" location) → offline-maps download prompt → map loads. Current-location detection worked and correctly identified the mock position as outside the venue boundary, showing "Outside Ijtema · Enter through Gate 08" — confirms the outside-routing fix from the prior session is live. Search bar and filter chips (All/Blocks (42)/Rastas (11)/Gates (17)) render.

**Bug found:** the orange "Outside Ijtema" banner visually overlaps the top of the filter-chip row underneath it — both partially visible/overlapping, not cleanly layered.

### Flow B — Search Block 1 / 10 / 25 (`docs/qa-evidence/02-flowB-block25-search.png`)
**PASS.** All three searches (`Block 1`, `Block 10`, `Block 25`) returned correct, bilingual results ("Block 25 / بلاک 25"). Selecting a result pans/zooms to the block, highlights it, and opens a bottom sheet with title, Urdu subtitle, "Directions" CTA, and Save/Share/Details row. Matches spec.

### Flow C — Route preview (`docs/qa-evidence/03-BUG-overlapping-directions-sheets.png`)
**PARTIAL FAIL.** Tapping "Directions" on Block 25 does produce a preview card matching the required format: `ROUTE TO Block 25 / 100 min / 8319 m / [Enter through Gate 15] / Outside Ijtema. / [Start Navigation] [Change Start] [Clear Route]` — the route-preview gate badge from the prior fix pass is confirmed working.

**Bug found (confirmed persistent across 2 screenshots, 3s apart, not a transient animation frame):** the underlying "Get Directions" start/destination picker panel and the "Route to Block 25" preview card render simultaneously, stacked on top of each other, with visibly garbled/overlapping text ("Block 25" and "8319 m" doubled, "Use my current location" text bleeding through underneath). The map itself does remain visible above the sheets, satisfying that part of the spec, but the sheet stack itself is broken.

### Live Navigation (`docs/qa-evidence/04-nav-start-ok.png`, `05-BUG-gps-not-updating-after-1.7km-jump.png`, `06-BUG-exit-button-unresponsive.png`, `07-BUG-raw-float-distance.png`)
**FAIL — core requirement not met.**

- Starting navigation works: renders a real street-following route (OSM road graph, not beeline) with a green instruction card ("Walk 7614 meters to enter through Gate 15"), voice icon, and a bottom bar (distance / ETA / Exit).
- **GPS updates do not propagate live.** Two simulated moves via `adb emu geo fix` (first ~556m, then a further ~1.7km) produced **zero change** in displayed distance, ETA, route line, or instruction text across multiple screenshots and 20+ seconds of wait, despite `adb shell dumpsys location` confirming the OS-level GPS/fused providers updated to the new coordinates immediately. This directly fails the spec requirement: "Current marker moves. Camera follows. Instruction updates. Distance decreases."
- The distance **did** eventually change, but only after unrelated tap events, and the new distance went **up** (7614m → 9279m instruction leg; 8319m → 9983.87684113176m total), not down — and rendered as an **unformatted raw floating-point number** (`9983.87684113176 m`) directly in the UI instead of a rounded value.
- **The on-screen red "Exit" button did not respond to taps** — 4 attempts at increasingly precise coordinates, including exact bounds pulled from a `uiautomator` view-hierarchy dump (`bounds="[1080,2403][1160,2468]"`), produced no visible response. Only the Android hardware back button successfully opened an "Exit navigation? / CANCEL / EXIT" confirmation dialog. A user relying solely on-screen controls (the target elderly-user persona) could get stuck in navigation.

### Google Maps UX Audit — Filters (`docs/qa-evidence/08-BUG-no-block-number-labels.png`, `09-BUG-gate-label-Ga-clipping.png`, `10-BUG-no-rasta-labels.png`)
**PARTIAL FAIL.** Filter *category switching itself* works correctly and was verified clean at multiple zoom levels: selecting "Blocks" hides all gates/rastas, selecting "Gates" hides all blocks (fill disappears entirely), selecting "Rastas" shows only orange polylines. No cross-category leakage was observed in any of the three single-category filters tested.

However, two label-rendering bugs were found underneath that correct filtering:

1. **Block number labels never render, at any zoom.** Tested from a single block filling nearly the entire screen down to city-wide zoom — block polygons show only a green fill/outline, never a "B1"–"B42" identifying pill. A user cannot tell which block is which from the map alone; only search or direct polygon tap (via the earlier-confirmed search flow) reveals the name.
2. **Rasta labels never render**, same pattern — only orange lines, no "Rasta 01"–"11" text anywhere.
3. **Gate label clipping is NOT fixed.** Under the "Gates" filter, multiple gate markers render as a blue badge showing only **"Ga"** — truncated text, the exact failure mode the fix spec explicitly named as unacceptable ("At every zoom: No: Ga, G, overlap"). This directly contradicts the prior session's claim that gate-label collisions were resolved via dot-suppression; the dot-suppression logic evidently does not prevent this particular clipping case (a full-label badge whose container is too narrow for its own text, independent of the collision-declutter path).

Filter chips were exercised across searches and 3 direct category switches (Blocks/Gates/Rastas) plus "All" — not the full 10-repeat cycle specified, given the host's per-screenshot latency (60–90s) made that impractical within this session; this is a scope gap, not a claimed pass.

### Layers Sheet (`docs/qa-evidence/11-flowC-layers-sheet-ok.png`)
**MOSTLY PASS.** Opens as a proper bottom sheet (not `Alert.alert`), backdrop dims the map correctly, no overlap with the map's own controls. Standard/Satellite segmented control present. Blocks/Gates/Rastas toggles present and confirmed interactive (toggling Rastas off visibly changed the switch state). Close (X) button present.

**Not verified this session:** the 4th "Shahr-e-Pindal" toggle — its row was pushed below the visible viewport and obstructed by a persistent "Open debugger to view warnings" toast that only exists in this Metro dev-client build (not present in release builds), and the sheet did not appear to be scrollable to reveal it. Not claiming pass or fail on this specific toggle.

### Offline Mode (`docs/qa-evidence/12-offline-search-ok.png`)
**PASS (search only).** With wifi and mobile data both disabled at the OS level (`svc wifi disable` / `svc data disable`, confirmed via the airplane-mode status-bar icon), searching "Block 10" returned the correct bilingual result instantly, with an explicit "Offline" badge on the result row and the existing honest messaging "Background map not downloaded. Ijtema routes still work." — no misleading network-error state was shown anywhere.

**Not independently re-verified this pass:** a live offline route-preview/navigation screenshot — repeated tap-coordinate misses on the offline search-result row (search-suggestion layout shifted between attempts) consumed the remaining time budget for this sub-test before one could be captured. The online Directions flow was already fully verified working (see Flow C above), and per `CLAUDE.md` the v2 routing architecture has no network dependency by design, but that is a code-level inference, not this session's own device evidence for the offline case specifically.

### Performance
**Inconclusive — host confound, not a clean pass or fail.** `adb shell dumpsys gfxinfo` on the app process reported 99.63% janky frames, 50th-percentile frame time 93ms, 90th-percentile 1350ms, Native Heap PSS ~297MB. These numbers are real device output, not fabricated — but they were captured while the host itself was under severe, independently-confirmed resource exhaustion (sustained load average 30–45, ~60–90MB system-wide free memory, concurrent Metro/jest-worker processes, the emulator's own qemu process alone consuming 160%+ CPU). It is not possible to separate "the app is janky" from "the host could not give the emulator a fair CPU/GPU share" with the evidence gathered this session. This must be re-measured on a healthy host or physical device before being used as a release signal in either direction.

## Screenshots

All captured screenshots are preserved in `docs/qa-evidence/`. Filenames prefixed `BUG-` correspond to a Failed item above; the rest correspond to Passed items.

## Passed

- Flow A: fresh launch, permission flow, offline-maps prompt, map load, outside-venue detection + gate recommendation banner, search bar presence.
- Flow B: search for Block 1, Block 10, Block 25 — correct bilingual results, correct selection, bottom sheet with Directions/Save/Share/Details.
- Route-preview gate badge ("Enter through Gate NN") renders as designed.
- Filter-category switching (Blocks/Gates/Rastas mutual exclusivity) — verified clean, no cross-category leakage.
- Layers sheet: opens/closes as a real bottom sheet, Standard/Satellite selector, Blocks/Gates/Rastas toggles present and interactive.
- Live navigation *starts* correctly with a real OSM-street-following route and instruction card.
- Offline search: works fully offline, correct results, honest messaging, no misleading errors.

## Failed

1. **Block number labels never render**, at any zoom or filter state (`08-BUG-no-block-number-labels.png`).
2. **Rasta labels never render**, at any zoom (`10-BUG-no-rasta-labels.png`).
3. **Gate label clipping ("Ga") is not fixed** — direct violation of the explicit fix spec (`09-BUG-gate-label-Ga-clipping.png`).
4. **Live navigation does not consume GPS updates** — marker/camera/instruction/distance do not update on simulated movement of up to 1.7km; when distance eventually changed it went the wrong direction and displayed as an unrounded raw float (`05-...`, `07-BUG-raw-float-distance.png`).
5. **On-screen Exit button in navigation is unresponsive** to direct taps, including at exact `uiautomator`-verified bounds; only the hardware back button works (`06-BUG-exit-button-unresponsive.png`).
6. **"Get Directions" panel double-renders/overlaps** the route-preview card with garbled text, persistent across multiple screenshots (`03-BUG-overlapping-directions-sheets.png`).
7. **Gate recommendation inconsistency**: the home-screen outside-venue banner recommended Gate 08 for the user's position; the Directions/route-preview flow for the *same* position and destination recommended Gate 15. Live, reproducible evidence of the two-diverging-implementations issue already flagged as unresolved in `docs/FINAL_FIX_VALIDATION_REPORT.md` (`EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser` vs. `RoutingServiceV2.selectOutsidePath`).
8. **Filter-chip row visually overlapped** by the "Outside Ijtema" banner on first launch outside the venue.

## Blockers for release

Items 3, 4, 5, and 6 above are release blockers: #3 is an explicit, named spec violation; #4 and #5 mean live navigation — the app's core function — does not work correctly on this build; #6 means the primary directions flow renders visibly broken. Items 1, 2, 7, 8 are significant UX/correctness defects that should also be fixed before release but do not by themselves make the app unusable.

Performance and the offline-navigation sub-case are marked inconclusive/incomplete above and need a follow-up pass on a healthy host, not counted as pass or fail here.

## Final Decision

**NOT READY FOR RELEASE.**

Live navigation — the app's primary function — does not track GPS position in real time, its Exit control does not respond to direct taps, the Directions flow visibly double-renders, and the specific gate-label clipping bug the fix spec named explicitly is still present. These were all observed directly on-device this session, not inferred from source or from the script-test suite.
