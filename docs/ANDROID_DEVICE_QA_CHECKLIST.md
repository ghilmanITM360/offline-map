# Android Device QA Checklist

## Preconditions
- Android phone (preferably low-mid tier)
- Fresh install build
- Ability to toggle internet/location permission/location services

## 46-Step Release Checklist
1. Fresh install and open app.
2. Verify Splash loads then routes to Permission/startup flow.
3. Restart app once; verify startup is stable.
4. Start offline map download with internet on.
5. Disable internet mid-download; verify failure state with retry.
6. Start download again; force-quit during download.
7. Reopen app; verify stale download state is recovered.
8. Complete download and verify redirect/continue flow works.
9. From Settings, delete map data once.
10. Trigger delete map data again quickly; verify no crash.
11. Restart app; verify map is treated as not downloaded.
12. On Home, type a generic search query and clear it.
13. Verify category chips are horizontally scrollable and not clipped.
14. Tap current location button with permissions denied.
15. Verify denied flow gives actionable fallback (settings/manual).
16. Grant location permission and tap current location again.
17. Turn location services off and verify manage/location messaging.
18. Verify remembered location fallback path is offered when applicable.
19. In Settings, use Location Permission manage row and return to app.
20. Verify permission status refreshes after app foreground.
21. Search `Block 2`.
22. Search `Member Masjid`.
23. Search `C1`, `C2`, `C3`, `C4` individually.
24. Open Directions using current location origin.
25. Open Directions using manual start selection.
26. Open keyboard on start search and verify no clipped interactions.
27. Try same start and destination; verify explicit error.
28. Try outside-venue start; verify explicit guidance.
29. Force a no-route path if possible; verify graceful error.
30. Validate timeout/retry behavior on slow route computation.
31. Tap Start Navigation from a valid route.
32. Toggle mute/unmute during active navigation.
33. Pan map away and use recenter control.
34. Exit navigation using Exit action.
35. Re-enter navigation and press Android back; confirm dialog appears.
36. Toggle key Settings controls and verify state changes.
37. Toggle distance unit and verify displayed distances update.
38. Change walking speed and verify ETA changes on recalculation.
39. Toggle map style and verify Home/Directions/Navigation reflect change.
40. Open App Guide and verify all sections render.
41. Launch without Google Maps key (dev scenario) and verify fallback messaging.
42. Toggle dark/light mode (if enabled) and inspect readability.
43. Toggle language/Urdu voice and verify instructions/localized text readability.
44. Validate small-screen Home layout for overlaps.
45. Simulate weak GPS and verify weak signal banner/behavior.
46. Run route-smoke, graph-validation, secret-scan, and TypeScript checks before sign-off.

## Pass Criteria
- No P0 crash
- No silent dead critical action
- Current location and permissions flows are actionable
- Delete map data is safe/idempotent
- Navigation markers and route guidance are clear
- Routes stay inside internal graph dataset
- Security and typecheck gates pass
