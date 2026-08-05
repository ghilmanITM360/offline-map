# Production Runtime QA Plan

> **Architecture update:** This plan was authored against the earlier
> offline-only provider architecture. Preserve its historical QA state and
> device-evidence rules, but execute outside-route cases against current
> hybrid behavior: configured secure Google proxy first, bundled offline OSM
> fallback second, and a clearly labelled direct-direction guide last.
> Internal Ijtema routing remains offline. Offline test rows must disable or
> make the proxy unavailable and verify OSM/direct fallback honestly; they do
> not prove that every current outside-route attempt has no network path.

Read this before running any check in this plan: **nothing in this repository's automated test suite (`npm test`, `npm run typecheck`, `npm run lint`) constitutes runtime verification.** Those gates prove the TypeScript source is internally consistent and that specific computed values (routes, distances, graph adjacency) are correct. They do not prove the app renders, responds to touch, survives a real device's GPS/network/memory conditions, or that a human can actually complete a task in it. `CLAUDE.md` states this explicitly ("local TypeScript/lint/test-script gates passing does not mean Android visual QA has passed"), and `PROJECT_AUDIT.md` (§7, §9.2) goes further: roughly half of the `scripts/test-*-v2.ts` files that sound like UI tests (`test-home-buttons-v2`, `test-navigation-ui`, `test-battery-v2`) are `readFileSync` string-presence checks against source files — they never render a component or simulate a tap. A fully green `npm test` run is evidence about source code, not about the running app.

**Sign-off rule for this plan: no row below may be marked PASS without a real device/emulator run behind it, on that device, on that day — a release build for Android (Part 1), a real build for iOS (Part 2). "Looks correct in source" is not evidence. A screenshot, screen recording, or platform-appropriate log capture (`adb logcat` on Android, device console log on iOS) is the minimum acceptable evidence per row. No exceptions, including for rows that look trivial.**

This document does not itself claim any PASS on either platform. It was produced by static/source review only (no device was available to the author) and exists to be executed by a human tester with real hardware.

---

## 1. Current QA state (why this plan exists)

Confirmed by reading the existing docs and code, as of 2026-07-18 on branch `codex/ijtema-map-data-v2`:

- **`docs/FULL_UI_COMPONENT_AUDIT.md`** grades all 14 screens as `CONDITIONAL PASS` — every row's "Component status" is literally `PASS source-level`, and the doc's own header states Android visual/tap QA is "blocked because `adb` is unavailable and `ANDROID_HOME`/`ANDROID_SDK_ROOT` are unset." Its Final UI Audit Status: "CONDITIONAL PASS at source/test level. Full UI PASS is blocked until Android emulator/device testing verifies visibility, tap targets, keyboard behavior, offline graph-only rendering, and large-font/small-screen layouts."
- **`docs/V2_ANDROID_RUNTIME_QA_CHECKLIST.md`** ends with an explicit sign-off rule: "Mark Android runtime PASS only after all required manual checks pass on a real Android device or emulator. Until then, the branch status remains CONDITIONAL PASS."
- **`docs/V2_FULL_APP_EMULATOR_QA_TEST_CASES.md`** (94 lines, ~65 test IDs across A/B/C/D/E/F/G/H areas) opens with "Android runtime status starts as `NOT TESTED` until an emulator or device is available through `adb`," and every single row in its status column reads `NOT TESTED`. This is the most granular existing checklist and this plan does not duplicate its row-by-row content — see §7 below for how the two relate.
- **`docs/ANDROID_DEVICE_QA_CHECKLIST.md`** and **`docs/QA_REAL_USER_TEST_CASES.md`** are older (dated May 23, predating the June v2 docs) and are written against the **v1** feature set (they reference `C1`-`C4` legacy gate IDs and `src/constants/data.ts` directly) — useful as a general device-QA methodology reference, not as v2-specific evidence.
- **`android-runtime-artifacts/`** exists at the repo root, is git-ignored (`.gitignore` line `android-runtime-artifacts/`), and currently holds 130 PNG screenshots, 67 UI-hierarchy XML dumps, and 5 logcat/text captures, timestamped June 13–14. This is real evidence that manual on-device/emulator testing happened at least once (filenames reference gate 21 → block 28, gate 15, gate 18 disconnected-gate messaging, offline cold launch, recenter-after-pan, etc. — consistent with v2 flows). **However:** this evidence is (a) not committed to git, so it is not reproducible or auditable from the repo alone, (b) not linked from any of the QA checklists above, (c) not dated/attributed to a specific commit or device model, and (d) several filenames repeat with `-latest`/`-latest-2`/`-release-final` suffixes suggesting iterative debugging rather than a single clean sign-off pass. It should not be read as satisfying any checklist row without someone re-deriving *which* row each screenshot corresponds to and confirming it against the *current* HEAD. Since `android-runtime-artifacts/` is git-ignored, this evidence directory itself is not portable between machines — a fresh clone starts with none of it.
- **`PROJECT_AUDIT.md`** (§9.2, dated 2026-07-18, current HEAD) independently reaches the same conclusion and additionally flags that the *mechanism* behind "script tests ≠ Android QA" (readFileSync string-matching masquerading as UI tests) is not documented anywhere the existing QA docs would surface it.

