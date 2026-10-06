# Offline map — acceptance evidence (#140)

Owner requirement (2026-10-05): the Ijtema experience works with **zero internet** — launch, Directory, Place Details, map, blocks/gates/paths/special routes/facilities, destination focus, Route Preview, Start Navigation, progress, reroute, arrival and process-death recovery. Internet is optional. Architecture: [ADR 0001](adr/0001-offline-visual-map-renderer.md); data and design: [OFFLINE_BASEMAP.md](OFFLINE_BASEMAP.md).

Evidence levels follow `AGENTS.md`. **Everything below is SOURCE or EMULATOR level.** PHYSICAL DEVICE and FIELD were not run (#135 is still blocked on a connected phone).

## Environment

- Emulator `Pixel_7_Pro_API_36` (arm64, Android 16), **airplane mode ON**, release build (`assembleRelease -PallowInsecureReleaseSigning=true -PreactNativeArchitectures=arm64-v8a`, JS bundled, no Metro), `pm clear` before the fresh-install runs.
- Built from canonical `a42f8f8` (all of PR A–J merged). The final all-ABI APK is built later from the final canonical and recorded on #135, not here.
- Emulator GPS: platform test providers with an explicit 5 m accuracy (`cmd location providers set-test-provider-location … --accuracy 5`); `adb emu geo fix` alone reports no accuracy and Play Services fused rounds it to 100 m, which keeps Start Navigation disabled by design (needs ≤ 50 m).

## Acceptance results (EMULATOR VERIFIED)

| # | Check | Result |
|---|---|---|
| 1 | Fresh install, airplane mode, Splash → Welcome → Permission → Directory (flow at the time; today Welcome → Directory, location asked in context) | PASS — no map-download step |
| 2 | App start copies the bundled PMTiles archive to app-private storage when it is missing or fails its manifest SHA-256 | PASS (no network); hash verification added by #306 (SOURCE/RUNTIME) |
| 3 | Directory → Block 1 → map opens **on the block** (no venue-overview flash), one pulse ring, label under the pin tip | PASS (screen recording, 20 fps extraction) |
| 4 | Place Details → Directions → route preview from live GPS (15 min, 1.2 km), route drawn offline | PASS |
| 5 | Start Navigation, walk the route with mock GPS, walked/remaining styling, instruction card, ETA | PASS |
| 6 | Off-route (80 m) → reroute: new instruction, new route; old route replaced | PASS (the new route reveals by length, so on a long reroute only the first ~100 m is on screen during the first ~75 ms) |
| 7 | Arrival: "You've Arrived!", Recenter / Done; Done returns to the Directory | PASS |
| 8 | Process death: Home, `am kill`, relaunch → "Your last navigation didn't finish" card; Get new route → Block 12 focused | PASS |
| 9 | Cold restart (force-stop) offline → Directory with recents, no onboarding | PASS |
| 10 | **Network assertion**: airplane OFF (8.8.8.8 reachable), fresh install, same flow through navigation, `/proc/net/{tcp,tcp6,udp,udp6}` sampled 382× (~150 s) for the app uid | **0 remote sockets**. Positive control (shell uid → 8.8.8.8:53) detected by the same sampler. Short-lived connections between samples could be missed. |
| 11 | Built manifest | no `com.google.android.geo.API_KEY`; only `play-services-base` entries needed by fused location |

## Performance (EMULATOR; software rendering — not a device benchmark)

| | Baseline `9e9225b` (Google Maps SDK) | Current |
|---|---|---|
| Cold start `am start -W` TotalTime, n=10 | median 1865 ms (min 1169, max 2650) | median 1595 ms (min 1190, max 2586) |
| PSS at first screen | 93–116 MB | 93–127 MB |
| PSS on the map screen | not comparable (Google map blank offline) | 190 MB total (native heap 79 MB, Java 27 MB) |
| Jank while panning | not comparable | 82% janky, median frame 93 ms; control (scrolling the plain Directory list) 74%, 73 ms → the emulator renderer dominates; **PHYSICAL DEVICE REQUIRED** for real jank |
| Map-screen CPU | — | ~48% of one core, single `top` sample during/after panning |

APK size: baseline 87,972,032 bytes (4 ABIs). The final all-ABI size is recorded on #135 with the final APK. The arm64-only dev build is 44,945,502 bytes.

## MapLibre stability matrix (EMULATOR)

Directory↔Map mount/unmount ×10, background/resume ×5, "destroy activities" mode ×3, route/marker/user updates through a full navigation, reroute, arrival, process death → relaunch. **0** `FATAL EXCEPTION` / ANR in logcat; the map re-rendered after every step.

## Pairwise configurations (EMULATOR)

Four binary factors, five rows cover every pair: width 411/320 dp, font 1×/2×, LTR/RTL (app locale `ur-PK`), gesture/3-button navigation. Screens: Directory, Place Details, Route Preview.

| Row | Width | Font | Direction | Nav | Result |
|---|---|---|---|---|---|
| R1 | 411 | 1× | LTR | gesture | PASS |
| R2 | 411 | 2× | RTL | 3-button | PASS (map + sheet mirrored correctly) |
| R3 | 320 | 1× | RTL | 3-button | PASS |
| R4 | 320 | 2× | LTR | 3-button | map PASS; **Directions CTA partly under the nav bar at the default half-open sheet** (finding F1) |
| R5 | 320 | 2× | RTL | gesture | PASS |

The map layers (basemap, blocks, route, pin, label) are correct in every row; geography is correctly not mirrored under RTL.

Findings (UI, not the map renderer; not fixed here):
- **F1** At 2× font on 320 dp with 3-button navigation, the Place Details "Directions" button is partly hidden at the default snap; expanding the sheet reaches it.
- **F2** At 2× font the route sheet wraps "My current location" mid-word.
- **F3** The "Offline" pill overlaps map labels at 2× font.

## Accessibility

- SOURCE: 30 accessibility/label/reduced-motion tests across `HomeScreen`, `MapControls`, `LocationsDirectoryScreen`, `MapLabelOverlay` pass. Map features are GeoJSON layers, not TalkBack nodes — the Directory is the accessible place chooser (documented, #128).
- EMULATOR: every Directory control is ≥ 48 dp tall with a clear accessible name (e.g. "Block 1, Block").
- Reduced motion: place focus jumps, the destination ring is static, the route and reroute draw whole (unit-tested).
- Non-text contrast against the basemap land `#F4F1EA` (WCAG 1.4.11, ≥ 3:1): active route / user dot / selected-block border 3.99, destination pin 3.47, facility badge 3.82, start badge 4.44, special route 8.17.
- **Not run:** real TalkBack, large-font screen-reader traversal, outdoor-glare contrast — PHYSICAL DEVICE REQUIRED.

## Not run (explicit)

PHYSICAL DEVICE: real GNSS, jank/thermal/battery, TalkBack, touch feel, install on a phone. FIELD: venue walking (#46). iOS was not built.
