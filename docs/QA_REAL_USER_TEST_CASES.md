# QA Real User Test Cases

## Scope
Real-user validation matrix for Karachi Ijtema offline navigation app (Expo React Native), prioritized for public-crowd reliability.

## Priority Legend
- P0: Release blocker
- P1: High
- P2: Medium

## Test Case Format
- Test ID
- Screen
- Feature
- Preconditions
- Steps
- Expected Result
- Priority
- Automation
- Related file/component/service

## 1) Startup and permissions
- Test ID: START-001
- Screen: Splash -> Permission
- Feature: First launch without location permission
- Preconditions: Fresh install
- Steps: Open app
- Expected Result: Splash appears, then Permission screen appears
- Priority: P0
- Automation: Automated (static flow + manual runtime)
- Related: `src/views/screens/SplashScreen.tsx`, `src/views/screens/PermissionScreen.tsx`, `src/viewmodels/PermissionViewModel.ts`

- Test ID: START-002
- Screen: Permission
- Feature: Grant location permission
- Preconditions: Permission prompt available
- Steps: Tap Grant Permission, allow permission
- Expected Result: App moves to DownloadMap or Main based on map status
- Priority: P0
- Automation: Manual
- Related: `src/viewmodels/PermissionViewModel.ts`

- Test ID: START-003
- Screen: Permission
- Feature: Deny location permission
- Preconditions: Permission prompt available
- Steps: Tap Grant Permission, deny
- Expected Result: Clear denial messaging; app does not crash
- Priority: P0
- Automation: Manual
- Related: `src/viewmodels/PermissionViewModel.ts`

## 2) Offline map download
- Test ID: OFF-001
- Screen: DownloadMap
- Feature: Start download
- Preconditions: Internet available
- Steps: Tap Download Now
- Expected Result: Progress starts, tile counts increase
- Priority: P0
- Automation: Automated + Manual
- Related: `src/views/screens/DownloadMapScreen.tsx`, `src/viewmodels/DownloadMapViewModel.ts`

- Test ID: OFF-002
- Screen: DownloadMap
- Feature: Download completes and redirects
- Preconditions: Active download
- Steps: Wait for 100%
- Expected Result: “Map saved! Redirecting…” then navigation to Main; fallback Continue to Map appears if redirect delayed
- Priority: P0
- Automation: Automated + Manual
- Related: `src/viewmodels/DownloadMapViewModel.ts`, `src/services/OfflineMapStatusService.ts`

- Test ID: OFF-003
- Screen: DownloadMap
- Feature: Corrupt manifest handling
- Preconditions: Simulated corrupt/incomplete map
- Steps: Open DownloadMap
- Expected Result: Repair Download action shown
- Priority: P0
- Automation: Automated
- Related: `src/services/OfflineMapStatusService.ts`, `src/views/screens/DownloadMapScreen.tsx`

- Test ID: OFF-004
- Screen: Startup
- Feature: Stale downloading state recovery
- Preconditions: Force quit during download
- Steps: Reopen app
- Expected Result: No permanent downloading lock; state recovers to idle/corrupt with clear action
- Priority: P0
- Automation: Automated + Manual
- Related: `src/views/screens/SplashScreen.tsx`, `src/viewmodels/DownloadMapViewModel.ts`

## 3) Home search
- Test ID: HOME-001
- Screen: Home
- Feature: Search input typing and clear
- Preconditions: Home loaded
- Steps: Tap search, type query, clear query
- Expected Result: Results list updates, clear button works
- Priority: P0
- Automation: Manual
- Related: `src/views/screens/HomeScreen.tsx`, `src/viewmodels/HomeViewModel.ts`

- Test ID: HOME-002
- Screen: Home
- Feature: Search by Block/Rasta/Gate/Masjid/Terminal/Help
- Preconditions: Data loaded
- Steps: Search each category keyword
- Expected Result: Type-labeled results shown for supported data
- Priority: P0
- Automation: Automated + Manual
- Related: `src/services/SearchService.ts`

