# iOS continuous location: investigation (2026-10-27, #392)

**Verdict: the "one callback, then silence" symptom is explained, reproduced and fixed at the adapter on the iOS simulator. Continuous Live GPS on a physical iPhone is still NOT proven and must not be claimed.**

## Question
`watchPositionAsync` delivered one callback on the iPhone 17 Pro simulator (iOS 26.2), then nothing, across repeated simulated routes. Where do updates stop: the simulator, Core Location, expo-location's native stream, the JS subscription, or the SDK adapter?

## Method (bounded, one experiment, scratch build only)
A scratch copy of the consumer was built with `NSLog` instrumentation added to the installed `expo-location` 19.0.8 (`LocationsStreamer.swift`, `LocationModule.swift`: `startUpdatingLocation`, every `didUpdateLocations`, `didFailWithError`, pause/resume, `sendEvent`, stream end, `stopStreaming`) and `console.log` at the JS watch call, every JS callback, every SDK ingest and the error handler. Native and JS lines were read together from `xcrun simctl spawn <udid> log stream`. Fixes were driven by `xcrun simctl location` (`set`, then `start --speed=3 --interval=1 <waypoints>`). The instrumentation is not in the repository (`patch-native.py` is kept with the evidence).

## Findings
1. The watch is created, Core Location starts, and the first fix travels native → module event → JS callback → SDK ingest (1/1/1/1).
2. When the simulator's location changes (`simctl location set`, or the start of a route), Core Location raises `kCLErrorDomain` code 0 (`kCLErrorLocationUnknown`, "no fix right now, keep waiting") to the delegate.
3. expo-location's `LocationsStreamer.didFailWithError` finishes its stream **permanently** with that error and drops its continuation. Core Location keeps delivering: three later fixes reached the delegate with `continuation=nil` and were discarded. JS received the error callback, but the consumer adapter had passed no error handler, so the failure was silent.
4. So updates stop **inside expo-location's native stream, caused by treating a transient Core Location error as fatal**, not at the simulator, not in Core Location, not at the JS subscription (it was never given a chance) and not in the SDK adapter.
5. `kCLErrorLocationUnknown` is documented as transient and happens on real devices too (tunnels, buildings, signal gaps), so this is a real-device risk, not only a simulator artifact. It was not observed on a device.

## Fix (consumer reference adapter, `examples/expo-consumer/expoLocation.ts`)
The adapter registers an error handler; on error (or a rejected subscription) it removes the dead subscription (which calls `removeWatchAsync` and stops the native manager) and starts a new watch after 1 s, 2 s, ... capped at 5 s, resetting after a delivered fix, until the SDK stops watching. No fix is invented; the SDK's GPS-loss handling covers the gap, and no freshness or accuracy rule was loosened. Jest: 4 new tests (restart, backoff and reset, stop cancels, rejection).

## Result with the fix (simulator, device location source, Karachi pack, Gate 01 to Gate 02)
Two errors occurred (the manual `set`, then the route start); each was followed by a restart one second later. After the second restart a 22 s simulated walk produced 25 native fixes, 25 JS callbacks and 25 SDK ingests, ending in the arrival screen, driven by real expo-location callbacks rather than the simulated adapter. Evidence: `c5-native/ios-location/` (run 1 unfixed, run 2 fixed, arrival screenshot).

## Still open
- A physical iPhone, real walking, GPS loss and recovery, background/foreground and Low Power Mode are untested.
- The fix works around expo-location; the defect should be reported upstream (a transient `kCLErrorLocationUnknown` must not end `watchPositionAsync`). Not reported (no external publishing without approval).
- Earlier simulated-route failures cannot be re-attributed with certainty, but this mechanism matches them.
