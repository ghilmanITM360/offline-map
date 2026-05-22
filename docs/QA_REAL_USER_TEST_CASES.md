# QA Real User Test Cases

## Scope
Karachi Ijtema offline navigation app release validation for high-stress, low-connectivity Android usage.

## Legend
- Priority: `P0` release blocker, `P1` high, `P2` medium
- Automation: `Automated`, `Manual`, `Hybrid`

| Test ID | Screen/System | Feature | Preconditions | Steps | Expected Result | Priority | Automation | Related File/Service |
|---|---|---|---|---|---|---|---|---|
| TC-001 | Startup | Fresh install | App not installed | Install + open app | Splash then Permission flow works | P0 | Manual | `src/views/screens/SplashScreen.tsx` |
| TC-002 | Startup | App restart | App previously opened | Kill app, reopen | Startup status recovery works | P0 | Manual | `src/views/screens/SplashScreen.tsx` |
| TC-003 | Offline Download | Offline map download | Internet available | Start Download Now | Progress updates and tiles save | P0 | Hybrid | `src/viewmodels/DownloadMapViewModel.ts` |
| TC-004 | Offline Download | Download failure | Simulate network drop | Start then cut internet | Error shown with retry path | P0 | Hybrid | `src/viewmodels/DownloadMapViewModel.ts` |
| TC-005 | Offline Download | Force quit during download | Download in progress | Force close app | Reopen recovers state (not stuck) | P0 | Hybrid | `src/services/OfflineMapStatusService.ts` |
| TC-006 | Settings/Offline | Delete Map Data | Map previously downloaded | Tap Delete Map Data confirm | No crash; map+manifest reset | P0 | Hybrid | `src/services/OfflineDataService.ts` |
| TC-007 | Settings/Offline | Delete double tap | Map downloaded | Trigger delete twice quickly | Idempotent, no crash | P0 | Hybrid | `src/services/OfflineDataService.ts` |
| TC-008 | Startup | Restart after delete | Map deleted | Restart app | Download required again | P0 | Manual | `src/views/screens/SplashScreen.tsx` |
| TC-009 | Home/Search | Home search basic | Home loaded | Type query + select | Results show and select works | P0 | Manual | `src/viewmodels/HomeViewModel.ts` |
| TC-010 | Home/Search | Category chips | Home loaded | Tap chips + horizontal scroll | Filtering works, chips not clipped | P1 | Hybrid | `src/views/screens/HomeScreen.tsx` |
| TC-011 | Home/Location | Current location button | Permission varying | Tap recenter | Recenter/fallback flow shown, no no-op | P0 | Hybrid | `src/viewmodels/HomeViewModel.ts` |
| TC-012 | Permissions | Permission denied path | Deny permission | Request then deny | Clear guidance, no crash | P0 | Manual | `src/viewmodels/PermissionViewModel.ts` |
| TC-013 | Permissions | Permission granted path | Prompt available | Request then allow | Moves forward; GPS actions enabled | P0 | Manual | `src/viewmodels/PermissionViewModel.ts` |
| TC-014 | Permissions | Location services off | Permission granted + services off | Tap current location/manage | Open location settings guidance | P0 | Manual | `src/services/LocationAccessService.ts` |
| TC-015 | Location fallback | Remembered location fallback | Last-known saved | Fail live GPS then fallback | Last-known usable and labeled | P0 | Hybrid | `src/viewmodels/DirectionsViewModel.ts` |
| TC-016 | Settings | Manage permission action | Settings open | Tap Location Permission row | Request/open settings correctly | P0 | Hybrid | `src/viewmodels/SettingsViewModel.ts` |
| TC-017 | Search/GIS | Search Block 2 | Home loaded | Search `Block 2`/`B2` | B2 result selectable | P0 | Hybrid | `src/services/SearchService.ts` |
| TC-018 | Search/GIS | Search Member Masjid | Home loaded | Search `Member Masjid` | B2 result appears | P0 | Hybrid | `src/services/SearchService.ts` |
| TC-019 | Search/GIS | Search C1/C2/C3/C4 | Home loaded | Search each gate id | Gate result appears + routeable | P0 | Hybrid | `src/constants/data.ts` |
| TC-020 | Directions | Current-location origin | Destination chosen | Tap Use My Current Location | Valid start or clear fallback | P0 | Hybrid | `src/viewmodels/DirectionsViewModel.ts` |
| TC-021 | Directions | Manual start flow | Destination chosen | Search/select manual start | Route recalculates | P0 | Manual | `src/views/screens/DirectionsScreen.tsx` |
| TC-022 | Directions/UX | Keyboard behavior | Small device | Open keyboard + scroll + select | No clipping/tap dead zones | P0 | Hybrid | `src/views/screens/DirectionsScreen.tsx` |
| TC-023 | Directions | Same start/destination | Origin=destination | Compute route | Shows explicit same-point error | P0 | Hybrid | `src/viewmodels/DirectionsViewModel.ts` |
| TC-024 | Directions | Outside Ijtema start | GPS outside venue | Compute route | Blocks route + clear message | P0 | Hybrid | `src/services/RoutingService.ts` |
| TC-025 | Directions | No route found | Invalid pair simulated | Calculate route | Safe error state, retry available | P0 | Hybrid | `src/viewmodels/DirectionsViewModel.ts` |
| TC-026 | Directions | Route timeout | Force slow calc | Calculate route | Timeout handled gracefully | P0 | Hybrid | `src/viewmodels/DirectionsViewModel.ts` |
| TC-027 | Navigation | Start Navigation | Valid route ready | Tap Start Navigation | Navigation screen opens with route | P0 | Manual | `src/views/screens/NavigationScreen.tsx` |
| TC-028 | Navigation | Mute toggle | Active nav | Tap mute/unmute | Voice toggles reliably | P0 | Hybrid | `src/services/VoiceService.ts` |
| TC-029 | Navigation | Recenter | Active nav | Pan map then tap recenter | Camera recenters on user | P0 | Manual | `src/views/screens/NavigationScreen.tsx` |
| TC-030 | Navigation | Exit | Active nav | Tap Exit | Navigation stops and returns main | P0 | Hybrid | `src/viewmodels/NavigationViewModel.ts` |
| TC-031 | Navigation | Android back | Active nav on Android | Press hardware back | Confirmation shown, no abrupt exit | P0 | Manual | `src/views/screens/NavigationScreen.tsx` |
| TC-032 | Settings | Settings toggles | Settings open | Toggle visible options | Values update + persist | P0 | Hybrid | `src/store/useAppStore.ts` |
| TC-033 | Settings | Distance unit behavior | Route displayed | Switch meters/feet | Distances update correctly | P1 | Hybrid | `src/services/InstructionService.ts` |
| TC-034 | Settings | Walking speed ETA | Route comparison | Switch speed presets | ETA changes accordingly | P0 | Hybrid | `src/services/RoutingService.ts` |
| TC-035 | Settings | Map style behavior | Key/network valid | Toggle map style | Home/Directions/Navigation reflect style | P1 | Hybrid | `src/views/screens/*` |
| TC-036 | Help | App Guide | Settings open | Open guide + scroll | All guide sections visible | P0 | Hybrid | `src/views/screens/AppGuideScreen.tsx` |
| TC-037 | Map config | Missing maps key fallback | Key unset | Open map screens | Safe fallback text/UI shown | P0 | Hybrid | `src/services/MapConfigService.ts` |
| TC-038 | Theme | Dark/light mode | Toggle available | Toggle and navigate | No unreadable controls | P1 | Manual | `src/services/useTheme.ts` |
| TC-039 | Localization | Urdu/language behavior | Toggle available | Switch language | Voice switches + Urdu renders clean | P1 | Manual | `src/store/useAppStore.ts` |
| TC-040 | Home/UX | Small Android screen | Small device | Open Home + search/chips | No overlap/clipping | P0 | Manual | `src/views/screens/HomeScreen.tsx` |
| TC-041 | Performance | Low-end Android perf | Low-end device | Route + nav session | No severe frame drops/crashes | P1 | Manual | `src/views/screens/NavigationScreen.tsx` |
| TC-042 | GPS | Weak GPS handling | Low accuracy signals | Active navigation | Weak GPS banner + stable behavior | P0 | Hybrid | `src/viewmodels/NavigationViewModel.ts` |
| TC-043 | Routing | Route smoke all blocks | Graph loaded | Execute route-smoke tests | Block-to-block smoke passes | P0 | Automated | `scripts/test-route-smoke.ts` |
| TC-044 | Routing | Graph validation | Graph loaded | Execute graph validation | No critical graph errors | P0 | Automated | `scripts/test-graph-validation.ts` |
| TC-045 | Security | Secret leakage scan | Repo clean | Run map-config scan | Tracked files contain no real key; local .env allowed | P0 | Automated | `scripts/test-map-config.ts` |
| TC-046 | TypeScript | Editor/TS health | Dependencies installed | Run app+scripts typechecks | No TS errors in app/scripts configs | P0 | Automated | `tsconfig.json`, `tsconfig.scripts.json` |