## 4) Category chips
- Test ID: HOME-003
- Screen: Home
- Feature: Category chip filtering
- Preconditions: Home loaded
- Steps: Tap All, Blocks, Rastas, Gates, Masjids, Terminals, Help (available ones)
- Expected Result: Results filter by chip; chips scroll horizontally on small screens
- Priority: P1
- Automation: Automated (static) + Manual
- Related: `src/views/screens/HomeScreen.tsx`, `src/viewmodels/HomeViewModel.ts`

## 5) Current location button
- Test ID: LOC-001
- Screen: Home
- Feature: Recenter action with missing permission
- Preconditions: Permission denied or not granted
- Steps: Tap current location button
- Expected Result: Permission flow or clear fallback message, no silent failure
- Priority: P0
- Automation: Automated (handler wiring) + Manual
- Related: `src/viewmodels/HomeViewModel.ts`, `src/services/LocationAccessService.ts`

- Test ID: LOC-002
- Screen: Home
- Feature: Recenter action with granted permission
- Preconditions: Permission granted, GPS on
- Steps: Tap current location button
- Expected Result: Map recenters to current location and marker updates
- Priority: P0
- Automation: Manual
- Related: `src/viewmodels/HomeViewModel.ts`

## 6) Map layer button
- Test ID: HOME-004
- Screen: Home
- Feature: Layer action
- Preconditions: Home loaded
- Steps: Tap Layers button
- Expected Result: Layer menu opens; satellite warns when offline
- Priority: P1
- Automation: Manual
- Related: `src/views/screens/HomeScreen.tsx`

## 7) Bottom sheet
- Test ID: HOME-005
- Screen: Home
- Feature: Place details bottom sheet
- Preconditions: Select block/rasta on map or search
- Steps: Open sheet, close sheet, tap Directions
- Expected Result: Sheet opens with details and Directions CTA works
- Priority: P0
- Automation: Manual
- Related: `src/views/screens/HomeScreen.tsx`

## 8) Directions current location
- Test ID: DIR-001
- Screen: Directions
- Feature: Use My Current Location
- Preconditions: Destination selected
- Steps: Tap Use My Current Location
- Expected Result: Permission/location resolved or manual-start fallback shown clearly
- Priority: P0
- Automation: Automated (handler existence) + Manual
- Related: `src/viewmodels/DirectionsViewModel.ts`

## 9) Directions manual start
- Test ID: DIR-002
- Screen: Directions
- Feature: Manual start search and select
- Preconditions: Destination selected
- Steps: Type start query, tap result
- Expected Result: Start updates and route recalculates
- Priority: P0
- Automation: Manual
- Related: `src/views/screens/DirectionsScreen.tsx`, `src/viewmodels/DirectionsViewModel.ts`

## 10) Directions keyboard behavior
- Test ID: DIR-003
- Screen: Directions
- Feature: Keyboard-safe scroll and taps
- Preconditions: Small Android screen
- Steps: Focus start input, type, scroll while keyboard open
- Expected Result: Inputs/results remain tappable; no clipping
- Priority: P0
- Automation: Automated (layout checks) + Manual
- Related: `src/views/screens/DirectionsScreen.tsx`

## 11) Directions route calculation
- Test ID: DIR-004
- Screen: Directions
- Feature: Route guardrails
- Preconditions: Destination set
- Steps: Try with missing origin, same start+destination, outside venue origin
- Expected Result: Route is blocked with explicit errors; no fake route
- Priority: P0
- Automation: Automated + Manual
- Related: `src/viewmodels/DirectionsViewModel.ts`, `src/services/RoutingService.ts`

## 12) Directions route result UI
- Test ID: DIR-005
- Screen: Directions
- Feature: Full route result visibility
- Preconditions: Valid route
- Steps: Scroll to bottom
- Expected Result: Tabs/summary/Start Navigation/Clear Route/Steps fully visible
- Priority: P0
- Automation: Automated (structure) + Manual
- Related: `src/views/screens/DirectionsScreen.tsx`

## 13) Navigation active route
- Test ID: NAV-001
- Screen: Navigation
- Feature: Active guidance state
- Preconditions: Navigation started
- Steps: Observe route/instruction card updates
- Expected Result: Instruction card updates, reroute pending state visible
- Priority: P0
- Automation: Manual
- Related: `src/viewmodels/NavigationViewModel.ts`, `src/views/screens/NavigationScreen.tsx`

