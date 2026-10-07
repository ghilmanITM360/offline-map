# Testing and Acceptance

How to verify the app, what each check actually proves, and the acceptance evidence and checklists. Current totals (suite counts, pass counts, build state) live in [`PROJECT_STATUS.md`](PROJECT_STATUS.md), never here.

## Evidence discipline

No PASS claim without a real run on that build, that day, with evidence (screenshot or log) for any device/emulator claim. Label every claim with its level (definitions in `AGENTS.md`):

| Level | Proves | Does not prove |
|---|---|---|
| SOURCE/RUNTIME | Jest, typecheck, lint and the script suite pass against the source and JS logic | Real Android behavior, sensors, native modules |
| EMULATOR | Behavior observed in an emulator build | Real GPS, real network, physical hardware quirks, real TalkBack speech |
| PHYSICAL DEVICE REQUIRED | Not run yet; needs a real phone | n/a |
| FIELD REQUIRED | Not run yet; needs the actual venue / walking test | n/a |

Roughly half of the `scripts/test-*.ts` checks are `readFileSync` string/structure assertions against source (some read `docs/` and the Android manifest), not renders. They are regression guards, not substitutes for running the app.

## Commands

Required before handoff (from `AGENTS.md`):

```bash
npm run typecheck            # tsc for the app (typecheck:app) and for scripts/ (typecheck:scripts)
npm run lint                 # eslint .
npm test                     # the script suite: one long chain of `node --import tsx scripts/test-*.ts`
npm run test:components -- --runInBand   # Jest (jest-expo/android preset) over src/__tests__
git diff --check
```

Routing changes additionally run focused coverage for the affected providers/ViewModels plus:

```bash
npm run test:all-gates-v2
npm run test:outside-street-gate-selection-cost-v2
npm run test:core-provider-routing-contract-v2
npm run test:reroute-v2
```

Other entry points: `npm run data:check` (venue data, manifest drift; part of `npm test` via `test:venue-data-maintenance`), `npm run test:offline-basemap` (archive checksum/size/header/coverage, 5 MiB budget, no forbidden tile hosts), `npm run test:walking-proxy` (private proxy contract with injected provider fixtures; no paid call), `node --import tsx scripts/hardcoded-strings.ts` (remaining hard-coded English; also enforced by `HardcodedStrings.test.ts`). CI (`.github/workflows/canonical-checks.yml`) runs walking-proxy, typecheck, lint, `test:components`, `npm test` and `git diff --check`; it is SOURCE level only. Report exact commands, pass/fail counts, warnings, final HEAD and git status.

### What the suites prove

- **Jest component suites (`src/__tests__`)**: rendering and wiring of screens, sheets, controls and ViewModels with mocked native modules; store hydration and retention; the sheet contract (never swipes away, peek handle, removal on live navigation); copy guards (`UserFacingCopyGuard`, `HardcodedStrings`, `Localization`); journey state, location capability, Route Guide, recovery marker, Share message; offline-map contract and basemap installer.
- **Script suite (`npm test`)**: routing correctness over the bundled graphs (all gates, blocks, roads, points, outside street routing, gate selection by total cost, reroute, GPS-loss, progress), data validation, v1/v2 isolation and production defaults, accessibility/contrast and structural guards, Android config guards (backup policy, permissions, no Google key), offline basemap.
- **Typecheck/lint**: static correctness only.

None of these is device or field evidence. Total counts: `PROJECT_STATUS.md`.

## Build for acceptance

Any offline-behavior sign-off must come from a **release** build; a debug build fetches JavaScript from Metro and behaves differently. The feature flags default to the V2 runtime when unset, so no flag needs setting.

```bash
cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true                                    # all ABIs
cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true -PreactNativeArchitectures=arm64-v8a   # emulator on Apple silicon; warm build ~30 s, first ~5 min
```