**Net state: zero rows across all existing QA checklists are backed by evidence that is (a) current, (b) committed/reproducible, and (c) explicitly mapped to a checklist row on this branch.** This plan's job is to give a tester a single concrete runbook and an evidence discipline, not to re-litigate the ~65 rows already enumerated in `V2_FULL_APP_EMULATOR_QA_TEST_CASES.md`.

---

## 2. Scope and non-goals

**In scope:** v2 runtime behavior only (`EXPO_PUBLIC_USE_IJTEMA_V2_MAP/ROUTING/NAVIGATION=true`, the shipped default). This plan has two parts: **Part 1 (§4-§7) is the Android Release Checklist** — release APK only, per the existing checklists' rule, since debug builds depend on Metro and can redbox offline even when the underlying app logic is correct, which produces false negatives. **Part 2 (§8) is the iOS Verification Checklist** — a lighter-weight, explicitly lower-confidence pass, added because iOS has had materially less runtime verification than Android on this project (see §8 preamble for why).

**Out of scope:** v1 legacy fallback regression (already covered by `docs/ANDROID_DEVICE_QA_CHECKLIST.md` / `docs/QA_REAL_USER_TEST_CASES.md`).

**This plan does not replace `docs/V2_FULL_APP_EMULATOR_QA_TEST_CASES.md`.** That document is the exhaustive per-case reference (65 rows, each with an explicit expected result and priority) for Android. This plan is the *runbook*: the order to execute in, the evidence to capture, the environment setup, and the specific filter/routing/navigation flows called out by name in the current sprint. Treat this plan as "how to run a session," and the emulator test-case doc as "the full checklist to tick off during that session."

---

## 3. Evidence discipline (applies to every section below — Android §4-§7 and iOS §8 alike)

For every row you execute, on either platform:

1. Capture a screenshot (`adb shell screencap` or device screenshot on Android; the device screenshot or Xcode device-window capture on iOS) or short screen recording at the moment the expected result is (or isn't) visible.
2. Capture logs spanning the action if the row involves a crash risk, GPS event, offline transition, or reroute (i.e., anything async/non-deterministic) — `adb logcat` on Android, the Xcode/Console.app device log on iOS.
3. Record: device model + OS version, build type (`release` on Android; note the iOS build configuration used, since this plan does not mandate a specific one — see §8), git commit hash, timestamp, and the three `EXPO_PUBLIC_USE_IJTEMA_V2_*` flag values in effect.
4. Save evidence into a dated, platform-labeled subfolder, e.g. `android-runtime-artifacts/2026-07-18-pixel6-android14/` or `ios-runtime-artifacts/2026-07-18-iphone14-ios17/` (the iOS folder does not exist yet as of this writing — create it following the same dated-subfolder convention the first time an iOS session runs; see §1 for why generic, undated filenames caused problems in the existing `android-runtime-artifacts/`).
5. Write PASS / FAIL / BLOCKED next to the row with one line of what you saw. "PASS" with no evidence attached is not a valid entry — treat it the same as not having run the row at all. This applies equally to iOS rows; iOS having less prior verification is not a reason to accept a weaker evidence bar for it.
6. If a row fails, do not silently retry until it passes and report only the pass — log the failure, the fix (if any), and the retry as separate entries. This is how `android-runtime-artifacts/`'s `-latest`/`-latest-2` naming pattern happened; it makes it impossible to tell from the filenames alone whether the first attempt failed or the tester was just iterating on screenshot framing.

---

# Part 1 — Android Release Checklist

Two commits landed since the prior review pass that directly change what this checklist needs to re-verify — neither has been confirmed on-device yet:

- **`2fa3fec` "fix: improve home map filters and gate markers"** — reworked the Home filter chips so they actually switch map layers (blocks/rastas/gates/Pindal) instead of being cosmetic, redesigned gate markers into a zoom-aware compact system (bare number → `G01` → `Gate 01` as you zoom in, replacing a prior clipped-label bug), raised gate marker z-index above other overlays, and confirmed internal-only connector nodes stay hidden from the public map. Touches `HomeScreen.tsx` and `V2MapRenderingService.ts` directly. §5 (Section B) below is the re-verification surface for this commit — treat every row there as unverified until run against current `HEAD`, not just against the `-latest` screenshots in `android-runtime-artifacts/` (those predate this commit).
- **`2298b04` "fix: improve offline routing gate selection and route preview"** — changed `EntryGateRoutingService.ts`, `RoutingServiceV2.ts`, and `graphBuilder.ts` (gate selection cost/scoring for outside-venue routing, route preview behavior, plus new test coverage for "gate not over-selected," duplicate markers, and outside→block total-cost). §6 (Section C) below, especially C4/C6 (outside-venue → gate routing) and C8, is the re-verification surface for this commit.

Both commits added only `scripts/test-*-v2.ts` coverage — per §1 and `CLAUDE.md`, that is source-level verification, not proof the on-screen behavior is correct. Do not treat a green `npm test` for `test-gate-marker-rendering-v2`, `test-outside-to-all-blocks-v2`, etc. as satisfying any row below.

`android-runtime-artifacts/` (still 130 PNG / 67 XML / 5 txt = 202 files as of this writing, confirmed live) contains prior evidence that is suggestive but pre-dates both commits above and is not proof against current `HEAD`. Filenames worth a tester's attention as starting points (re-verify, don't reuse as-is):
- `offline-cold-launch-latest.png` / `offline-cold-launch-latest-2.png` / `offline-cold-launch-logcat-latest.txt` — prior offline cold-launch attempts (A6 below).
- `gate18-blocked-release.png` / `.xml` — prior capture of the disconnected-gate message for `GATE_18` (C3 below); no equivalent file was found for `GATE_03`, `GATE_17`, or `GATE_19` — those three still need a first capture.
- `gate15-blocked-release.png` / `.xml` — present but its exact meaning is unconfirmed (Gate 15 is not one of the documented disconnected gates); a tester should determine what flow this corresponds to before citing it as evidence for anything.
- `recenter-after-pan-release.png` / `navigation-recenter-after-pan-latest.png` — prior recenter capture (D4 below).

---

## 4. Section A — Installation