## 14) Navigation markers
- Test ID: NAV-002
- Screen: Navigation
- Feature: Marker semantics
- Preconditions: Active route
- Steps: Inspect map markers
- Expected Result: Destination red marker, start marker visible, user marker clear blue
- Priority: P0
- Automation: Automated (static) + Manual
- Related: `src/views/screens/NavigationScreen.tsx`

## 15) Navigation voice/mute
- Test ID: NAV-003
- Screen: Navigation
- Feature: Mute toggle
- Preconditions: Active navigation
- Steps: Tap mute/unmute
- Expected Result: Voice playback toggles correctly
- Priority: P0
- Automation: Automated (handler) + Manual
- Related: `src/views/screens/NavigationScreen.tsx`, `src/viewmodels/NavigationViewModel.ts`

## 16) Navigation exit/back
- Test ID: NAV-004
- Screen: Navigation
- Feature: Exit and Android back
- Preconditions: Active navigation on Android
- Steps: Tap Exit; press hardware back
- Expected Result: Exit works; back shows confirmation dialog
- Priority: P0
- Automation: Automated (handler) + Manual
- Related: `src/views/screens/NavigationScreen.tsx`

## 17) Settings toggles
- Test ID: SET-001
- Screen: Settings
- Feature: Toggle persistence
- Preconditions: App running
- Steps: Toggle voice/auto-reroute/dark mode, restart app
- Expected Result: Values persist
- Priority: P0
- Automation: Automated + Manual
- Related: `src/store/useAppStore.ts`, `src/views/screens/SettingsScreen.tsx`

## 18) Settings location permission manage
- Test ID: SET-002
- Screen: Settings
- Feature: Permission manage action
- Preconditions: Permission denied or askable
- Steps: Tap Location Permission row
- Expected Result: Requests permission or opens app settings; status refreshes on app foreground
- Priority: P0
- Automation: Automated + Manual
- Related: `src/viewmodels/SettingsViewModel.ts`, `src/views/screens/SettingsScreen.tsx`, `src/services/LocationAccessService.ts`

## 19) Settings walking speed
- Test ID: SET-003
- Screen: Settings + Directions
- Feature: Walking speed affects ETA
- Preconditions: Same origin/destination route
- Steps: Change speed preset, recalc route
- Expected Result: ETA changes accordingly
- Priority: P0
- Automation: Automated
- Related: `src/services/RoutingService.ts`, `src/viewmodels/DirectionsViewModel.ts`

## 20) Settings distance unit
- Test ID: SET-004
- Screen: Settings + Directions/Navigation
- Feature: Distance unit display
- Preconditions: Route available
- Steps: Toggle meters/feet
- Expected Result: Distances display in selected unit
- Priority: P1
- Automation: Automated + Manual
- Related: `src/services/InstructionService.ts`

## 21) App Guide
- Test ID: GUIDE-001
- Screen: Settings -> App Guide
- Feature: Guide open and sections
- Preconditions: App running
- Steps: Open App Guide, scroll all sections
- Expected Result: All required sections visible; readable Urdu+English
- Priority: P0
- Automation: Automated + Manual
- Related: `src/views/screens/SettingsScreen.tsx`, `src/views/screens/AppGuideScreen.tsx`

## 22) Dark/light mode
- Test ID: THEME-001
- Screen: All key screens
- Feature: Theme switching
- Preconditions: Dark mode toggle available
- Steps: Toggle dark mode and navigate screens
- Expected Result: No unreadable text/controls
- Priority: P1
- Automation: Manual
- Related: `src/services/useTheme.ts`, `src/services/ThemeService.ts`

## 23) Translation/Urdu
- Test ID: LANG-001
- Screen: Settings + key labels
- Feature: Language toggle and Urdu readability
- Preconditions: App running
- Steps: Toggle language, inspect guide/instructions
- Expected Result: Urdu strings render without clipping; mixed labels readable
- Priority: P1
- Automation: Manual
- Related: `src/store/useAppStore.ts`, `src/services/InstructionService.ts`, `src/views/screens/AppGuideScreen.tsx`

