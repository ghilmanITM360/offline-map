# Technical Screen Inventory

Audit baseline: `integration/ijtema-clean-baseline` at `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.

The application has one root native stack and one nested drawer. `RootNavigator.tsx:25-40` defines the routes; `RootNavigator.tsx:47-57` registers the drawer; `RootNavigator.tsx:80-89` registers the stack.

| Screen / route | Source | Registration / render condition | Reachability and state | Direct automated coverage |
|---|---|---|---|---|
| Splash | `src/views/screens/SplashScreen.tsx:23-246` | Initial stack route, `RootNavigator.tsx:82` | Cold start; dispatches onboarding/startup destination | `SplashScreen.test.tsx`, `StartupManager.test.ts`; source-contract scripts |
| Welcome | `src/views/screens/WelcomeScreen.tsx:20-126` | Stack route, `RootNavigator.tsx:83` | First-run onboarding | No rendered component test found |
| Permission | `src/views/screens/PermissionScreen.tsx:13-143` | Stack route, `RootNavigator.tsx:84` | Onboarding location permission branch | ViewModel test only (`PermissionViewModel.test.ts`) |
| Download Map | `src/views/screens/DownloadMapScreen.tsx:38-485` | Stack route, `RootNavigator.tsx:85`; drawer labels it Offline Maps | Onboarding/download and later drawer entry | Script/source-contract coverage; no rendered component test found |
| Locations Directory | `src/views/screens/LocationsDirectoryScreen.tsx:35-381` | Stack route, `RootNavigator.tsx:86` | Normal browse entry and return target after completion | `LocationsDirectoryScreen.test.tsx` |
| Main / Home map | `src/views/screens/HomeScreen.tsx:165-2081` | Stack route containing drawer, `RootNavigator.tsx:87`; drawer Home route at line 53 | Single map-first surface; Browse, Details, Directions, Route Preview, Navigation and Arrival are modes/overlays, not separate registered screens | `HomeScreen*.test.tsx`, `HomeViewModel.test.tsx`, numerous scripts |
| Settings | `src/views/screens/SettingsScreen.tsx:53-468` | Drawer route, `RootNavigator.tsx:54` | Drawer Settings | Source-contract script only; no rendered screen test found |
| Help | `src/views/screens/HelpScreen.tsx:14-260` | Drawer route, `RootNavigator.tsx:55` | Drawer Help & Feedback | No rendered component test found |
| About | `src/views/screens/AboutScreen.tsx:15-260` | Drawer route, `RootNavigator.tsx:56` | Drawer About Ijtema Map | No rendered component test found |
| App Guide | `src/views/screens/AppGuideScreen.tsx:138-320` | Stack route, `RootNavigator.tsx:88` | Settings help entry | Source-contract script only; no rendered component test found |

## Home surface modes and conditional states

| State | Source condition | Runtime reachability |
|---|---|---|
| Browse | Default Home mode | Verified on trusted build (`04-map.png`) |
| Place preview | Selected place; `HomeScreen.tsx:1827-1853`, `LocationSheet` mode `preview` | Reachable from map/search/directory; not yet independently captured in this pack |
| True details | Home mode `DETAILS`; `HomeScreen.tsx:321-326,1827-1853`, sheet mode `details` | Source audited; runtime not yet verified |
| Directions / route calculation | `LocationSheet` direction setup and calculation states | Source/test verified; runtime not yet independently verified |
| Route preview | Active preview route; `HomeScreen.tsx:1818-1824`, sheet mode `routePreview` | Historical clean-build evidence exists; current-build independent runtime pending |
| Active navigation | `mode === 'NAVIGATION'`; `HomeScreen.tsx:1338-1339,1557-1558` | Environment blocked because no fresh fix reached app |
| Arrival | `mode === 'ARRIVAL'`; same map/chrome gates as navigation | Environment blocked |
| Layers modal | `layersSheetVisible`; `HomeScreen.tsx:1865-1883` | Source audited; runtime pending |
| Location tutorial | `showLocationTutorial`; `HomeScreen.tsx:1713-1718` | Conditional first-use state; runtime pending |
| Map/offline/outside banners | `HomeScreen.tsx:867-879,1602-1641` | Graph-only key warning verified on current build |
| Alerts | Recenter unavailable, outside venue, last-known, manual-start guidance, cancel route, satellite offline, start rejection | Source audited; current-build Location unavailable alert verified |

## Registration conclusion

No additional registered React Navigation screens were found outside `RootNavigator.tsx`. Navigation, arrival, route preview, sheets, banners and alerts are conditional states on the shared Home map, consistent with the architecture contract.
