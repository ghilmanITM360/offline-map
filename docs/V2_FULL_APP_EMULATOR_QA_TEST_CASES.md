# V2 Full App Emulator QA Test Cases

Android runtime status starts as `NOT TESTED` until an emulator or device is available through `adb`.

Release-only rule:

- Use `npm run android:release:apk` then `npm run android:install:release` for offline QA.
- Do not use `npx expo run:android` or `npm run android:debug` for offline restart verdicts. Those install a debug build that depends on Metro.
- If Google Location Accuracy overlay blocks controls, mark the affected cases `BLOCKED` until it is cleared from emulator/device settings or dismissed manually.

| Test ID | Area | Preconditions | Steps | Expected result | Priority | Automation status | Android/manual status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A-001 | Installation / startup | Clean emulator/device | Install release app with `npm run android:install:release`; open app | App opens without crash | P0 | Partial: startup config scripts | NOT TESTED |
| A-002 | Installation / startup | App installed | Force close and restart app | App restores settings and opens Home | P0 | Partial: settings tests | NOT TESTED |
| A-003 | Installation / startup | Wi-Fi/mobile data off, release APK installed | Open app from cold start | Home opens and venue graph remains usable with no Metro redbox | P0 | Covered by `test:offline-v2` source checks | NOT TESTED |
| A-004 | Installation / startup | Google key absent or invalid | Open app | Graph-only map appears; no blank map blocks navigation | P0 | Covered by map/offline tests | NOT TESTED |
| A-005 | Installation / startup | Base map unavailable | Open Home and Directions | Message says `Background map unavailable. Ijtema routes still work.` | P0 | Covered by offline tests | NOT TESTED |
| B-001 | Home map | App open | Inspect Home map | Blocks B1-B42 visible | P0 | Covered by `test:map-rendering-v2` | NOT TESTED |
| B-002 | Home map | App open | Zoom around venue | Block labels are readable | P1 | Manual | NOT TESTED |
| B-003 | Home map | App open | Inspect rasta overlays | Rasta 01-11 visible | P0 | Covered by `test:map-rendering-v2` | NOT TESTED |
| B-004 | Home map | App open | Inspect Shahr-e-Pindal overlays | North/South/West labels visible | P0 | Covered by `test:map-rendering-v2` | NOT TESTED |
| B-005 | Home map | App open | Inspect gates | Active gates render; nonexistent gates 06/09/10/11/12 do not appear and no fake markers render | P0 | Covered by `test:map-rendering-v2` | NOT TESTED |
| B-006 | Home map | Select Block 42 | Tap/search/select block | Selected block highlight is visible | P0 | Covered by `test:map-rendering-v2` | NOT TESTED |
| B-007 | Home map | Google key/tile unavailable | Open Home | Graph-only fallback shows blocks, rastas, gates | P0 | Covered by `test:offline-v2` | NOT TESTED |
| C-001 | Search | Home open | Search `Block 1` | Block 1 appears from v2 data | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-002 | Search | Home open | Search `Block 24` | Block 24 appears from v2 data | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-003 | Search | Home open | Search `Block 25` | Block 25 appears from v2 data | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-004 | Search | Home open | Search `Block 32` | Block 32 appears from v2 data | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-005 | Search | Home open | Search `Block 33` | Block 33 appears from v2 data | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-006 | Search | Home open | Search `Block 42` | Block 42 appears from v2 data | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-007 | Search | Home open | Search `Gate 05` | Gate 05 appears and is routable | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-008 | Search | Home open | Search `Gate 21` | Gate 21 appears and is routable | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-009 | Search | Home open | Search `Rasta 09` | Rasta 09 appears with v2 points | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-010 | Search | Home open | Search `Rasta 11` | Rasta 11 appears with v2 points | P0 | Covered by `test:search-v2` | NOT TESTED |
| C-011 | Search | Home open | Search `Shahr-e-Pindal North` | Search result appears as routable, with friendly Shahr-e-Pindal label and no raw IDs | P1 | Covered by `test:search-v2` and `test:directions-v2` | NOT TESTED |
| C-012 | Search | Urdu keyboard available | Search `بلاک 42` | Block 42 appears | P1 | Covered by `test:search-v2` | NOT TESTED |
| C-013 | Search | Urdu keyboard available | Search `راستہ 9` | Rasta 09 appears | P1 | Covered by `test:search-v2` | NOT TESTED |
| D-001 | Directions | Start/destination selectable | Gate 05 -> Block 2 | Route exists, positive distance/ETA, friendly instructions | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-002 | Directions | Start/destination selectable | Gate 05 -> Block 36 | Route exists, positive distance/ETA, friendly instructions | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-003 | Directions | Start/destination selectable | Gate 21 -> Block 28 | Route exists and Start Navigation is available | P0 | Covered by `test:navigation-v2` | NOT TESTED |
| D-004 | Directions | Start/destination selectable | Gate 22 -> Block 26 | Route exists, positive distance/ETA, friendly instructions | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-005 | Directions | Start/destination selectable | Gate 08 -> Block 24 | Route exists, positive distance/ETA, friendly instructions | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-006 | Directions | Start/destination selectable | Gate 13 -> Block 42 | Route exists, positive distance/ETA, friendly instructions | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-007 | Directions | Start/destination selectable | Block 1 -> Block 24 | Route exists, no fake shortcut through blocks | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-008 | Directions | Start/destination selectable | Block 25 -> Block 32 | Route exists, no fake shortcut through blocks | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-009 | Directions | Start/destination selectable | Block 33 -> Block 42 | Route exists, no fake shortcut through blocks | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-010 | Directions | Start/destination selectable | Rasta 09 -> Block 3 | Route exists, positive distance/ETA | P0 | Covered by `test:route-smoke-v2` | NOT TESTED |
| D-011 | Directions | Outside west start | Outside west coordinate -> Block 28 | Route starts at nearest connected official gate | P0 | Covered by `test:entry-gate-routing` and `test:directions-v2` | NOT TESTED |
| D-012 | Directions | Gate 18 selected | Gate 18 -> Block 28 | Blocked with connector verification message | P0 | Covered by `test:navigation-v2` | NOT TESTED |
| D-013 | Directions | Gate 15 selected | Gate 15 -> Block 28 | Route exists with positive distance/ETA and Start Navigation is available | P0 | Covered by `test:navigation-v2` | NOT TESTED |
| E-001 | Active navigation | Gate 21 -> Block 28 route ready | Tap Start Navigation | V2 NavigationScreen opens | P0 | Covered by `test:navigation-v2` source/state checks | NOT TESTED |
| E-002 | Active navigation | V2 nav open | Inspect map | Route line visible | P0 | Covered by `test:navigation-v2` source/layer checks | NOT TESTED |
| E-003 | Active navigation | V2 nav open | Inspect map | Start marker visible | P0 | Covered by `test:navigation-v2` source/layer checks | NOT TESTED |
| E-004 | Active navigation | V2 nav open | Inspect map | Current/user marker visible | P0 | Covered by `test:navigation-v2` source/layer checks | NOT TESTED |
| E-005 | Active navigation | V2 nav open | Inspect map | Red destination marker visible | P0 | Covered by `test:navigation-v2` source/layer checks | NOT TESTED |
| E-006 | Active navigation | V2 nav open | Destination is block | Selected block highlight visible | P0 | Covered by `test:map-rendering-v2` | NOT TESTED |
| E-007 | Active navigation | V2 nav open | Read instruction card | Friendly text; no raw IDs in normal mode | P0 | Covered by `test:navigation-v2` | NOT TESTED |
| E-008 | Active navigation | V2 nav open | Tap Exit | Navigation stops and returns safely | P0 | Covered by source-level action tests | NOT TESTED |
| E-009 | Active navigation | V2 nav open | Pan map, tap Recenter | Camera recenters on user marker | P1 | Manual | NOT TESTED |
| E-010 | Active navigation | Recalculation triggered | Observe during reroute | Existing route remains visible during recalculation | P0 | Covered by `test:reroute-v2` | NOT TESTED |
| F-001 | GPS / fallback | Permission prompt available | Grant location permission | Current GPS marker appears when device provides location | P0 | Covered by GPS source tests | NOT TESTED |
| F-002 | GPS / fallback | Permission prompt available | Deny location permission | Manual start path remains available | P0 | Covered by GPS source tests | NOT TESTED |
| F-003 | GPS / fallback | GPS unavailable | Choose current location | Clear unavailable message and manual start option | P0 | Covered by GPS source tests | NOT TESTED |
| F-004 | GPS / fallback | Directions open | Choose manual start | Route can calculate from selected routable place | P0 | Covered by directions tests | NOT TESTED |
| F-005 | GPS / fallback | Last known location exists | Choose remembered location | Route can use last known location | P0 | Covered by source-level tests | NOT TESTED |
| F-006 | GPS / fallback | User outside Ijtema | Route to block | Route begins at nearest connected official gate | P0 | Covered by entry-gate tests | NOT TESTED |
| F-007 | GPS / fallback | User inside Ijtema | Route to block | Route snaps to internal graph | P0 | Covered by directions tests | NOT TESTED |
| F-008 | GPS / fallback | Weak GPS simulated | Navigate | Weak GPS warning appears and progress does not jump | P1 | Covered by progress tests | NOT TESTED |
| G-001 | Offline mode | App installed | Turn off Wi-Fi/mobile data, open app | App opens | P0 | Covered by `test:offline-v2` source checks | NOT TESTED |
| G-002 | Offline mode | Offline | Search Block 42 | Search works from local data | P0 | Covered by `test:offline-v2` | NOT TESTED |
| G-003 | Offline mode | Offline | Calculate Gate 21 -> Block 28 | Directions works from local graph | P0 | Covered by `test:offline-v2` | NOT TESTED |
| G-004 | Offline mode | Offline | Start Gate 21 -> Block 28 navigation | Navigation works from local graph | P0 | Covered by `test:offline-v2` | NOT TESTED |
| G-005 | Offline mode | Offline/base tiles unavailable | Inspect Home and Navigation | Graph-only map visible; no live tile dependency | P0 | Covered by `test:offline-v2` | NOT TESTED |
| H-001 | Settings | Settings open | Toggle developer mode | Normal hides raw IDs; developer may show labels | P0 | Covered by v2 tests | NOT TESTED |
| H-002 | Settings | Settings open | Change map style | Standard/satellite setting changes without crash | P1 | Covered by settings source tests | NOT TESTED |
| H-003 | Settings | Route ready | Change distance unit | Distances update units | P1 | Covered by settings/source tests | NOT TESTED |
| H-004 | Settings | Route ready | Change walking speed | ETA changes | P0 | Covered by routing/settings tests | NOT TESTED |
| H-005 | Settings | Settings open | Toggle voice instructions | Voice preference persists | P1 | Covered by settings source tests | NOT TESTED |
| H-006 | Settings | Settings open | Toggle auto-reroute | Auto-reroute preference persists | P1 | Covered by settings source tests | NOT TESTED |
| H-007 | Settings | Drawer/settings open | Open App Guide | Offline guide opens | P1 | Covered by settings guide test | NOT TESTED |
| H-008 | Settings | Download map screen open | Delete/update map | Operation does not crash; venue-only option remains | P1 | Covered by offline download source tests | NOT TESTED |
| I-001 | Regression | V2 flags explicitly false | Open app and old route path | App does not crash on rollback path | P0 | Covered by `test:v1-v2-isolation` | NOT TESTED |
| I-002 | Regression | V2 route ready | Disable v2 navigation flag | V2 route never enters old runtime | P0 | Covered by `test:v1-v2-isolation` | NOT TESTED |
| I-003 | Regression | App open | Tap primary buttons | No dead buttons | P1 | Manual | NOT TESTED |
| I-004 | Regression | Navigation open | Press Android back | Exit confirmation works | P1 | Manual | NOT TESTED |
| I-005 | Regression | Search focused | Open/close keyboard | Keyboard does not break layout | P1 | Manual | NOT TESTED |
| I-006 | Regression | Settings changed | Restart app | Settings persist | P1 | Covered by source-level tests | NOT TESTED |
| I-007 | Regression | Search open | Search nonexistent gates 06/09/10/11/12 | No result appears in normal UI because these gates are excluded from latest dataset | P1 | Manual | NOT TESTED |
| J-001 | Scale/readiness | Low-end emulator/device | Pan/zoom Home | Acceptable rendering performance | P1 | Manual | NOT TESTED |
| J-002 | Scale/readiness | Home open | Repeat 50 searches | No crash or infinite loader | P1 | Manual | NOT TESTED |
| J-003 | Scale/readiness | Directions open | Repeat 25 route calculations | No crash; results stay plausible | P1 | Manual | NOT TESTED |
| J-004 | Scale/readiness | App installed | Restart app repeatedly | No startup crash | P1 | Manual | NOT TESTED |
| J-005 | Scale/readiness | Navigation open | Observe memory/performance | No runaway memory or loader | P1 | Manual | NOT TESTED |
| J-006 | Scale/readiness | Normal user mode | Inspect labels/instructions | Developer/debug labels hidden | P0 | Covered by v2 tests | NOT TESTED |
