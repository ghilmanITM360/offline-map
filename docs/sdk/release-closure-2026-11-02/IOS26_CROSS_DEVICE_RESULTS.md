# iOS 26.3 cross-device acceptance — 3 November 2026

Evidence is for iOS 26.3 on the device below only. It is **not** transferred to the unavailable iPhone 13 mini / iOS 18.x environment, whose 12 historical PASS rows and BLOCKED rows are unchanged.

## Environment
- Simulator: task-owned "OfflineMap-SDK-iOS26", UDID BD24E31D-30F4-43C6-8986-784AAD3A5FB6, iPhone 17, iOS 26.3 (23D8133), screen 402x874 pt, measured safe area top 62 pt. Created with the already-installed runtime. The booted iPhone 12 Pro Max was not touched.
- App: accepted Release SDKConsumer.app installed unmodified (arm64, minos 15.1). Executable SHA-256 `29962a589b6f0249417f5bf290aaf12efef06c729a81b65184f0c80429a8b32d`, main.jsbundle `ad88c6c7349e2d95eeecdb50f237beb7dd27f8d71cb3b84fc5315735fa6acf6c` (rehashed, equal to FINAL_ARTIFACT_IDENTITIES.json).
- Harness: `native-tests/ios26-cross-device/CrossDeviceJourney.swift` (SHA-256 `8a2c0d9e2ad3f50d897f7f726bdf6e4bc4a2916032d9ab55d4885d8f2e2d73e4`), a separate harness. It reads window size and safe area at run time and asserts frames against them (inside screen, below top inset, >=44 pt touch size, no overlap between primary controls, real coordinate taps, scroll reachability). The original geometry-specific `ArrivalTouch.swift` is unchanged.
- Location: recorded real venue-graph coordinates (Gate 01, R6, R602, R603, Gate 02) through `simctl location set` at 1 Hz. Location permission was granted with `simctl privacy` before the run.

## Results (4 PASS / 0 FAIL)
| Test | Covers journey steps | Result |
|---|---|---|
| test01FullJourney | cold launch, offline map renders, directory search, destination, manual origin, preview 111 m walk, Guide Next/Previous, explicit Live start, movement, reroute ("Route updated from where you are."), no arrival before destination, arrival at Gate 02, Recenter and Done by coordinate touch, second journey with no stale state | PASS |
| test02BackgroundForeground | Guide step and Live session survive Home and foreground | PASS |
| test03AppearanceLightDark | system and in-app light/dark/system | PASS |
| test04UrduRtlLargeText | Urdu RTL (mirrored Previous/Next) at extra-large and AX5 text, layout invariants | PASS |

Eight test attempts were needed to get these four green; the first runs failed on harness issues, not product defects: permission not pre-granted on the fresh simulator, a reroute step sequence that skipped the intermediate fix, and one assertion that expected preview text after Guide navigation. No product source changed.

## Network isolation (actual level)
simctl has no network control. A host `lsof -i` sample every 5 s plus at journey markers (186 samples) found **zero** sockets owned by SDKConsumer during the journeys. This shows no network use by the app during the run. It is **not** airplane mode, not a cold start without network, and not whole-device isolation.

## Not covered here
Native fault injection (stale/weak accuracy, CoreLocation errors) stays BLOCKED, as before. Physical-device GPS, human accessibility, and external gates stay pending. Evidence (xcresults, logs, net samples) is under the local .codex evidence directory `/Users/ghilmanislam360/.codex/visualizations/2026/11/03/ios26-cross-device-01`.

## Updated iOS counts
Historical iPhone 13 mini matrix unchanged: 13 PASS / 0 FAIL / 6 BLOCKED / 1 NOT RUN. New, separate iOS 26.3 (iPhone 17): 4 PASS / 0 FAIL.
