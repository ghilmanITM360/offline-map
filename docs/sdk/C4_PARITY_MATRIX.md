# C4.1 host-versus-SDK parity matrix (#392)

Characterization only: no host production code was changed to produce this document. Source locations are at commit `001cd8f`
(`H` = Ijtema host, `S` = `packages/offline-navigation/src`). Verdict per row: **SAFE** (the SDK already behaves the same or stronger),
**IMPLEMENT** (the SDK lacks essential behavior; add it SDK-side first), **BLOCKED** (needs a product decision, data or owner input).

## What was measured

`src/__tests__/SdkHostLiveParity.test.ts` replays 36 seeded Ijtema walks (random gate → block pairs, 1.4 m/s, 1 Hz, ±2 m lateral noise,
accuracy 8 m) through the host's `calculateNavigationProgressV2` + `calculateLiveManeuverDistanceV2` and through
`createNavigationController` (explicit Live → `ingestFix`) on the same graph:

| Measure | Result |
| --- | --- |
| Route length, host preview vs SDK route | identical on 36/36 (same graph, same A\*) |
| Both engines reach arrival | 36/36 |
| Step index ever moves backwards | 0/36 in either engine |
| Progress difference before arrival | max 8.5 m, median 1.5 m |
| Arrival fix index difference | at most 6 fixes (about 8 m of walking), either direction |