## 24) Offline mode
- Test ID: OFF-005
- Screen: Home/Directions/Navigation
- Feature: Offline search and routing
- Preconditions: Map/data downloaded, internet off
- Steps: Search and route between blocks
- Expected Result: Internal routing works offline
- Priority: P0
- Automation: Manual
- Related: `src/services/RoutingService.ts`, `src/services/SearchService.ts`

## 25) Missing Google Maps key fallback
- Test ID: MAPKEY-001
- Screen: Home/Directions/Navigation
- Feature: Key missing resilience
- Preconditions: No map key configured
- Steps: Launch app
- Expected Result: Warning/fallback shown; app does not crash
- Priority: P0
- Automation: Automated + Manual
- Related: `src/services/MapConfigService.ts`, map screens

## 26) Weak GPS
- Test ID: GPS-001
- Screen: Navigation
- Feature: Weak accuracy handling
- Preconditions: Simulated accuracy > 40m
- Steps: Navigate with weak GPS
- Expected Result: Weak GPS warning shown; reroute threshold widened
- Priority: P0
- Automation: Automated + Manual
- Related: `src/viewmodels/NavigationViewModel.ts`, `src/services/RerouteService.ts`

## 27) Outside Ijtema area
- Test ID: GEO-001
- Screen: Home/Directions
- Feature: Outside area behavior
- Preconditions: GPS outside venue
- Steps: Try route using current location
- Expected Result: Outside warning shown; asks for manual start inside venue
- Priority: P0
- Automation: Automated + Manual
- Related: `src/services/RoutingService.ts`, `src/viewmodels/DirectionsViewModel.ts`

## 28) Same start/destination
- Test ID: ROUTE-001
- Screen: Directions
- Feature: Degenerate route prevention
- Preconditions: Same place selected as start and destination
- Steps: Calculate route
- Expected Result: Clear message; no fake/zero-distance route
- Priority: P0
- Automation: Automated
- Related: `src/viewmodels/DirectionsViewModel.ts`, `src/services/RoutingService.ts`

## 29) No route found
- Test ID: ROUTE-002
- Screen: Directions
- Feature: No-route error state
- Preconditions: Unrouteable start/destination combo
- Steps: Calculate route
- Expected Result: Error + retry shown, no infinite loading
- Priority: P0
- Automation: Automated + Manual
- Related: `src/viewmodels/DirectionsViewModel.ts`

## 30) Android back button
- Test ID: AND-001
- Screen: Home/Directions/Navigation
- Feature: Back behavior correctness
- Preconditions: Android device
- Steps: Press hardware back in search, keyboard, navigation
- Expected Result: Keyboard dismiss first where applicable; navigation asks exit confirmation
- Priority: P0
- Automation: Manual
- Related: screen files above

## 31) Small screen
- Test ID: UI-001
- Screen: Home/Directions/AppGuide
- Feature: Small-screen layout
- Preconditions: 5" Android or emulator small profile
- Steps: Open all key flows and scroll
- Expected Result: No clipped critical actions
- Priority: P1
- Automation: Manual
- Related: key screen files

## 32) App restart/force quit
- Test ID: REL-001
- Screen: Startup/Download
- Feature: Recovery
- Preconditions: During download and after completion
- Steps: Force quit and reopen
- Expected Result: Recovery path works, no stuck states
- Priority: P0
- Automation: Automated + Manual
- Related: `src/views/screens/SplashScreen.tsx`, `src/viewmodels/DownloadMapViewModel.ts`

## 33) Home production layout and controls
- Test ID: HOME-UI-001
- Screen: Home
- Feature: Search, chips, warnings, and map controls
- Preconditions: Small Android screen profile; app in normal non-developer mode
- Steps: Open Home, focus/unfocus search, horizontally scroll category chips, toggle outside-area GPS state, tap layer/zoom/recenter controls
- Expected Result: Search bar is fully visible; first/last chips are not clipped; chips scroll; layer/zoom/recenter controls do not overlap warnings; debug controls are hidden; outside warning is compact and dismissible
- Priority: P0
- Automation: Automated + Manual
- Related: `src/views/screens/HomeScreen.tsx`, `scripts/test-home-ux.ts`