`assembleRelease` refuses to run without a production keystore unless `-PallowInsecureReleaseSigning=true` (or `ALLOW_INSECURE_RELEASE_SIGNING=true`) is set; that flag signs with the public Android debug key, so such an APK is for testing only and never distributable (`RELEASE_SECURITY_PRIVACY.md`). Record the commit, build command, timestamp, size and SHA-256 of every APK you test (on #135, not in a commit: a checksum cannot be committed into the commit it is built from). Ignore old APK/build outputs. `scripts/test-android-offline-release.sh` installs a built release APK, disables Wi-Fi/data and launches it; `scripts/test-android-location-overlay.sh` dumps the current UI hierarchy with `uiautomator` and presses Back to dismiss a location overlay.

## Emulator procedure and lessons (EMULATOR level)

AVD used so far: `Pixel_7_Pro_API_36` (arm64, Android 16). Use a release build (above) and `pm clear` before fresh-install runs.

- **Screen sizes.** 411 dp wide: `wm size 1080x2400; wm density 420`. 320 dp wide: `wm size 1080x2400; wm density 540` (1440x3200 at density 720 also works but is heavier). Reset with `wm size reset; wm density reset`.
- **200% font:** `settings put system font_scale 2.0`.
- **3-button navigation:** `cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.threebutton` (a plain `enable` leaves both navigations on). The overlay changes the bottom inset the sheet must clear.
- **RTL:** `cmd locale set-app-locales com.aicrafted.karachiijtema --locales ar` exercises the platform RTL path; the app's own language follows the in-app picker (Urdu = right-to-left).
- **Reduced motion:** set the three global animation scales to 0 (React Native reads the transition scale).
- **Mock GPS the app accepts.** Use the platform *gps* test provider (add it once, never re-add it) and set an explicit accuracy and time (`cmd location providers set-test-provider-location gps ... --accuracy 5`; check the provider help on your image). `adb emu geo fix` alone reports no accuracy and Play Services fused rounds it to about 100 m, which keeps Start Navigation unavailable by design (needs <= 50 m and <= 30 s). Re-feed about once per second **with small jitter**: identical repeated fixes make the app declare GPS lost. A mock location is not field evidence.
- **Driving the UI.** `uiautomator dump` often fails on map screens ("could not get idle state") but works on the Directory and pickers; bounds exclude `hitSlop`. `adb input text` drops or doubles characters under host load: type with paced `input keyevent` calls. At high host load the emulator wedges (adb hangs, SystemUI ANR); kill it by PID and restart with default GPU settings.
- **TalkBack.** `adb input` touches bypass explore-by-touch and swipes fall through to the map, so real spoken phrases cannot be captured on the emulator; only the accessibility tree can be inspected. Set the route up with TalkBack off. Enabling it shows a notification-permission dialog.
- **Process death:** `am kill` (only a backgrounded app; closest to a low-memory kill) and `am force-stop` are different; report them separately. Never `pm clear` for this test.
- **Network assertion:** with airplane mode off and a fresh install, sample `/proc/net/{tcp,tcp6,udp,udp6}` for the app uid through a full flow; a positive control (shell uid to a remote address) must be detected by the same sampler.

## Offline map acceptance evidence (#140; EMULATOR and SOURCE; PHYSICAL DEVICE and FIELD not run)

Owner requirement (2026-10-05): the Ijtema experience works with **zero internet**: launch, Directory, Place details, map, blocks/gates/paths/special routes/facilities, destination focus, Route Preview, Start Navigation, progress, reroute, arrival and process-death recovery. Architecture: [ADR 0001](adr/0001-offline-visual-map-renderer.md); data and design: [`OFFLINE_MAP_AND_DATA.md`](OFFLINE_MAP_AND_DATA.md).

Environment: emulator `Pixel_7_Pro_API_36` (arm64, Android 16), **airplane mode ON**, release build (`assembleRelease -PallowInsecureReleaseSigning=true -PreactNativeArchitectures=arm64-v8a`, JS bundled, no Metro), `pm clear` before fresh-install runs. Built from canonical `a42f8f8`; the final all-ABI APK is built later from the final canonical and recorded on #135. GPS: platform test providers with an explicit 5 m accuracy.

| # | Check | Result (EMULATOR VERIFIED) |
|---|---|---|
| 1 | Fresh install, airplane mode, first launch (flow at the time was Splash -> Welcome -> Permission -> Directory; today Welcome -> Directory with location asked in context) | PASS, no map-download step |
| 2 | App start copies the bundled PMTiles archive to app-private storage when missing or failing its manifest SHA-256 | PASS (no network); hash verification added later by #306 (SOURCE/RUNTIME) |
| 3 | Directory -> Block 1 -> map opens on the block (no venue-overview flash), one pulse ring, label under the pin tip | PASS (screen recording, 20 fps extraction) |
| 4 | Place details -> Directions -> route preview from live GPS (15 min, 1.2 km), route drawn offline | PASS |
| 5 | Start Navigation, walk the route with mock GPS, walked/remaining styling, instruction card, ETA | PASS |
| 6 | Off-route (80 m) -> reroute: new instruction, new route, old route replaced | PASS (the new route reveals by length, so on a long reroute only about the first 100 m is on screen during the first ~75 ms) |
| 7 | Arrival: "You've Arrived!", Recenter / Done; Done returns to the Directory | PASS |
| 8 | Process death: Home, `am kill`, relaunch -> "Your last navigation didn't finish" card; Get new route -> Block 12 focused | PASS |
| 9 | Cold restart (force-stop) offline -> Directory with recents, no onboarding | PASS |
| 10 | Network assertion: airplane OFF (8.8.8.8 reachable), fresh install, same flow through navigation, `/proc/net/{tcp,tcp6,udp,udp6}` sampled 382x (~150 s) for the app uid | 0 remote sockets; positive control detected. Short-lived connections between samples could be missed |
| 11 | Built manifest | no `com.google.android.geo.API_KEY`; only `play-services-base` entries needed by fused location |

Performance (software rendering; **not** a device benchmark): cold start `am start -W` TotalTime n=10, baseline `9e9225b` (Google Maps SDK) median 1865 ms vs current median 1595 ms; PSS 93-127 MB at first screen, 190 MB on the map screen (native heap 79 MB, Java 27 MB); panning was 82% janky (median frame 93 ms) against a 74% control (plain Directory scroll, 73 ms), so the emulator renderer dominates and real jank is PHYSICAL DEVICE REQUIRED; map-screen CPU about 48% of one core in one `top` sample. APK size: baseline 87,972,032 bytes (4 ABIs); arm64-only dev build 44,945,502 bytes; the final all-ABI size is on #135.

MapLibre stability matrix (EMULATOR): Directory<->Map mount/unmount x10, background/resume x5, "destroy activities" mode x3, route/marker/user updates through a full navigation, reroute, arrival, process death -> relaunch: **0** `FATAL EXCEPTION` / ANR in logcat and the map re-rendered after every step.

Pairwise configurations (EMULATOR): width 411/320 dp, font 1x/2x, LTR/RTL, gesture/3-button navigation (five rows cover every pair) on Directory, Place details and Route preview. R1 411/1x/LTR/gesture PASS; R2 411/2x/RTL/3-button PASS (map and sheet mirrored, geography not mirrored); R3 320/1x/RTL/3-button PASS; R4 320/2x/LTR/3-button map PASS with finding F1; R5 320/2x/RTL/gesture PASS. Findings at the time (UI, not the renderer): F1 at 2x on 320 dp with 3-button navigation the Directions button was partly hidden at the default snap; F2 at 2x the route sheet wrapped "My current location" mid-word; F3 the "Offline" pill overlapped map labels at 2x. The sheet's pinned header/footer layout was reworked afterwards (#326-#328: content scrolls, only the primary action stays pinned at large text); R4 has not been re-run for this document.

Accessibility: SOURCE: accessibility/label/reduced-motion tests across HomeScreen, MapControls, LocationsDirectoryScreen and MapLabelOverlay pass; map features are layers, not TalkBack nodes (the Directory is the accessible chooser, #128). EMULATOR: every Directory control is >= 48 dp with a clear accessible name. Non-text contrast against the basemap land `#F4F1EA` (WCAG 1.4.11, >= 3:1): active route / user dot / selected-block border 3.99, destination pin 3.47, facility badge 3.82, start badge 4.44, special route 8.17. **Not run:** real TalkBack, large-font screen-reader traversal, outdoor-glare contrast (PHYSICAL DEVICE REQUIRED). iOS was not built.

## Device accessibility checklist (PHYSICAL DEVICE REQUIRED for TalkBack; an emulator is supporting evidence only)

Source and Jest prove wiring, not TalkBack behavior; all items are unverified at runtime. Run on Android with TalkBack, at a small screen (about 5 inch, 1080x1920) and the largest font scale, for V2 navigation (and V1 if reachable):

- **NAV-002 GPS warning announcements:** `GPS_LOST` uses `accessibilityLiveRegion="assertive"` while other status banners use `"polite"`. Confirm a flapping GPS state does not cut off a maneuver announcement and repeated identical warnings re-announce sensibly.
- **Arrival focus:** the arrival card sets `accessibilityViewIsModal` and fires `announceForAccessibility`; confirm TalkBack focus moves to the card.
- **Rapid navigation transitions:** arrive, then immediately start a new preview before tapping Done. Expected to self-heal within a frame; no automated test covers it.
- **Small screen / large font:** recenter vs Exit hit areas must not overlap on a short screen; the instruction card must not clip or collide with the mute button at maximum font scale.
- **One-shot announcements:** route-ready/route-error, location tooltip and arrival announcements each fire once per event.
- **One accessibility node per map object:** overlay labels take priority, marker labels are fallback only; no double reads.

## Physical-device acceptance checklist

A fill-in template for one real test cycle on a physical Android phone. It is a procedure, not a result: every row starts **NOT RUN**. Do not carry rows over from an earlier cycle or from an emulator run, and do not copy a PASS from source/Jest evidence. Run the device accessibility checklist above alongside section 11 and record its result in the same cycle.

### 0. Cycle record (fill first)

| Field | Value |
|---|---|
| Date / tester | |
| Build commit (`git rev-parse HEAD` of the build worktree) | |
| APK file and SHA-256 (`shasum -a 256`) | |
| Signing | debug key (testing) / other |
| Phone make, model, Android version, OEM skin | |
| Battery saver / OEM battery optimiser for the app | on / off (state which) |
| Location setting | High accuracy on, app permission "Precise" granted |
| Where tested | real outdoor GPS / indoors / mock-location app (state which; mock = **not** field evidence) |

Install with `adb install -r <apk>` after `adb uninstall com.aicrafted.karachiijtema` for a first-install pass. Capture `adb logcat -v time` to a file for the whole cycle and note any `FATAL EXCEPTION`.

### 1. Result key

`PASS` observed and matches expected; `FAIL` observed and does not match (attach evidence); `BLOCKED` could not be run (say why); `N/A` not reachable in this build (say how you checked); `NOT RUN`. Evidence for each row: a screenshot or screen recording, plus the log excerpt for anything involving GPS or lifecycle. A row with no evidence is `NOT RUN`.

### 2. First install and onboarding

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 2.1 | Fresh install, cold launch, no dev server | Splash, then Welcome | NOT RUN | |
| 2.2 | Continue on Welcome (it says location is optional) | Directory directly: no permission screen, no map-setup step; the offline map is already installed | NOT RUN | |
| 2.3 | Tap Block 1; if asked "Where are you starting from?" choose "Use my location" and allow "While using the app" (Precise) | Live navigation starts from the real fix; with a start chosen instead, a Route Guide opens. Map renders the bundled basemap, offline | NOT RUN | |
| 2.4 | Force-stop and relaunch | Lands on the Directory, not onboarding | NOT RUN | |

### 3. Real GPS acquisition and freshness (#46 tier)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 3.1 | Outdoors, open the Home map | Blue dot appears at your true position; accuracy circle plausible | NOT RUN | |
| 3.2 | Select a destination and open Directions with a live-GPS start | Until a fresh precise fix exists the primary action reads "Use my location & start" (never a dead button); with one it reads "Start Navigation" | NOT RUN | |
| 3.3 | Turn location off in quick settings, reopen the app | Clear, non-jargon message; no crash; live navigation does not start | NOT RUN | |
| 3.4 | Deny then re-grant precise location | Flow recovers without reinstall | NOT RUN | |
| 3.5 | Grant only approximate location | Live guidance is refused (primary reads "Turn on precise location"); a Route Guide from a chosen start still works | NOT RUN | |

### 4. Journey flow: Directory, Route Guide, sheet (#307)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 4.1 | With location off, tap a block in the Directory | "Where are you starting from?" in the Directory; picking a place opens a Route Guide with Step N of M, Previous/Next | NOT RUN | |
| 4.2 | In Directions / Route Ready / Route Guide, swipe the sheet down repeatedly | It folds to the peek and stays; it never disappears. Tapping the peek expands it; tapping when open folds it | NOT RUN | |
| 4.3 | Start live navigation | The Directions sheet and its footer are gone; live chrome shows; after Exit the sheet returns | NOT RUN | |
| 4.4 | Route Guide: tap "Use my location to guide me" outdoors | Real fix acquired, route recomputed from it, live navigation starts, guide closes | NOT RUN | |
| 4.5 | Start from a point outside the venue with no walking route (or beyond the street graph) | "Get to <gate> first", straight-line distance, "Start walking"; no walking-looking total; Retry and gate choice work | NOT RUN | |

### 5. V2 navigation (default runtime)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 5.1 | Outside the venue, route to a Block | Route Ready shows distance and time; text says where the route starts | NOT RUN | |
| 5.2 | Start Navigation | Instruction card, progress and ETA update as you walk | NOT RUN | |
| 5.3 | Walk a few metres off the route and keep going | "Rerouting..." appears, then clears with a new route; it does not stay stuck (#143) | NOT RUN | |
| 5.4 | Arrive | Arrival card shows; Done returns to the Directory; a new trip starts cleanly with no stale arrival (#111, #113) | NOT RUN | |
| 5.5 | Exit mid-trip via the exit control | Confirmation appears; Exit clears the route and restores the normal map | NOT RUN | |

### 6. V1 navigation (retained fallback)

Run only if this build can reach a V1 route (only with the V2 flags turned off). If you cannot, mark every row `N/A` and write how you checked. Do not invent a way to force it.

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 6.1 | Start navigation to a legacy destination | Navigation runs; instruction card and progress update | NOT RUN | |
| 6.2 | Walk off route | Reroute completes (does not hang; #169) | NOT RUN | |
| 6.3 | Exit, then start another trip | No leftover arrival state or reroute cooldown (#149) | NOT RUN | |

### 7. Manual gate retention and #124 scenarios

A physical phone will not be at the #124 coordinates. Inject a location with a mock-location app (Developer options, "Select mock location app") and record the result as **mock location on device**, which is not field evidence.

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 7.1 | Mock origin `24.964727, 66.999026`, destination Block 27, automatic gate | Road route from the offline street graph, not "Direct guide"; at time of writing source-level runs pick Gate 08 (see #124) | NOT RUN | |
| 7.2 | Same origin, choose Gate 21 manually | Road route through Gate 21; no "Direct guide" | NOT RUN | |
| 7.3 | Same origin, choose Gate 01 manually | Road route through Gate 01; no "Direct guide" | NOT RUN | |
| 7.4 | Press Retry road route several times on 7.2 and 7.3 | Never falls back to "Direct guide" while a road route exists | NOT RUN | |
| 7.5 | Start navigation on 7.2, then drift off route until it reroutes | The reroute keeps Gate 21; it does not silently switch gate (#160) | NOT RUN | |
| 7.6 | Start a new trip with the gate left on automatic | The previous manual gate is not carried over | NOT RUN | |

### 8. Navigation exit

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 8.1 | Exit at each stage: mid-walk and mid-reroute (Exit control), and at arrival (Done) | Exit asks "Exit navigation?" and returns to a clean Home with the normal map controls; Done at arrival resets to the Directory without that prompt | NOT RUN | |
| 8.2 | Android back button during navigation | The same "Exit navigation?" confirmation as the Exit control (they share one handler), not a silent quit | NOT RUN | |

### 9. GPS loss and recovery

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 9.1 | While navigating, go somewhere with no sky view (a covered area or indoors) for about 15 s. Airplane mode alone does not reliably cut GPS, so do not use it | A GPS-lost message appears within roughly 8 s; the position is not shown as live | NOT RUN | |
| 9.2 | Return to open sky | Message clears on the first fresh fix; progress resumes; no false arrival | NOT RUN | |
| 9.3 | Weak-accuracy fix (stand next to a building) | A weak-GPS notice; the route is held stable rather than jumping | NOT RUN | |

### 10. Background and foreground (NAV-004)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 10.1 | Navigating in V2: press Home, walk for 2 minutes, reopen | A fresh fix is requested at once; progress moves to your new position; no "arrived" or jump from a cached fix | NOT RUN | |
| 10.2 | Navigating in V2: lock the screen for 2 minutes, unlock | Same as 10.1 | NOT RUN | |
| 10.3 | Same as 10.1 in V1, if reachable | A stale-position notice appears until the first fresh fix, then clears (NAV-004, merged in PR #172; not yet device-verified) | NOT RUN | |
| 10.4 | Quick app switch (under 5 s) | No stale-position notice | NOT RUN | |

### 11. Process death (#139)

`am kill` and `am force-stop` are different and must be reported separately: `am kill` only ends a backgrounded app and is the closer stand-in for a low-memory kill; `am force-stop` ends it from any state, removes it from recents and puts it in the stopped state. Never use `pm clear` here; it wipes stored data and invalidates the test.

Implemented policy (#139 Option B, notify and rebuild): the next launch lands on the Directory with a "Your last navigation didn't finish" card for 2 h after navigation started; nothing resumes by itself, from a stale position or from a stale arrival. "Get new route" plans a fresh journey, "Dismiss" clears the marker. A Route Guide, a route preview or a finished journey leaves no card. Package: `com.aicrafted.karachiijtema`.

| # | Step | Observe | Result | Evidence |
|---|---|---|---|---|
| 11.1 | Navigate, press Home, run `adb shell am kill com.aicrafted.karachiijtema`, confirm with `adb shell pidof com.aicrafted.karachiijtema` (empty), reopen from **recents** | Landing screen; recovery card; Start not active | NOT RUN | |
| 11.2 | Repeat 11.1 but reopen from the **launcher icon** | Same observations | NOT RUN | |
| 11.3 | Navigate, run `adb shell am force-stop com.aicrafted.karachiijtema`, reopen from the launcher | Same observations (report separately from 11.1) | NOT RUN | |
| 11.4 | Navigate, swipe the app away from recents, reopen | Same observations | NOT RUN | |
| 11.5 | Repeat 11.1 with airplane mode on, then with location off | Nothing resumes; any message is neutral about the cause | NOT RUN | |

### 12. Accessibility, font scale, language, Share

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 12.1 | Run the device accessibility checklist above (TalkBack, focus on the arrival card, touch targets, maximum font scale on a small screen) for V2 and, if reachable, V1 | Record its rows in the same cycle | NOT RUN | |
| 12.2 | Settings -> Language: choose Urdu, then Roman Urdu, then English | Text switches at once; Urdu is right-to-left (map not mirrored); the choice survives relaunch | NOT RUN | |
| 12.3 | Place sheet -> Share | Sharesheet shows the pin line with the place name and one OpenStreetMap link, no raw coordinates; the link opens in a browser or map app | NOT RUN | |

### 13. Offline

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 13.1 | Airplane mode on, force-stop, relaunch | App opens to the Directory; recents and all blocks present | NOT RUN | |
| 13.2 | Offline, route to a Block | Route Ready from bundled data; no online-only error; basemap renders | NOT RUN | |
| 13.3 | Offline, start navigation and walk | Navigation works from bundled data | NOT RUN | |

### 14. Sign-off

Summarise counts of PASS / FAIL / BLOCKED / N/A. Any FAIL needs an issue (search for an existing one first). This cycle may be cited as **PHYSICAL DEVICE VERIFIED** only for rows marked PASS with evidence, on the build recorded in section 0. It says nothing about other builds, other phones or the venue (#46 needs an actual walk at the venue).

## Field acceptance

Physical walking acceptance at the actual venue (#46), gate connector surveys (#43, #44), the Mimbar survey (#116) and the remaining physical-device location-capability verification (LOC-06/08/09/10/11) cannot be completed from a development environment; they stay FIELD REQUIRED / PHYSICAL DEVICE REQUIRED until someone runs them. Product and owner-side limits: `KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`.