The differences come from the projection method (host: planar degrees; SDK: local tangent plane) and the arrival point (host: the
destination coordinate; SDK: the route's final node). The SDK freezes progress at arrival (the authority boundary); the host keeps
projecting, so progress must only be compared up to arrival. These bounds describe today's behavior; they are **not** a claim of
numeric equivalence. The test pins them so a later migration cannot widen them silently.

## Matrix

| # | Behavior | Host (file:line) | SDK (file:line) | Equivalence | Regression evidence | Missing in SDK | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Directory → destination | `HomeScreen.tsx` directory + `useAppStore` `directoryPurpose`; destination types gate/block/rasta/facility/special_route (`NavigationViewModelV2.ts:82`) | `NavigationController.selectDestination` `:531`; `venueAdapter.ts` exposes **gates and blocks only** | Different: the SDK venue cannot name rastas, facilities or special routes | `DirectionsPreviewSession`, `venueAdapter` contract (`test:venue-contract`) | Venue places for rasta/facility/special route; intent consumption (`destinationJourneyIntent`) | IMPLEMENT (venue model) / host keeps the directory UI |
| 2 | Manual origin | `DirectionsViewModel.ts:326-365` (`manualStart`, `isPlaceStart`); also remembered, last-known and hypothetical origins | `selectOrigin` `:545`, `originSource` `manual_place \| live_gps` | Same for gates/blocks; host has three more origin sources | `DirectionsPreviewSession.test.tsx` | Remembered/last-known/hypothetical origins (host-only, no SDK need) | SAFE for gate/block; others stay host |
| 3 | Offline route (inside venue) | `RoutingServiceV2.ts:502` `findBestVenuePath(venueGraph, …)` | `NavigationController.ts:201,280` `findBestVenuePath` | Same function, same graph; 36/36 identical lengths | `test-navigation-v2`, 91,506 goldens, 2,400 differential | none | SAFE |
| 4 | Route preview states | `DirectionsViewModel.ts:312-577` (loading, ready, error, needs_origin, same_place; keeps the previous route on screen while refreshing the same trip; `ROUTE_TIMEOUT_MS` on the legacy path) | `calculate` `:265` | Same states; the host keeps a ready route while refreshing, the SDK clears it; the SDK has no calculation timeout | `DirectionsPreviewSession.test.tsx` | Refresh-without-flicker; a finder timeout (an async `findRoute` that never settles leaves `loading`) | IMPLEMENT (finder timeout) |
| 5 | Manual Guide | `useAppStore.ts:514-525` `routeGuide` | `startGuide` `:551`, phase `guide` | Equivalent | `NavigationController` suites | none | SAFE |
| 6 | Previous / Next | `setRouteGuideStep` clamps `useAppStore.ts:519` | `stepTo` `:517` returns false at the ends | Equivalent (SDK stricter: no-op signalled) | `RouteGuideCard` tests | none | SAFE |
| 7 | Permission + fresh fix | `LocationAccessService.resolveCurrentLocation(true)` `:67`; iOS accuracy `IOSLocationPrecision.ts` | `requestLive` `:444-495` over `NavigationLocationAdapter` | Same policy (`evaluateLocationCapability` is the shared domain function) | `LocationCapability` tests, C3 native runs | A host adapter wrapping `LocationAccessService` (not written) | SAFE (needs adapter) |
| 8 | Explicit Manual → Live confirmation | `useManualLiveUpgrade.ts` `requestLiveUpgrade` → `confirming` → `confirmLiveUpgrade` | `NavigationScreen.tsx:265-275` card → `requestLive` | Equivalent confirm step | `ManualLiveUpgradeSession.test.tsx`, `DirectionsManualLiveUpgrade.test.tsx` | none | SAFE |
| 9 | **Candidate route preview before Live** | `useManualLiveUpgrade.ts:112-124` publishes a preview and waits; `startUpgradedNavigation` `:127` is a second explicit Start | `requestLive` `:494` commits Live in the same call | **Different, and the host is safer**: the walker sees the live route before committing; the card's `preview` phase is unused by the SDK screen (`NavigationScreen.tsx:248`) | `ManualLiveUpgradeSession.test.tsx` | Candidate state + explicit confirm/cancel in the controller and screen | IMPLEMENT (C4.2-a) |
| 10 | Stale GPS rejection | `NavigationViewModelV2.ts:546-555` historical-fix gate; capability age `MAX_LIVE_FIX_AGE_MS` | `ingestFix` `:391` + `evaluateLocationCapability` | Same constants (2 s tolerance, shared domain policy) | `NavigationViewModelV2ProgressFreshness.test.ts`, `GpsFreshness` | none | SAFE |
| 11 | Reduced / denied permission | `currentLiveCapability` `NavigationViewModelV2.ts:50`; `startPreviewNavigationV2` `:116-143` | `requestLive` `:471`, `LiveStartBlocker` | Same blockers; neither auto-starts Live | `LocationCapability`, consumer deny run (Android) | none | SAFE |
| 12 | GPS loss and recovery | poll `NavigationViewModelV2.ts:326-347` (8 s); weak/lost `:515-531` | `tick` `:560`, driven by `NavigationProvider.tsx:32` at 1 s; `setSignal` | Same 8 s, same weak/lost rules | `test:gps-signal-loss-v2`, `NavigationViewModelV2GpsFreshness` | none | SAFE |
| 13 | Progress and continuity | `V2NavigationRuntimeService.ts` `calculateNavigationProgressV2` over `RerouteService.projectProgressMetersOnRoute` | `RouteProgress.advanceProgress` / `projectOnRoute` | **Measured**: ≤ 8.5 m (median 1.5 m) before arrival; same forward cap (3× speed + 25 m), 15 m backtrack, switch margin | `RerouteSnapContinuity`, `test:navigation-progress-v2`, `SdkHostLiveParity.test.ts` | none | SAFE within measured bounds; swapping host math is a numeric change (see C4.3) |
| 14 | Reroute thresholds and cooldown | `RerouteService.ts:13-35` (30–80 m, ≥3 fixes or 9 s, 12 m moved, 25 s cooldown) | `RouteProgress.ts` `offRouteThresholdM`, `shouldTriggerReroute`, `REROUTE_COOLDOWN_MS` | Numerically identical duplicates | `test:reroute-v2` | none | SAFE (delete host duplicates, C4.3-a) |
| 15 | Concurrent route requests | `NavigationViewModelV2.ts:380-388` journey request + `rerouteRequestInFlightRef` + `OutsideRouteRequestCoordinator`; explicit reroute bypasses the in-flight guard `:379` | `NavigationSession.beginRequest`; `reroute` `:345`; one reroute at a time `:432` | Equivalent for automatic reroute; the SDK has no **explicit** reroute (retry after a failed outside route, gate change) | `NavigationViewModelV2RerouteSession.test.tsx`, `NavigationSession` suites | Explicit `reroute` command | IMPLEMENT (C4.2-c) |
| 16 | Arrival latch and radius | `isArrived` `NavigationViewModelV2.ts:68-80`, latch `:604-610` (20 m, final segment) | `isArrivedAtDestination`, latch `:422-428` (20 m, last two steps) | Both latch, both cancel in-flight reroutes; arrival fix differs ≤ 6 fixes (above) | `NavigationViewModelV2ArrivalAuthority`, `NavigationEngineArrivalOwnership`, `...ArrivalMarker` | none | SAFE |
| 17 | Exit, cancel, new route | `handleExit` `:675`, `stopNavigation` `useAppStore.ts:492`; unfinished-journey clearing `:671` | `exit` `:568`, `endTrip` `:309`, `selectDestination` ends the previous trip | Equivalent; the unfinished-journey/process-death store (#139) is host persistence and stays in the host | `NavigationViewModelV2ArrivalExitReset`, `…Idle` | none | SAFE |
| 18 | Background / foreground | `NavigationViewModelV2.ts:359-375` marks lost if stale, new boundary, **`GPSManagerService.forceFix()`**; `GPSManagerService.ts:63-75` stops the watch in background | `resume` `:497` new boundary, restarts the watch, marks lost if stale, never fetches a fix | The host recovers faster (forces one fresh fix); the SDK waits for the watcher | `test-navigation-background-resume`, `GPSWatchLifecycle` | A fresh-fix request on resume (via the adapter's `getCurrentFix`) | IMPLEMENT (C4.2-d, minor) |
| 19 | **Outside-venue routing** | `V2DirectionsService.calculateHybridPreview` `:155`; reroute outside `NavigationViewModelV2.ts:397-431`; `EntryGateRoutingService.isInsideIjtemaArea` `:131`; `direct-guide` carries no live authority | `requestLive` blocks `outside_venue` `:484`; `reroute` keeps the route when no node is near `:355` | **Different: the SDK has no outside capability** | `HybridOutsideRouteProviders`, `OutsideRouteRequestCoordinator`, `ProductionOutsideRouteSource`, `NavigationViewModelHybrid` | Injected outside-route provider (typed result, abort signal, `directGuide` flag that can never become Live) | IMPLEMENT (C4.2-b) |
| 20 | Gate selection, unsupported connections | `manualGateId` `NavigationViewModelV2.ts:202`, `selectOutsideGate` `:495`, `getRoutableOfficialGates` (`entryPolicy.ts:30`); Gates 18/19 not routable | `GateChooser` is a UI leaf only (`ui/GateChooser.tsx`); not composed | The SDK cannot choose an entry gate | `NavigationViewModelV2ManualGateRetention`, `test:navigation-graph-v2` | Gate option in the outside capability; the data stays as surveyed (Gates 18/19 are **not** connected and must not be) | IMPLEMENT with 19; connectivity BLOCKED on survey |
| 21 | Language, RTL, step presentation | `localizeInstruction` (`i18n/instructions`), `V2NavigationInstruction.text`; Urdu | `RouteStepCopy.describeRouteStep`; English copy only; RTL verified natively (C6.1) | Not equivalent: step vocabularies differ and Urdu is unreviewed | RTL regression tests (C6.1) | Reviewed Urdu/Roman Urdu | BLOCKED (owner-reviewed copy); the host keeps its own presentation |

## Rows with no SDK counterpart (stay in the host)

Voice instructions (`VoiceService`, `NavigationViewModelV2.ts:621`), the `useAppStore` journey persistence and unfinished-journey
recovery, `useNavigationExitConfirmation` (system Back), map overlay components, and the legacy V1 engine (`NavigationViewModel.ts`),
which the V2 flag already supersedes.

## Delegation conclusion

* A wholesale swap of `NavigationViewModelV2` for `NavigationController` is **not safe** and is not attempted. The host's route object
  (`V2ActiveRoute`: rastas, facilities, special routes, outside hybrid geometry, arrival marker) is consumed by 27 source and test files (the store, the map
  overlay and 22 test files), and the SDK controller owns a different route model. Two authorities would coexist or behavior would
  change; neither is acceptable without device acceptance.
* What *is* safe and removes real duplication: (a) the numeric policy duplicates (rows 14, 16 constants, 10, 12), delegated to the
  SDK exports with an equality test (C4.3-a); (b) every SDK gap above that is essential for the SDK as a product (rows 9, 15, 18, 19, 20)
  is implemented SDK-side with failing tests first (C4.2).
* Swapping the host's progress projection (row 13) is a numeric change of up to 8.5 m; it is left in place until the owner accepts that
  against field data. The characterization test keeps both engines honest in the meantime.