## 34) Current location and remembered fallback
- Test ID: LOC-REM-001
- Screen: Home/Directions
- Feature: Live GPS, device last-known, remembered-location fallback
- Preconditions: One successful GPS fix has been stored; then disable GPS or simulate GPS failure
- Steps: Tap Home current-location button, then open Directions and tap Use My Current Location; choose remembered location when live GPS fails
- Expected Result: Live GPS recenters when available; failures show a clear message; remembered location is labelled "last known" with age; remembered outside-venue locations are not used automatically as route starts; manual start remains available
- Priority: P0
- Automation: Automated + Manual
- Related: `src/services/LocationAccessService.ts`, `src/store/useAppStore.ts`, `src/viewmodels/HomeViewModel.ts`, `src/viewmodels/DirectionsViewModel.ts`

## 35) Settings permission management
- Test ID: SET-PERM-001
- Screen: Settings
- Feature: Location Permission Manage
- Preconditions: Test granted, denied-askable, denied-permanent, and location-services-off states
- Steps: Tap Location Permission row in each state; change permission in Android settings; return to app
- Expected Result: Row shows Allowed/Not allowed/Location Off accurately; askable state requests permission; blocked or granted state opens app settings; services-off state opens device location settings; status refreshes on return
- Priority: P0
- Automation: Automated + Manual
- Related: `src/viewmodels/SettingsViewModel.ts`, `src/views/screens/SettingsScreen.tsx`

## 36) Delete Map Data safety
- Test ID: DB-DEL-001
- Screen: Settings/Download Map
- Feature: Idempotent offline map deletion
- Preconditions: Test with downloaded map, missing map, closed DB, and corrupt DB
- Steps: Tap Delete Map Data, confirm; repeat immediately; restart app
- Expected Result: Confirmation appears; no red error screen; no `NativeDatabase.prepareAsync` null crash; tiles/manifest/download flag are cleared; offline status becomes `not_downloaded`; restart shows download required
- Priority: P0
- Automation: Automated + Manual
- Related: `src/services/OfflineDataService.ts`, `src/services/OfflineMapService.ts`, `src/viewmodels/SettingsViewModel.ts`

## 37) Block 2 Member Masjid data
- Test ID: DATA-B2-001
- Screen: Home/Search/Directions
- Feature: Block 2 and C1-C4 gates
- Preconditions: App loaded with current dataset
- Steps: Search `Member Masjid`, `Main Member Masjid`, `B2`, `C1`, `C2`, `C3`, `C4`; open Block 2 detail; route to each gate
- Expected Result: Block 2 appears as Member Masjid; C1-C4 are searchable; detail sheet shows Member Masjid gates; coordinates match DMS conversion; routing uses nearest internal rasta node
- Priority: P0
- Automation: Automated + Manual
- Related: `src/constants/data.ts`, `src/services/SearchService.ts`, `scripts/test-graph-validation.ts`

## 38) Navigation marker semantics and animation
- Test ID: NAV-MARK-001
- Screen: Directions/Navigation
- Feature: Marker clarity
- Preconditions: Valid route with live location, then route with remembered/manual start
- Steps: Inspect preview and active navigation
- Expected Result: Current user marker is blue and pulsing; remembered marker is labelled last known; start marker is blue; destination marker is red; route line is strong; graph nodes are not shown in production; recenter works
- Priority: P0
- Automation: Automated + Manual
- Related: `src/views/screens/DirectionsScreen.tsx`, `src/views/screens/NavigationScreen.tsx`

## 39) Settings behavior and persistence
- Test ID: SET-PERSIST-001
- Screen: Settings/Directions/Navigation/Home
- Feature: Visible settings are real
- Preconditions: Fresh app state
- Steps: Toggle map style, auto-follow, north-up, voice instructions, auto-reroute, distance unit, walking speed, language voice setting; restart app
- Expected Result: Settings persist; map style changes map type when available; distance unit changes distance text; walking speed changes ETA; auto-follow/north-up/voice/auto-reroute affect runtime behavior; language row is labelled as voice-only
- Priority: P0
- Automation: Automated + Manual
- Related: `src/store/useAppStore.ts`, `src/services/InstructionService.ts`, `src/views/screens/SettingsScreen.tsx`