Setup, per `docs/V2_ANDROID_RUNTIME_QA_CHECKLIST.md` §A:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
adb devices                      # confirm a real device or emulator is attached
```

Confirm `.env` has real (non-placeholder) keys before building — `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` must not equal the `your_android_maps_key_here` placeholder from `.env.example`, and the three v2 flags must be unset or explicitly `true`:

```bash
EXPO_PUBLIC_USE_IJTEMA_V2_MAP=true
EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING=true
EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=true
```

Build and install:

```bash
npm run android:release:apk
npm run android:install:release
```

| # | Step | Expected | Evidence required | Result |
|---|---|---|---|---|
| A1 | Fresh install on a clean device/emulator (uninstall any prior build first) | Install succeeds, no signature/permission errors | `adb install` output | |
| A2 | Cold launch | Splash screen appears, then routes to Permission or Home depending on prior state; no crash | Screenshot + logcat | |
| A3 | Force-close and relaunch | App restores previous state (offline download status, settings) without re-running first-run flow unexpectedly | Screenshot | |
| A4 | Launch with Wi-Fi and mobile data both off | App opens; Home is usable; no Metro-style redbox (redbox on a *release* build is a real bug — redbox on a debug build is not, per the existing checklists' explicit carve-out) | Screenshot + logcat | |
| A5 | Launch with Google Maps key intentionally invalidated (temporary local `.env` edit + rebuild, revert after) | Graph-only fallback map renders; app does not blank-screen or crash | Screenshot | |
| A6 | **Offline cold launch**: enable Airplane Mode *before* installing/first-launching the app (not after, per A4) so the device has never had network access this install cycle, then install and launch | Full first-run flow — splash, permission prompts, initial Home render — completes with zero network access ever having occurred; no hang waiting on a network call, no crash. This is a stricter test than A4 (A4 only requires the app to already have cached state from a prior networked run) | Screenshot + logcat | |

---

## 5. Section B — Home screen filter tests

Re-verification surface for `2fa3fec` (see Part 1 preamble above) — every row in this section exercises code that commit touched directly. Do not treat any prior `android-runtime-artifacts/` filter/gate screenshot as still valid evidence; re-capture against current `HEAD`.

Chip IDs and labels, confirmed from `src/services/SearchService.ts:54-61`: `all` → "All", `blocks` → "Blocks", `rastas` → "Rastas", `gates` → "Gates", `special_routes` → "Pindal" (this is the Shahr-e-Pindal filter — the chip label in the running app reads "Pindal", not the full "Shahr-e-Pindal" string; confirm the on-screen label matches during B1 and flag a mismatch if it doesn't). `masjids`, `terminals`, and `help` chips also exist but are not in this plan's explicit scope — exercise them opportunistically if time allows.

For each filter below, verify against `V2MapRenderingService`'s zoom-dependent rendering (`PROJECT_AUDIT.md` §3 flags that block-label and gate-label zoom thresholds are defined independently and don't match — `LOW_ZOOM=13/MEDIUM_ZOOM=15/HIGH_ZOOM=16.5` for blocks/rastas vs. `16.5`/`14` hardcoded separately for gates in `HomeScreen.tsx`). This is a known, documented inconsistency, not a hypothesis — confirm what it actually looks like on device (do gate and block labels visibly pop in/out at different zoom levels in a jarring way, or is it imperceptible in practice).

| # | Step | Expected | Result |
|---|---|---|---|
| B1 | Open Home, inspect default chip state | "All" is selected by default; all layer types (blocks, rastas, gates, special routes) render simultaneously | |
| B2 | Tap "Blocks" filter | Only B1-B42 block polygons/labels render; rastas, gates, and Pindal routes are hidden or de-emphasized; zoom in/out and confirm label density switches are legible, not overlapping | |
| B3 | Tap "Rastas" filter | Only Rasta 01-11 lines/labels render | |
| B4 | Tap "Gates" filter | Only numbered official gates render. Confirm gates 06/09/10/11/12 (documented as nonexistent per `V2_ANDROID_RUNTIME_QA_CHECKLIST.md` §B and `V2_FULL_APP_EMULATOR_QA_TEST_CASES.md` B-005) do **not** appear as fake markers. Confirm `MAJOR_GATE_IDS` (`GATE_05, GATE_08, GATE_13, GATE_21, GATE_22` per `V2MapRenderingService.ts:94`) remain visible at low zoom while other gates only appear on zoom-in | |
| B5 | Tap "Pindal" (Shahr-e-Pindal) filter | Shahr-e-Pindal North, South, and West routes render with friendly labels, no raw internal IDs (e.g. `SPNP-01`) visible in normal mode | |
| B6 | Tap "All" again to reset | All layers return; chip row itself does not clip/overflow at any filter selection on a small-width device | |
| B7 | Zoom test across filters | Toggle each filter at low zoom (city-wide) and high zoom (street-level); confirm label switching between B2-B5 doesn't produce the jarring mismatch described above, or record exactly what it looks like if it does | |
| B8 | Gate marker zoom levels (new in `2fa3fec`) | Zoom out fully on "Gates" filter: markers show a bare number only, no clipped/truncated text (the prior "Gate te" clipping bug this commit fixed). Zoom to medium: markers show compact `G01`-style badges. Zoom to high/street level: markers show full `Gate 01`-style labels. Confirm no label is ever visibly clipped at any zoom step, and that gate markers render above other map overlays (roads/blocks) rather than being occluded | |

---

## 6. Section C — Routing tests

C4 and C6 (outside-venue → gate routing) and C8 (same-point error path, which shares gate-selection cost logic per the `2298b04` diff) are the primary re-verification surface for `2298b04` (see Part 1 preamble above) — its diff touched `EntryGateRoutingService.ts`, `RoutingServiceV2.ts`, and `graphBuilder.ts`, all of which sit directly on the outside→gate selection path.

Use `docs/V2_FULL_APP_EMULATOR_QA_TEST_CASES.md` section D for the full route matrix (17 pairs). This plan calls out the three flow *shapes* that matter most and must each get at least one clean run with evidence:

| # | Flow | Steps | Expected | Result |
|---|---|---|---|---|
| C1 | Gate → Block | Directions: Gate 21 → Block 28 | Route preview renders a routable v2 route with positive distance/ETA and friendly step text (no raw node IDs like `B28_C2`) | |
| C2 | Gate → Block (second gate, cross-check zoom/label findings from B7) | Directions: Gate 15 → any block reachable per `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md` | Route preview renders correctly | |
| C3 | Disconnected gate handling — test **all four**, not just one | Directions: attempt Gate 03 → any block; then separately Gate 17 → any block; then Gate 18 → any block; then Gate 19 → any block (all four documented disconnected in `CLAUDE.md` / `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`) | Each of the four shows exactly: "This gate needs connector verification before navigation." — does **not** silently start navigation. `android-runtime-artifacts/gate18-blocked-release.png`/`.xml` has a prior capture for Gate 18 only (pre-`2298b04`, needs re-verification); Gates 03, 17, 19 have no prior capture in that directory at all and need a first run | |
| C4 | Outside venue → Gate → Block | Set/simulate a start point outside the venue boundary (west side, per existing docs) → Block 28 | Route preview snaps the *start* to the nearest connected, routable official gate — not directly onto an internal rasta/block/graph node (this is the core rule in `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`) | |
| C5 | Current-location-based routing, GPS inside venue | Grant location permission, stand/simulate a location inside the venue, tap "Use My Current Location" as start, pick any block as destination | Route calculates from the live GPS fix, snapped directly to the internal graph (no forced gate detour since the user is already inside) | |
| C6 | Current-location-based routing, GPS outside venue | Same as C5 but with a location outside the venue | Same nearest-routable-gate behavior as C4, sourced from live GPS rather than a manually picked start | |
| C7 | Current-location-based routing, permission denied | Deny location permission, attempt "Use My Current Location" | Clear fallback to manual start selection; no crash, no silent no-op | |
| C8 | Same-point error | Set start and destination to the same place | Explicit same-point error, not a zero-length "route" | |

---

## 7. Section D — Navigation tests

| # | Step | Expected | Result |
|---|---|---|---|
| D1 | From a valid preview (e.g. C1's Gate 21 → Block 28), tap Start Navigation | V2 NavigationScreen opens; route line, start marker, red destination marker, and block context are all visible simultaneously | |
| D2 | Observe the current-location/GPS marker while stationary | A distinct "current position" marker renders and does not jump erratically under normal GPS jitter; ETA/remaining-distance stay stable rather than flickering (per `NavigationViewModelV2`'s documented jitter-stabilization behavior in `PROJECT_AUDIT.md` §5 — confirm it actually holds on device, this has not been runtime-verified) | |
| D3 | Walk (or simulate movement via mock-location) off the planned route far enough to cross the reroute threshold | Reroute triggers after the documented threshold/cooldown (30-80m dynamic band, 25s cooldown, 3-count consecutive-evidence gate per `RerouteService.ts` — exact values don't need to be read off the device, just confirm reroute isn't instant/jumpy and isn't stuck) and the previous route stays visible during recalculation rather than disappearing | |
| D4 | Pan the map away from the user's position mid-navigation, then tap Recenter | Camera snaps back to center on the current-location marker | |
| D5 | Weak GPS simulation (mock a low-accuracy fix, e.g. via a location-mocking dev tool or a real weak-signal environment) | A weak-GPS warning banner appears rather than the app silently trusting a bad fix | |
| D6 | Tap Exit mid-navigation | Navigation stops cleanly and returns to Home/Directions; no crash, no stuck screen | |
| D7 | Re-enter navigation, press Android hardware back | A confirmation dialog appears before exiting (not an abrupt unconfirmed exit) | |
| D8 | Full navigation session with Wi-Fi and mobile data off (release build only, per §4 A4) | Navigation starts, tracks GPS, reroutes if needed, and reaches arrival state using bundled OSM outside fallback plus offline internal routing. Google proxy failure must not block fallback. If both road-routing providers fail, UI must identify direct-direction guidance as not road navigation. | |
| D9 | Arrival | Reaching the destination within the documented arrival radius shows an arrival state/modal, not a route that silently keeps recalculating past the destination | |
| D10 | Developer Mode off (normal mode) throughout D1-D9 | No raw internal IDs (`R9-03`, `SPNP-01`, `B28_C2`, etc.) are ever visible in any navigation UI copy | |

---

# Part 2 — iOS Verification Checklist

## 8. Section E — iOS build, launch, and permissions

**Read this before running anything below: iOS has had materially less runtime verification than Android on this project.** Every existing QA document referenced in §1 (`FULL_UI_COMPONENT_AUDIT.md`, `V2_ANDROID_RUNTIME_QA_CHECKLIST.md`, `V2_FULL_APP_EMULATOR_QA_TEST_CASES.md`, `ANDROID_DEVICE_QA_CHECKLIST.md`, `QA_REAL_USER_TEST_CASES.md`) is Android-only by name and content; none of them, nor `android-runtime-artifacts/`, say anything about iOS. This section is a first baseline, not a claim that iOS is close to parity with the Android checklist above — it is deliberately shorter and does not attempt to replicate every Android row (filter/routing/navigation flows are the same v2 logic on both platforms, so a full iOS pass through Parts B-D above using the equivalent iOS gestures is the eventual goal, just not assumed complete by this section alone).

Confirmed by reading the repo directly (not assumed) as of 2026-07-18:

- **Maps key is not currently build-time correct.** `ios/KarachiIjtemaOfflineNav/Info.plist` (`GMSApiKey`) and `ios/KarachiIjtemaOfflineNav/AppDelegate.swift` (`GMSServices.provideAPIKey(...)`) both currently contain the **literal placeholder string** `your_ios_maps_key_here` — the same placeholder as `.env.example`'s `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`. Both files are `expo prebuild`-generated (marked `// @generated ... DO NOT MODIFY`) and both show as modified in the current git working tree, meaning this is the actual output of the most recent `expo prebuild` run on this branch/machine — not a stale checked-in artifact. **Presence of the `GMSApiKey` key in `Info.plist` is not sufficient evidence the key is configured correctly** — a tester must open the file (or grep it) and confirm the value is a real key, not the placeholder string, before treating any iOS map-rendering row below as meaningful. If the map fails to render on iOS, check this first before assuming an app-logic bug.
- **Location permission strings vs. actual usage have a mismatch worth confirming on-device.** `Info.plist` declares three location usage-description keys: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription`, and `NSLocationAlwaysAndWhenInUseUsageDescription` (the latter two are background/"Always" location strings). A repo-wide check of `src/services/*.ts` found no call to `requestBackgroundPermissionsAsync` or any background-location API anywhere in the codebase — `LocationAccessService.ts` only ever calls `Location.requestForegroundPermissionsAsync()` / `getForegroundPermissionsAsync()`. So the Always/background strings currently appear to be vestigial: the app should only ever trigger iOS's single When-In-Use prompt. E2 below exists to confirm this holds on-device (iOS's permission dialog behavior around Always-capable Info.plist entries has version-specific quirks worth seeing directly rather than assuming from the plist alone).

| # | Step | Expected | Evidence required | Result |
|---|---|---|---|---|
| E1 | Confirm `.env` has a real, non-placeholder `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`, then run `npx expo prebuild --clean` and re-check `ios/KarachiIjtemaOfflineNav/Info.plist` and `AppDelegate.swift` for the literal string `your_ios_maps_key_here` | Placeholder string is gone from both files; a real key value is present | `grep -r your_ios_maps_key_here ios/` output (should be empty) | |
| E2 | Build via `npm run ios`, cold launch on a real device (simulator does not exercise real GPS/network conditions and should not be treated as equivalent) | Build succeeds, app launches to splash then Home/Permission; the location permission prompt appears exactly once and reads as the When-In-Use description (`NSLocationWhenInUseUsageDescription`'s text), not an Always/background-style prompt, per the mismatch noted above | Screenshot + device console log | |
| E3 | Deny location permission at the E2 prompt, then attempt "Use My Current Location" | Same graceful fallback to manual start selection as Android C7 — no crash, no silent no-op | Screenshot | |
| E4 | Map renders with the real key from E1 | Google Maps tiles/base map render (not a blank view or graph-only fallback caused by a bad key) | Screenshot | |
| E5 | Core screens smoke test: Home (map + filter chips), Search, Directions preview (one gate→block pair, e.g. Gate 21 → Block 28 as in Android C1), Navigation start screen | Each screen renders and responds to basic taps; this is a smoke pass, not the full B/C/D depth run on Android — treat any crash or blank screen as a release blocker, but a clean pass here is not equivalent to "iOS navigation verified" | Screenshot per screen | |
| E6 | Cold launch offline (Airplane Mode before first launch, same shape as Android A6) | App reaches Home without hanging on a network call | Screenshot + device console log | |

Do not mark any row in this Part PASS on the strength of the Android results above — v2 map/routing/navigation logic is shared, but rendering, permission-prompt behavior, and Maps SDK integration are platform-specific and have not been exercised on iOS as part of this review.

---

## 9. Reporting

After a full pass through Part 1 (§4-§7) and/or Part 2 (§8):

1. Update this file's rows in place (Result column) rather than creating a parallel report — keep the evidence trail attached to the checklist it verifies.
2. Cross-reference which rows in `docs/V2_FULL_APP_EMULATOR_QA_TEST_CASES.md` this session also covers (Android only — that document has no iOS rows to cross-reference), and update that document's `NOT TESTED` status column for those specific rows only — do not blanket-mark unrelated rows PASS by inference.
3. Do not change `docs/FULL_UI_COMPONENT_AUDIT.md`'s per-screen verdicts from `CONDITIONAL PASS` to `PASS` until every screen in that table has at least one dated, evidenced row here or in the emulator test-case doc covering its core interactions.
4. If any row fails, treat it as a release blocker for that flow until fixed and re-verified — do not average a mix of pass/fail rows into an overall "mostly working" verdict for sign-off purposes. This applies independently to each platform: a fully green Android pass does not offset a failing or unrun iOS row, and vice versa.
