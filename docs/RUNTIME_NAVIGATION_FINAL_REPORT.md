# Runtime Navigation Final Report — Outside Street-Graph Routing

Focused Phase 2 QA pass for the `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` feature (OSM-based outside-venue routing, A* + gate fan-out, turn-by-turn instructions). This report covers only what's new since `docs/RUNTIME_QA_FINAL_REPORT.md` (2026-07-18), which already validated environment setup, data/gates/blocks/rastas rendering, security, and baseline (pre-street-graph) outside→gate→block routing — that pass used the old beeline-only outside leg and is not repeated here.

## Runtime Environment

| | |
|---|---|
| Device | Pixel_10_Pro (AVD) — `sdk_gphone16k_arm64` |
| Android | API 37, ~3.97GB RAM |
| Build | Debug dev client (`npx expo run:android`, reused existing install), Metro started fresh with `-c` |
| Package | `com.aicrafted.karachiijtema` |
| Commit | `2298b04` (branch `codex/ijtema-map-data-v2`) |
| Date | 2026-07-19 |
| Flag | `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH=true` added to `.env`, confirmed picked up by Metro (`env: export ... EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH`) |
| Emulator | Pre-existing running instance (`emulator-5554`), reused |

## Test Results

| Test | Result | Evidence |
|---|---|---|
| Emulator setup | PASS | `adb devices` → `emulator-5554 device`; existing AVD, no cold boot needed |
| Feature flag wired | PASS | `.env` flag set, Metro env export confirmed, `RoutingServiceV2` picked a street-graph route (see below) vs. the flag-off beeline behavior documented on 2026-07-18 |
| APK install/launch | PASS | App already installed (`versionName=1.0.0`), relaunched cleanly multiple times, JS bundle loads (`Bundled 12917ms ... 3471 modules`), `HomeScreen` renders (`mapReady:true`) |
| Outside routing, near-gate (~700-900m) | PASS | Mock GPS ~700m from Gate 05 → Directions to Block 25: "Route ready, Enter through Gate 02, ETA 10 min, Distance 779m". Map preview shows a multi-turn **orange dashed** outside leg (not a straight line) joining a **blue solid** internal leg to the destination. `android-runtime-artifacts/2026-07-19/outside-near-gate/route-ready.png` |
| Live navigation + turn-by-turn | PASS | Started navigation on the above route: turn banner "Walk 56m toward Gate 02. Then: Turn left, then continue 23m," then updated to "Continue 29m on New Karachi ↔ Orangi Link Road. Then: Turn right, then continue 10m" — **real OSM road name**, both English and Urdu. START marker, destination pin, and the orange/blue two-color split all render correctly, matching the documented outside/inside polyline-split UX. `android-runtime-artifacts/2026-07-19/outside-near-gate/navigation-screen.png`, `instructions-screen.png` |
| Outside routing, far (~2.3km) | PASS | Mock GPS ~2.3km out → Directions to Block 25 via "current location": "Route ready, Enter through Gate 01, ETA 24 min, Distance 1969m." Distance exceeds straight-line separation (~1882m) by a margin consistent with real road detour, not a coincidental beeline match — confirms street-graph (not fallback) was used. `android-runtime-artifacts/2026-07-19/outside-far/route-ready.png`, `exit-nav-roadname.png` |
| Offline mode | PASS | `svc wifi disable` + `svc data disable` + airplane mode; `ping 8.8.8.8` → unreachable, confirmed fully offline. The already-computed street-graph route (orange+blue polyline) stayed rendered and intact; app showed an honest "Offline" badge and "Background map not downloaded. Ijtema routes still work." banner with a download CTA — no crash, no silent failure, correct fail-safe messaging. `android-runtime-artifacts/2026-07-19/offline/offline-route-persisted.png` |
| Inside-venue routing (only-internal-graph check) | BLOCKED | Could not reliably move the emulator's mocked GPS to a fresh coordinate mid-session — `adb emu geo fix` returned `OK` but `dumpsys location`'s cached `last location=Location[gps ...]` stopped advancing after ~3:45pm despite repeated fixes (identical `et=` timestamp across 5+ minutes and 3 app relaunches). This is the same emulator GPS-mocking limitation already documented in `docs/RUNTIME_QA_FINAL_REPORT.md` §"GPS mocking unreliable in this AVD," not a new or app-side defect. **Covered instead by the automated regression script** `scripts/test-outside-street-graph-integration-v2.ts`, which asserts `inside_coordinate` starts are never marked as having an outside leg (`outsideLegCoordinateCount === 0`) — passing as of the prior implementation session |
| Beyond-radius fallback (>3km) | BLOCKED | Same GPS-mocking limitation as above prevented a fresh live mock beyond the bundled OSM radius. **Covered instead by the automated regression script**, which asserts a point far beyond the bundled radius correctly falls back to a plain beeline (`outsideLegCoordinateCount === 1`) with the flag still on — passing as of the prior implementation session |
| GPS tracking (moving marker, camera follow, heading) | NOT RUN | Requires live/simulated GPS movement during active navigation; blocked by the same mocking limitation. Not attempted this session (also not run in the 2026-07-18 pass, for the same reason) |

## GIS notes

Bundled street graph (`src/data/ijtema/streetGraph.ts`): 7,945 topology nodes / 11,978 edges, generated from real Overpass OSM data per `docs/OSM_DATA_VALIDATION_REPORT.md`. Gate snapping and route continuity were exercised live above (Gate 02 and Gate 01 both correctly selected and connected end-to-end); no orphan-node or disconnected-edge symptom observed in either live route.

## Rules compliance

- No PASS claimed without on-device evidence (screenshot + observed app text) for every row marked PASS above.
- Both BLOCKED rows are reported as BLOCKED, not PASS — root cause is the emulator's location-mocking behavior (a known, previously-documented environment limitation), and the underlying logic they'd exercise is separately verified by an automated script, which is called out explicitly rather than conflated with runtime proof.
- No architecture, UI polish, or navigation redesign changes were made during this pass — verification only.

## Artifacts

```
android-runtime-artifacts/2026-07-19/
  environment/home-launch.png
  outside-near-gate/route-ready.png, navigation-screen.png
  outside-far/route-ready.png, exit-nav-roadname.png
  offline/offline-route-persisted.png
  instructions/turn-by-turn.png
```

## Recommendation

Outside-street-graph routing, turn-by-turn instructions with real road names, the orange/blue polyline split, and offline persistence of a computed street-graph route are all confirmed working on a real Android runtime. Before calling this production-ready, still needed: a reliable way to simulate GPS movement in this environment (Android Studio Extended Controls route playback, or a physical device) to cover in-motion rerouting, arrival detection, and the two BLOCKED cases above with genuine runtime evidence rather than script coverage alone.
