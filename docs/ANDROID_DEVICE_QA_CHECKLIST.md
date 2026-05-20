# Android Device QA Checklist

## Preconditions
- Install latest debug/dev build on Android device
- Ensure map dataset bundled and internet toggle available
- Have ability to toggle location permission and device location services

## Checklist
1. Fresh install app.
2. Open app and verify Splash then Permission flow.
3. Tap **Grant Permission** and allow location.
4. Go to Home and tap **current location** button; verify map recenters.
5. On Home, verify search bar is not clipped, chips scroll horizontally, first/last chip are readable, and map controls do not overlap warnings.
6. Deny or disable location and tap **current location**; verify clear error plus **Use remembered location** or manual-start fallback.
7. Open Settings -> **Location Permission** row; verify action works (request/open app settings or device location settings).
8. From Android app settings, change location permission state.
9. Return to app and verify Settings permission status refreshes.
10. On Home search, type `Block 2`; verify result appears.
11. On Home search, type `Member Masjid`; verify Block 2 appears.
12. On Home search, type `B2`; verify Block 2 appears.
13. On Home search, type `C1`, `C2`, `C3`, and `C4`; verify each gate appears.
14. Open Block 2 detail and verify **Member Masjid / Main Member Masjid** and C1-C4 gates are shown.
15. On Home search, type `Rasta 05`; verify result appears.
16. Select a result and verify bottom sheet opens.
17. Tap **Directions**.
18. On Directions, verify destination is prefilled in TO.
19. Tap **Use My Current Location**.
20. If GPS unavailable/outside, verify manual-start guidance message appears and remembered location is labelled if used.
21. In Directions, search and select manual start point.
22. Open keyboard in start search; verify results remain tappable.
23. Press Android back once with keyboard open; verify keyboard closes first.
24. Press back again; verify screen navigates back.
25. Reopen Directions and calculate route with valid start+destination.
26. Scroll entire Directions screen; verify Start Navigation, Steps, Clear route are reachable.
27. Verify map preview markers: destination red, start blue.
28. Tap **Start Navigation**.
29. In Navigation screen, verify route line visible and instruction card updates.
30. Verify markers: destination red, start marker visible, user marker clear blue/pulsing; remembered marker has “last known” label when used.
31. Tap **mute/unmute** button; verify icon/state toggles.
32. Tap **recenter** button; verify camera recenters on user.
33. Tap **Exit** and verify navigation closes.
34. Re-enter navigation and press Android back; verify exit confirmation appears.
35. In Settings, toggle voice/auto-reroute/distance unit/walking speed/map style/auto-follow/north-up/language voice setting.
36. Restart app and verify settings persist and distance/ETA behavior reflects settings.
37. Open Settings -> **App Guide**.
38. Scroll App Guide fully; verify all 7 sections visible.
39. Verify Urdu/English mixed text readability in App Guide.
40. Put device offline (airplane mode) after map download.
41. Verify Home search and internal route calculation still work offline.
42. Tap Settings -> **Delete Map Data**, confirm, repeat delete once, and verify no crash/red screen.
43. Restart after delete and verify Download Map is required.
44. Start download and force quit app mid-download.
45. Reopen app and verify download state is recoverable (not stuck forever).
46. Complete download and verify automatic redirect from “Map saved! Redirecting…”.
47. Restart app and verify Offline Map screen is skipped when manifest is valid.
48. Test weak GPS condition (if possible) and verify weak GPS warning in navigation.
49. Test outside-Ijtema GPS point and verify manual-start inside-venue guidance.
50. Verify normal user mode never shows graph node/debug overlays.

## Pass Criteria
- No critical button is dead/silent.
- No infinite route loading states.
- No clipped critical controls on small Android screen.
- Offline flow, permission flow, and navigation flow all recover cleanly.
