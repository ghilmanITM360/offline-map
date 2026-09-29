# #139 - Active journey lost after Android process death: source trace and design

**Status: PROPOSAL, awaiting the owner's choice of Option A or B. No recovery policy is implemented.** Basis: source at canonical `4b17fcb`; line numbers are as of that commit and will drift. Evidence level for every statement below: **SOURCE INSPECTED** unless marked otherwise. Nothing here has been device-reproduced (matrix row LOC-LIFECYCLE-003 says the same). Paths are relative to the repo root; `useAppStore.ts` = `src/store/useAppStore.ts`.

## 1. Source-level failure statement

Active navigation lives entirely in memory: the zustand fields `isNavigating`, `navigationSessionId`, `destination`, `activeRoute`, `routeInstructions`, `reroutePending` (`useAppStore.ts:124-135`, defaults `373-391`) plus React state/refs inside `NavigationViewModelV2` (`arrived`, `currentStepIndex`, `progressRef`, reroute cooldown, off-route evidence, GPS-signal state, `manualGateId`; `NavigationViewModelV2.ts:111-176`). The persist `partialize` allowlist (`useAppStore.ts:513-533`) contains none of them. When Android kills the process (no foreground service exists, so a backgrounded navigating app is a normal kill candidate: manifest declares only fine/coarse location, `AndroidManifest.xml:2-3`; `GPSManagerService` stops the watch on any non-`active` AppState, `GPSManagerService.ts:62-69`), the next launch starts a fresh JS runtime, hydrates only the allowlist, and boots through `Splash -> StartupManager -> LocationsDirectory`. The user gets a generic directory with no route, no destination and no indication that a journey was in progress. That is the whole defect: a **silent loss**, not a stale resume. The user-visible harm is a pedestrian mid-walk (elderly user base per comments in `V2NavigationRuntimeService.ts`) who reopens the app and must rediscover their destination from scratch.

## 2. Trace: what is persisted vs lost

Persisted store key `ijtema-app-store`, AsyncStorage (`useAppStore.ts:470-472`), `version: 2`. Written on **every** `set()` (zustand 4.5.7 `node_modules/zustand/middleware.js:493-507`: full `partialize` blob re-serialized after each set). During navigation that is roughly 1 Hz, because each GPS fix goes through `setCurrentLocation` (`useAppStore.ts:343-351`). A write in flight when the process is killed can be lost, so the persisted `lastKnownLocation` is "last flushed", not "last fix".

| State | Persisted? | Evidence | Consequence after process death |
|---|---|---|---|
| `isNavigating`, `navigationSessionId`, `destination`, `activeRoute`, `routeInstructions`, `reroutePending` | No | absent from `partialize` `513-533` | back to defaults `373-391`; `navigationSessionId` restarts at 0 |
| `arrived` (arrival latch) | No (React `useState`) | `NavigationViewModelV2.ts:116`; V1 `NavigationViewModel.ts:45,54` | ARRIVAL mode cannot be resurrected; `deriveMapMode` reads `arrived` (`useMapMode.ts:39`) |
| Reroute state (cooldown `lastRerouteAtRef`, off-route refs, `rerouteRequestInFlightRef`, `rerouteStatusMessage`) | No (refs/state) | `NavigationViewModelV2.ts:145-176`, `40` | reset; per-trip reset semantics already exist (#113/#111 at `:200`, `:177`, `:533`) |
| `manualGateId` / manual gate | No (local state), but the choice is **embedded in the route object** (`origin.manuallySelectedGate`, `origin.gateId`, `models/types.ts:313-322`) and re-derived from it at `NavigationViewModelV2.ts:205` | route not persisted, so lost |
| `routePlannerOrigin` (manual origin override), `routePlannerDest`, `routeAlternatives`, `selectedRouteIndex`, `routeSelectionMode` | No | absent from `partialize` | lost. `migrate` sanitizes `routePlannerOrigin/Dest/selectedPlace` (`useAppStore.ts:506-509`) but they are never written, so that is dead for current blobs |
| `selectedPlace`, `pendingDirectorySelection`, `searchQuery/Results` | No | absent | lost |
| Cached route preview | No (`activeRoute` doubles as preview, `HomeScreen.tsx:348-351`) | | lost |
| `currentLocation`, `currentLocationSource`, `snappedLocation` | No | absent | null on relaunch |
| `lastKnownLocation` + `lastKnownLocationUpdatedAt` | **Yes** | `useAppStore.ts:521-522`; written at `348-349` for any source except `remembered`/`manual` | hydrated; see section 4 |
| `recentSearches` (max 10 `Place` snapshots) | Yes | `519`, `433` | hydrated; only rendered as a list, re-resolved by id in `LocationsDirectoryScreen.tsx` (`recentPlaces` memo, #99) |
| `favorites`, `settings` (incl. `language`, `walkingSpeed`, `autoReroute`), `offlineData`, `downloadState`, layer toggles, `hasSeenMapOverview`, `hasSeenLocationTutorial` | Yes | `513-533` | hydrated |
| `isMuted` | No | absent | resets to false (minor: a muted user is un-muted after death; out of scope) |

Other AsyncStorage keys (all onboarding/offline-map flags, none nav-related): `ijtema.onboarding.welcome_seen.v1`, `ijtema.onboarding.location_permission_skipped.v1` (`OnboardingStatusService.ts:8-9`), `ijtema.offline_map.{manifest,downloaded,graph_only_mode,skipped_online_mode}.v1` (`OfflineMapStatusService.ts:11-14`).

Activity/back-stack state is not restored either: `MainActivity.kt:19` calls `super.onCreate(null)` (discards `savedInstanceState`), `App.tsx:21-24` mounts `NavigationContainer` without `initialState`, and `RootNavigator.tsx:89-97` always begins at `Splash`. So even OS task restore lands on Splash.

Good precedent already in the code: `SplashScreen.tsx:132-135` reconciles persisted transient `downloadState` (`downloading/connecting` -> `idle`) after a cold start. Cold-start reconciliation of in-flight state is an accepted pattern here.

## 3. Startup path on relaunch (which screen the user lands in)

1. `RootNavigator` renders `Splash` (`RootNavigator.tsx:89-90`); `GPSManagerService.setStoreUpdater(setCurrentLocation)` is wired at `:73-75`.
2. `SplashScreen.tsx:93-115` runs `Promise.all` including `waitForStoreHydration` (`:114`; impl `useAppStore.ts:559`, 5 s cap, success/failure/timeout/aborted). Splash is the single hydration gate for everything downstream (comment `:103-113`).
3. `StartupManager.resolve` (`StartupManager.ts:39-72`): for a returning user with permission and a downloaded map -> `LocationsDirectory` (`:48-50`); graph-only/skipped-online/offline+no-map also -> `LocationsDirectory`; corrupt/needs_update -> `DownloadMap`; permission missing and not skipped -> `Permission` (`:44`). Splash then `navigation.replace(route)` (`SplashScreen.tsx:182-188`).
4. Emulator evidence already on file (UX-001, `docs/audit/ui-ux/UX_REQUIREMENT_MATRIX.md:23`): force-stop + relaunch landed on `LocationsDirectory`.
5. From the directory, picking a place sets `pendingDirectorySelection` and `navigation.replace('Main')` when there is nothing to go back to (`LocationsDirectoryScreen.tsx:113-126`). `HomeViewModel` consumes it (`HomeViewModel.ts:194-197`) into the normal place-select flow (PLACE_SELECTED sheet), never into navigation.
6. On Home, `hasSeenMapOverview` is true for a returning user, so the cold-launch camera calls `MapStartupController.resolveReturningLaunchCamera` (`HomeScreen.tsx:552`; impl `MapStartupController.ts:95`, 4 s timeout, accepts only `source==='live'`, `isLiveCoordinate` `:43`). It **never** animates to the persisted coordinate. If live GPS resolves, `commitStartupLiveLocation` does `setCurrentLocation(coord,'live')` (`HomeScreen.tsx:522-533`); otherwise the camera fits the venue bounds.

So the user lands on **LocationsDirectory**, then Home in EXPLORE mode with no route. The permission-revoked case lands on Permission with the hedged "may have been turned off" copy (#153), unrelated to nav state.

## 4. GPS state on relaunch and the freshness guards

- `currentLocation` is null after hydrate. `lastKnownLocation` (a full `Coordinate`, including `accuracy` and the native `observedAtMs`, because `GPSManagerService.publishFix` stamps it at `GPSManagerService.ts:149` and `setCurrentLocation` stores the same object) and `lastKnownLocationUpdatedAt` (ISO string of **callback arrival**, `useAppStore.ts:346,349`, not fix time) are hydrated.
- **Can it be mistaken for a fresh fix? Structurally no**, by four independent guards:
  1. `LocationNavigationCapability.ts` gates *Start*: `remembered_location`/`device_last_known`/`manual_place` are never startable (`:34-46`); a live coordinate must have accuracy <= 50 m (`:28,62`) and `observedAtMs` present and within 30 s (`:29,69-75`). A hydrated coordinate carries the old `observedAtMs`, so it fails the age check even if mislabelled as live; a coordinate with **no** `observedAtMs` also fails (`== null` at `:70`).
  2. `DirectionsViewModel`: `resolveInitialStartSource` maps no-location to `manual_place` and `remembered` to `remembered_location` (`:39-46`); `chooseRememberedLocation` (`:509-527`) is an explicit user action that calls `setCurrentLocation(lastKnownLocation,'remembered')` (`:518`) with the `remembered` label, and `canStartNavigation` is then false (`:590-596`, via the capability above). The UI discloses age with `formatLastKnownAge` (`utils/formatLastKnownAge.ts:6-14`; negative/NaN age -> "from an earlier session").
  3. Home: `canUseRemembered` + "Use remembered location" alert is opt-in only (`HomeViewModel.ts:238-279`), again tagged `remembered`.
  4. Cold-launch camera ignores it (section 3, step 6; covered by `HomeScreenColdLaunchCamera.test.tsx:270-286`).
- `setCurrentLocation` rejects non-finite/out-of-range fixes (`useAppStore.ts:345`, `isValidCoordinate.ts`; #147) and `publishFix` does too (`GPSManagerService.ts:138`). **Gap:** rehydrate does not re-run `isValidCoordinate` on the persisted `lastKnownLocation` (no `merge`/`migrate` validation for it; `JSON.stringify(NaN)` writes `null`). Impact is limited because every consumer is opt-in/label-gated, but any restore logic that reads it must validate.
- `lastKnownLocationUpdatedAt` is **overwritten on the first live fix after relaunch** (`348-349`; Home's follow watch starts as soon as permission+map ready, `HomeViewModel.ts:123,143-148`). Any "journey age" derived from it after relaunch is garbage. A persisted journey needs its own timestamps.
- Live-fix primitives to reuse: `LocationAccessService.resolveCurrentLocation(false)` (`LocationAccessService.ts:74`; `getCurrentPositionAsync` Balanced with a 15 s timeout `:16,122-127`; falls back to `getLastKnownPositionAsync` with maxAge 30 s / 50 m and returns `source:'device_last_known'` `:11-12,142-160`, which a resume path must reject like `isLiveCoordinate` does); `GPSManagerService.forceFix()` (`:169-181`, `High` accuracy, publishes through the store updater); `evaluateNavigationLocationCapability`; `STALE_FIX_CLOCK_TOLERANCE_MS = 2000` (`constants/navigation.ts:38`) and the V2 VM's watcher-generation `isHistoricalFix` filter (`NavigationViewModelV2.ts:133,418-423`) which already rejects a cached fix whose own timestamp predates the trip/resume boundary.
- **V1 has none of those runtime guards** (grep for `observedAtMs|STALE_FIX|GPS_LOST|AppState|forceFix` in `NavigationViewModel.ts` is empty).

## 5. V1 vs V2 navigation VMs (what matters for #139)

| | V2 `NavigationViewModelV2` | V1 `NavigationViewModel` |
|---|---|---|
| Active gate | `route = isNavigating && isV2ActiveRoute(activeRoute)` (`:105`); pinned by architecture-audit Finding 6 (`scripts/test-navigation-architecture-audit.ts:218`) | keyed on `destination`, ignores a v2-shaped `activeRoute` (`:104`); if `destination` set but no `activeRoute` it **recomputes** a route from `routePlannerOrigin ?? currentLocation` (`:112-136`) |
| Per-trip reset | keyed on `navigationSessionId` (`:175-206`): progress, refs, cooldown, manual gate | keyed on `destination` change (`:66-82`) |
| Stale-fix defence | watcher-generation boundary + `isHistoricalFix` (`:133,418`), resume `forceFix` (`:264-277`), `GPS_LOST` (`:236-258`) | none |
| Restore-relevant | any restore must call `startNavigation()` so `navigationSessionId` bumps and refs reset. Progress restarts at 0 and the first accepted fix re-projects (`calculateNavigationProgressV2`, forward-jump cap only applies once `previousObservedAtMs` is set) | V1 would recompute from `currentLocation`/`initialLocationRef` - the exact "stale origin" hazard if `currentLocation` were ever a remembered fix |
| Reachability in default build | flags default **true** (`MapFeatureFlagsService.ts:9-28`, `.env.example:3-5`) | V1 places are dropped at hydration when `useIjtemaV2Map()` is true (`sanitizePersistedPlace`, `useAppStore.ts:32-36`), so V1 journeys are effectively unreachable; only an emergency flags-off rollback exercises it |

Recommendation: scope any #139 work to **V2 only**; under a V1 rollback, do nothing (documented limitation).

## 6. Can the CURRENT code resume stale state silently? Confirmed: no

- `isNavigating` is written to `true` in exactly one place, `startNavigation` (`useAppStore.ts:376-383`); architecture-audit 6a pins exactly three `isNavigating:\s*(true|false)` assignments in the store (initial, start, stop). `startNavigation(` has exactly two production callers: `HomeScreen.tsx:1198` (`handleStartPreviewNavigation`, user tap on Start, after `canStartActiveNavigation` `:1180-1188`) and `DirectionsViewModel.ts:552` (V1 `handleStartNavigation`, user tap).
- Nothing derived from `selectedPlace + lastKnownLocation` starts navigation: `selectedPlace` is not persisted; the Start path needs a computed preview (`activePreviewRoute` requires `routePlannerDest` + a v2 `activeRoute`, `HomeScreen.tsx:348-351`, both non-persisted) and passes the capability gate (live, fresh, <= 50 m, fine permission).
- Persisted `recentSearches` only populate lists.
- **Latent hazard (not a current defect):** zustand's default `merge` is shallow `{...current, ...persisted}` with no allowlist (`middleware.js:479-481`, then `set(stateFromStorage, true)` at `:539`). If any future `partialize` change, or any blob from an older/other build, contained `isNavigating:true`/`activeRoute`, hydration would set it **without** passing `startNavigation`, `canStartActiveNavigation` or the freshness gate. Git history shows nav state was never persisted (`git log -S` on `isNavigating: state.isNavigating` and `activeRoute: state.activeRoute` in `useAppStore.ts` returns nothing), so no legacy blob carries it. `migrate` only runs on a version mismatch (`middleware.js:507-527`) and does not strip keys either. Existing guards do not catch a `partialize` regression: audit 6a's regex matches literal `true|false`, not `isNavigating: state.isNavigating`.

## 7. Reusable primitives for validation

| Primitive | Where | Use |
|---|---|---|
| `evaluateNavigationLocationCapability` (30 s age, 50 m accuracy, coarse gate, remembered blocked) | `LocationNavigationCapability.ts:28-77` | the fresh-fix gate for any resume; already unit-tested (LOC-05/06/10) |
| `LocationAccessService.resolveCurrentLocation(false)` + reject non-`live` source | `LocationAccessService.ts:74`; pattern `MapStartupController.isLiveCoordinate :43` | acquire the fresh fix |
| `MapStartupController.resolveReturningLaunchCamera` shape | `MapStartupController.ts:95` | template for a bounded one-shot "resolve fresh location or give up" (4 s timeout, late result discarded) |
| `V2NavigationAdapter.canStartActiveNavigation` (flags, routable destination, coords >= 2, distance > 0) and `isV2ActiveRoute` | `V2NavigationAdapter.ts:151-209` | structural validity of a cached route/destination |
| `V2ActiveRoute.metadata.graphVersion` vs `IJTEMA_NAVIGATION_GRAPH_V2.metadata.version` | `V2NavigationAdapter.ts:251`, `models/types.ts:344-349` | reject a route built against a different graph |
| `V2PlaceAdapter.getPlaceById` | used by `sanitizePersistedFavorite` `useAppStore.ts:45-48` and directory recents | re-resolve destination by id (drops removed/renamed) |
| `RerouteService.projectProgressMetersOnRoute` + `getDynamicOffRouteThresholdMeters` | `RerouteService.ts:57,15` | "is the fresh fix still on the cached route" |
| Rebuild from a fresh origin: `V2DirectionsService.calculateHybridPreview` (wraps `RoutingServiceV2.prepareOutsideRoutingPlan` -> provider -> `finalizeOutsideRoutingPlan`, `V2DirectionsService.ts:147-262`) for outside; `V2DirectionsService.calculatePreview` / `RoutingServiceV2.calculateRoute` for inside; `buildV2RerouteRequest` (`V2NavigationRuntimeService.ts:211`) | the AGENTS.md outside pipeline: prepare -> Google proxy -> bundled OSM -> direct guide -> finalize. **Bundled OSM fallback works offline**, so a rebuild is never a dead end |
| `formatLastKnownAge` | `utils/formatLastKnownAge.ts` | human age copy, already tolerant of clock skew |
| `downloadState` cold-start reset | `SplashScreen.tsx:132-135` | precedent for reconcile-on-cold-start |
| Existing prompt idioms: `Alert.alert` (`useNavigationExitConfirmation.ts:61-70`), `AccessibilityInfo.announceForAccessibility` (`LocationSheet.tsx:344-346`, `NavigationChromeV2.tsx:87`) | | UI + a11y patterns to copy |
| `ARRIVAL_THRESHOLD_METERS = 20` | `constants/navigation.ts:7` | "journey was effectively finished" check |

There is **no** existing age-threshold constant for a whole journey; recommended thresholds below are proposals for owner tuning, not surveyed facts.

## 8. Key design fact both options must respect

**Swipe-away from recents, crash, OOM kill, `am kill` and `am force-stop` are indistinguishable to the app on the next launch** (React Native gets no callback on any of them). User-initiated Exit/Done are the only clean signals (`stopNavigation`). Copy must therefore be neutral ("navigation didn't finish"), never "Android closed the app".

Also: the persisted store is one key rewritten on every `set()`. Adding a route (coordinates + `outsideRoute` step geometry; likely tens to hundreds of KB) to that blob would re-serialize it at ~1 Hz during navigation and risks AsyncStorage's Android per-row read limit (about 2 MB CursorWindow; **unverified on device**), which would take settings and favorites down with it. Any journey persistence should live under its **own key**, written on start/reroute/stop/background, never per GPS fix.

---

## 9. Option A - restore the journey after validation and explicit confirmation

**Persisted (new key `ijtema.active_journey.v1`, versioned JSON, V2 only):**
`{ schemaVersion:1, sessionId, appBuild/graphVersion, savedAtMs, lastActiveAtMs, destinationPlaceId, route: V2ActiveRoute, routeInstructions, originOverride?: Place (routePlannerOrigin), manualGateId?, checkpoint?: { progressMeters, lastFix?: {lat,lng,observedAtMs} } }`.
Writers: `startNavigation`, mid-trip reroute (`setActiveRoute`), AppState `background` (refresh `lastActiveAtMs`, optional checkpoint). Deleter: `stopNavigation` (covers Exit, arrival Done), expiry purge at Splash. It must **not** write `isNavigating` (audit Finding 6a/6b stay green).

**Startup (after hydration gate, in Splash or a `useJourneyRestore` hook on first Home mount):**
1. Read snapshot; parse failure, wrong `schemaVersion`, non-V2, `useIjtemaV2Navigation()` false -> discard silently + delete.
2. Age: `0 <= now - lastActiveAtMs <= 30 min` for offering *Resume*; `<= 2 h` for offering *New route*; older -> discard silently. Negative age (clock change) -> discard.
3. `graphVersion` equals current graph; destination re-resolves with `V2PlaceAdapter.getPlaceById`; `V2NavigationAdapter.canStartActiveNavigation({route, destination})` is `canStart`.
4. Not effectively finished: last checkpoint within `ARRIVAL_THRESHOLD_METERS` of the destination -> discard.
5. Permission granted and services on (already read at Splash); otherwise fall to B-style message without the Resume button.
6. Acquire a **live** fix with `resolveCurrentLocation(false)`, bounded (reuse the 4 s pattern; a longer, visible "Finding your location" state is acceptable on this dedicated screen), require `source==='live'` and `evaluateNavigationLocationCapability({startSource:'live_gps', coordinate, precision, nowMs}).canStart`.
7. Geometry: `projectProgressMetersOnRoute(fix, route).distanceToRouteMeters <= getDynamicOffRouteThresholdMeters(fix.accuracy)`. If off the cached route -> offer only "New route" (rebuild from the fresh fix via the standard pipeline); never show Resume.

**UX (English; app has no UI i18n, see section 11):** after Splash, before/over LocationsDirectory, a full-width card (not a dismissible Alert, for the elderly user base):
- Title: `Continue your journey?`
- Body: `You were heading to {destination}. We found your route from {N} minutes ago and you are still on it.`
- Buttons: primary `Resume navigation`, secondary `Get a new route`, tertiary `Cancel`.
- Resume calls `startNavigation(destination, route, instructions)` (bumps `navigationSessionId`, V2 VM resets refs); `Get a new route` sets `pendingDirectorySelection` to the destination (see B); `Cancel` deletes the snapshot.
- If step 6/7 fail, the card shows the reason (`We can't find your location right now` / `You are away from your saved route`) and only `Get a new route` / `Cancel`.
- A11y: card container `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`, call `AccessibilityInfo.announceForAccessibility("Navigation was interrupted. Resume to {destination}?")` on mount (same idiom as `LocationSheet.tsx:344`); focus the primary button; 48 dp targets; respect `useReducedMotion`.

**Engineering:** files - new `src/services/ActiveJourneyStore.ts` (persist/validate/purge; pure `validateJourneySnapshot(snapshot, ctx)` so it is unit-testable), store hook-ups in `useAppStore.ts` (subscribe or call from start/stop/`setActiveRoute`), `SplashScreen.tsx` or `HomeScreen.tsx` mount effect, one new card component, `LocationsDirectoryScreen.tsx` if the card lives there, tests, a new allowlist row in the partialize guard (unchanged, since separate key), docs (`RELEASE_SECURITY_PRIVACY.md` retention note - owner text, not authored by an agent). **Size: M, about 3-5 dev days + physical-device pass.**

**Risks:** (1) stale/spoofed origin: mitigated only if step 6-7 are strict; a regression that skips them is the exact "silent stale resume" this issue forbids. (2) **Privacy #145 / #58:** snapshot contains origin coordinate and possibly a checkpoint = personal movement data at rest; RKStorage is excluded from Android backup (`data_extraction_rules.xml`, `backup_rules.xml`, guarded by `scripts/test-android-backup-policy.ts`) but the retention policy is an owner decision. Must delete on Exit/Done/expiry and keep TTL <= 2 h. (3) Write amplification and row size (section 8). (4) Reroute mid-trip changes the route: snapshot must be rewritten or Resume restores an outdated route (then step 7 fails and it degrades to New route - acceptable but noisy). (5) Provider route (Google/OSM) geometry cached; if user resumes on a route whose gate connector was later flagged, `canStartActiveNavigation` doesn't recheck gate verification - re-run `RoutingServiceV2` eligibility. (6) Arrival latch, reroute cooldown, GPS_LOST are deliberately reset (consistent with #111/#113). (7) V1 unsupported. (8) Device clock changes make age unreliable; use both `Date.now()` age and reject negative.

## 10. Option B - notify the user and offer to calculate a fresh route

**Persisted (new key `ijtema.active_journey_marker.v1`, tiny, **no coordinates**):**
`{ schemaVersion:1, sessionId, destinationPlaceId, destinationLabel, startedAtMs, lastActiveAtMs }`.
Written by a small `ActiveJourneyMarker` service on `startNavigation`; `lastActiveAtMs` refreshed on AppState `background`; deleted on `stopNavigation` (Exit and arrival Done both route through it), and purged when older than the TTL. It never stores a route, origin or GPS point, and never touches `isNavigating`.

**Startup:** after hydration, if a marker exists and `0 <= now - lastActiveAtMs <= 2 h` and `V2PlaceAdapter.getPlaceById(destinationPlaceId)` resolves and `useIjtemaV2Navigation()` is on, show the notice. Otherwise delete the marker silently. Always delete the marker once the user acts or dismisses (one-shot).

**UX (English):** a card at the top of `LocationsDirectoryScreen` (the actual landing screen, section 3), so no new route/StartupManager change:
- Title: `Your last navigation didn't finish`
- Body: `You were heading to {destination}. Want a new route from where you are now?`
- Buttons: primary `Get new route`, secondary `Dismiss`.
- `Get new route`: `setPendingDirectorySelection(resolvedPlace)` then existing `goToMap()` (`LocationsDirectoryScreen.tsx:113-126`); the app then runs its **normal** preview from live GPS (or the user's chosen start), with all existing freshness/precision/Start gating. The user must tap Start; nothing auto-starts. Optionally extend the hand-off to open the Directions sheet directly (fewer taps; check `handleOpenDirections`, small).
- If the marker's age is > 2 h or the destination no longer resolves: no UI, marker deleted.
- A11y: `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`, `announceForAccessibility("Your last navigation didn't finish. Get a new route to {destination}?")`, 48 dp targets, primary focus. Copy is neutral on cause (section 8).

**Engineering:** files - new `src/services/ActiveJourneyMarker.ts` (~60 lines; get/set/clear/purge), 3 call sites in `useAppStore.ts` (start/stop, plus a `subscribe` if we do not want to touch actions) or a `useEffect` in Home keyed on `navigationSessionId`, `LocationsDirectoryScreen.tsx` card + component, tests. No `useAppStore` schema/version change (separate key), so **no migration**. **Size: S, about 1 day** + physical-device pass.

**Risks:** (1) marker says "interrupted" when the user actually arrived but died before tapping Done - mitigate optionally by clearing the marker when the arrival latch flips (VM -> `markJourneyArrived`), otherwise a harmless dismissable card. (2) a rebuilt route may differ from the old one - acceptable and arguably correct (the walker's position is unknown). (3) Privacy footprint is minimal: destination id/label and two timestamps, no location; still record it in the #145 inventory. (4) Stale GPS: not applicable, nothing is resumed and Start stays behind `evaluateNavigationLocationCapability`. (5) Outside origin offline: rebuild uses bundled OSM fallback, so still works offline. (6) An ignored notice is one-shot; a user who dismisses loses the hint (acceptable).

## 11. Language / i18n considerations

The app has **no UI localization layer** (no i18n library in `package.json`/`src`). `settings.language: 'en'|'ur'` (`models/types.ts:158`) only selects the **voice** language (`SettingsScreen.tsx:212` "English (voice)"/"اردو (voice)"; `VoiceService.speak(text, lang)`; V1 arrival has an Urdu string `NavigationViewModel.ts:233`). Instructions carry `urduText` for some outside steps. UI copy everywhere, including `Alert.alert` prompts, is hard-coded English. So: ship the new copy in English, matching every other prompt; **do not** add spoken (VoiceService) announcements for this notice; treat Urdu (RTL, `supportsRtl=true` is already set in the manifest) as a separate localization ticket that would cover all prompts, and flag it to the owner rather than half-localizing one card.

## 12. Recommendation

**Ship B for the current APK milestone (#135), with the marker key/shape designed so A can be layered later.** Reasons: (a) it satisfies the hard requirement ("never silently resume with stale GPS or an unvalidated cached route") by construction, since nothing is resumed and the standard preview + Start gating rerun on live data; (b) it reuses the entire existing pipeline (`pendingDirectorySelection` -> place select -> preview -> `canStartActiveNavigation` + `evaluateNavigationLocationCapability`) so there is almost no new routing/GPS code and no new stale-state surface; (c) it stores no location, keeping #145 exposure minimal; (d) size S vs M and far smaller device-test burden; (e) after process death the walker's position is unknown anyway, so a fresh route from the live fix is the *correct* answer, and Option A's incremental value (skipping a recompute that is fast and works offline) is small. Choose A only if the owner specifically wants one-tap resumption of the identical route (e.g. for a fixed guided route with a manually chosen gate); if so, still build B's marker first and have A's card degrade to B whenever any validation step fails.

Independent of A/B, do the hardening tests in section 13 (T1-T3) now; they lock in the property that makes any fix safe.

---

## 13. Policy-agnostic regression tests (can be written now)

Harness precedents: `src/__tests__/useAppStoreHydration.test.ts` and `SplashScreen.test.tsx` already capture `initialStoreState`, `realPersistOptions = useAppStore.persist.getOptions()`, swap in a controllable `storage` via `persist.setOptions`, call `persist.rehydrate()`, and restore in `afterEach`. Jest config: `jest.config.js` (jest-expo/android, `src/__tests__` only).

**Check for existing coverage: none of T1-T4/T7 exist.** `grep partialize|getOptions` in tests hits only the two harness files above (they use `getOptions` to restore, not to assert contents). `isNavigating` assertions elsewhere are all post-`startNavigation`. Related but different: `HomeScreenColdLaunchCamera.test.tsx:270-286` (stale `lastKnownLocation` does not move the camera), `LocationNavigationCapability.test.ts` (LOC-05 stale by 30_001 ms only; LOC-10 remembered/device/manual preview-only), `DirectionsViewModelHybrid.test.tsx:109,193,229` (remembered start source/label), `scripts/test-navigation-architecture-audit.ts` Finding 6 (writer/reader pinning, not persistence), `SplashScreen.test.tsx` (routes to `LocationsDirectory`, no nav-state assertion).

**T1 - `useAppStoreProcessDeath.test.ts` :: `process death: nothing about an in-flight journey is written to storage`** (characterization)
- Setup: controllable storage that records the last `setItem(name,{state,version})`. `useAppStore.setState(initialStoreState,true)`. Call `startNavigation(v2Place, v2ActiveRoute, instructions)`, `setReroutePending(true)`, `setSelectedPlace(v2Place)`, `setRoutePlannerOrigin(p)`, `setCurrentLocation(fix{observedAtMs, accuracy:5},'live')`.
- Assert: written `state` has **none** of the keys `isNavigating, navigationSessionId, destination, activeRoute, routeInstructions, reroutePending, selectedPlace, routePlannerOrigin, routePlannerDest, routeAlternatives, pendingDirectorySelection, currentLocation, currentLocationSource, snappedLocation`. `written.state.lastKnownLocation` equals the fix and `lastKnownLocationUpdatedAt` is an ISO string. (Under A, the journey key is separate, so this remains true; if the owner decides to put it in the store blob, this test is the deliberate change point.)

**T2 - same file :: `process death: rehydrating that blob yields a clean, non-navigating store`**
- Continue from T1: reset with `useAppStore.setState(initialStoreState,true)`, `persist.setOptions({storage:{getItem: async()=>written, ...}})`, `await persist.rehydrate()`, `await waitForStoreHydration()` -> `{outcome:'success'}`.
- Assert: `isNavigating === false`, `navigationSessionId === initialStoreState.navigationSessionId`, `destination === null`, `activeRoute === null`, `routeInstructions` `[]`, `reroutePending === false`, `selectedPlace === null`, `currentLocation === null`, `currentLocationSource === null`; `lastKnownLocation` equals the persisted fix (documents that it *is* hydrated); persisted `settings/favorites/recentSearches` intact. Also assert no `setItem` write occurred as a result of hydration alone when `version` matches (matches `middleware.js:540-542`, only `migrated` writes back).

**T3 - `useAppStorePersistContract.test.ts` :: `partialize allowlist is exact and excludes navigation/derived state`**
- Get `opts = useAppStore.persist.getOptions()`, `out = opts.partialize(useAppStore.getState())`. Assert `Object.keys(out).sort()` equals exactly the 19 current keys (`offlineData, offlineMapStatus, offlineMapStatusMessage, downloadState, settings, recentSearches, favorites, lastKnownLocation, lastKnownLocationUpdatedAt, hasSeenMapOverview, hasSeenLocationTutorial, showGraphNodes, showRastaNames, showBlockPolygons, showGatesLayer, showRastasLayer, showSpecialRoutesLayer, showRouteDiagnostics, developerModeEnabled`) - any addition forces an explicit privacy (#145) decision in that PR. Second assertion: none of the navigation/selection/GPS-runtime keys from T1. `opts.version === 2`.

**T4 - `useAppStoreHydrationTrust.test.ts` :: `a stored blob can never set navigation state directly`** (defence in depth; **fails today** - expected `it.failing` or paired with the hardening)
- Feed `getItem` -> `{version:2, state:{ ...valid, isNavigating:true, activeRoute:v2Route, destination:v2Place, navigationSessionId:9, reroutePending:true }}`; rehydrate. Assert `isNavigating false`, `activeRoute null`, `destination null`, `navigationSessionId 0`, `reroutePending false`. Reason it fails now: default shallow merge (`middleware.js:479-481`). Minimal hardening = a custom `merge` in the persist options that drops those keys (about 6 lines); valid under both A and B because A restores through `startNavigation` after confirmation, never through hydration. Include a second case with `version: 1` to exercise `migrate` (`useAppStore.ts:500-511`).

**T5 - extend `LocationNavigationCapability.test.ts` :: `hydrated lastKnownLocation shape can never start live navigation`**
- Inputs `{startSource:'live_gps', precision:'fine', nowMs}` with (a) `observedAtMs: nowMs - 3_600_000` -> `canStart false`, message `Current location is stale...`; (b) coordinate **without** `observedAtMs` (legacy blob / `setLastKnownLocation`-style) -> `canStart false` same message; (c) `observedAtMs: nowMs - 29_999` boundary -> `canStart true`; (d) `observedAtMs` in the future is not rejected today (`nowMs - observed` negative) - **document with a characterization assertion** and flag to owner (a skewed-clock hydrated timestamp would pass as fresh; small defect candidate, do not fix under #139). Existing tests cover only the 30_001 ms case.

**T6 - extend `DirectionsViewModelHybrid.test.tsx` :: `cold hydrated store: remembered location is preview-only`**
- State: `currentLocation:null`, `lastKnownLocation` (hours-old, outside venue) + `lastKnownLocationUpdatedAt` (old ISO). Render `useDirectionsViewModel(v2Destination)`. Assert `startSource === 'manual_place'`, `canStartNavigation === false`; `act(() => chooseRememberedLocation())` -> `startSource === 'remembered_location'`, `canStartNavigation === false`, `startNavigationDisabledReason === 'Last known location cannot drive live navigation. Route preview remains available.'`, `useAppStore.getState().isNavigating === false`.

**T7 - extend `HomeScreenColdLaunchCamera.test.tsx` (or `HomeScreen.test.tsx`) :: `cold launch with selectedPlace + lastKnownLocation never starts navigation`**
- State: `hasSeenMapOverview:true, hasLocationPermission:true, lastKnownLocation:stale, lastKnownLocationUpdatedAt:old, selectedPlace:v2Place`; `resolveCurrentLocation` mocked to unavailable, then to `device_last_known`. Subscribe with `useAppStore.subscribe` to record every `isNavigating`/`navigationSessionId`. After mount + timers: never true / still 0, `activeRoute === null`, mode is not `NAVIGATION`/`ARRIVAL`, `cameraAnimateToUser` not called with the stale coordinate (already the existing assertion style).

**T8 - `NavigationViewModelV2Idle.test.tsx` :: `stale activeRoute with isNavigating false does not engage the runtime`**
- `setState({activeRoute: v2Route, isNavigating:false})`, `renderHook(useNavigationViewModelV2)`. Assert `result.current.route === null`, `GPSManagerService.addListener` not called with `'navigation'` (spy), no `forceFix`. Locks `NavigationViewModelV2.ts:105,209-213`.

**T9 - `scripts/test-navigation-start-callers.ts` (static, like `test-android-backup-policy.ts`)**
- Assert `startNavigation(` is invoked only in `HomeScreen.tsx` (inside `handleStartPreviewNavigation`) and `DirectionsViewModel.ts` (inside `handleStartNavigation`) and defined in `useAppStore.ts`; assert `useAppStore.ts` `partialize` block text contains no `isNavigating|activeRoute|navigationSessionId|destination|routeInstructions` token (closes the gap that Finding 6a's regex misses). Wire as an npm script next to the other `test:*`.

Landed with this document: T1, T2, T3 (`useAppStoreProcessDeath.test.ts`), T5 (`LocationNavigationCapability.test.ts`) and T8 (`NavigationViewModelV2Idle.test.tsx`). Still proposed: T4 with the 6-line merge hardening as a separate one-concern PR per AGENTS.md; T6/T7/T9 optional.

## 14. Physical-device (adb) procedure - kill vs force-stop are NOT equivalent

Evidence level to claim from this procedure: **PHYSICAL DEVICE VERIFIED** only if run on a real phone; the same steps on the API 36 emulator are **EMULATOR VERIFIED**. Record build commit, APK checksum, device model, Android version, timestamps, and the exact commands (AGENTS.md).

Package: `com.aicrafted.karachiijtema` (from `MainActivity.kt` path; confirm with `adb shell pm list packages | grep ijtema`).

Setup (both runs): fresh release APK; permission granted (fine); map downloaded; complete onboarding; start a V2 navigation to a known destination (ideally an outside origin so the outside pipeline is exercised, plus one inside run); wait until at least one turn instruction has advanced; note destination, remaining distance, and `lastKnownLocationUpdatedAt`-independent wall-clock time. Do a `adb logcat -c` first and capture `adb logcat -v time | grep -i -E "ReactNative|ijtema|AndroidRuntime"`.

**Run 1 - process death (the #139 scenario):** `adb shell am kill <pkg>` only kills a process that is in the **background** (it is a "safe-to-kill" request: it will not kill a foreground process, and does not clear the task record). So:
1. While navigating, press Home (do not swipe the card away). Confirm backgrounded: `adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity"` no longer shows the app.
2. `adb shell am kill com.aicrafted.karachiijtema` (confirm death: `adb shell pidof com.aicrafted.karachiijtema` returns nothing; `adb shell ps -A | grep ijtema`). The recents card should remain.
3. Reopen from **recents** (this is the "Android restored my task" path; `singleTask`, `super.onCreate(null)`) and also, as a second variant, from the launcher icon. Record: does it show Splash, which screen after, is any journey/notice shown, what does the map show.
4. Additional lever if `am kill` proves flaky on the device: developer option "Don't keep activities" plus memory pressure, or `adb shell input keyevent KEYCODE_HOME` then `adb shell am send-trim-memory <pkg> RUNNING_CRITICAL` (weaker: trims, does not kill).

**Run 2 - force-stop (different semantics, report separately):** `adb shell am force-stop <pkg>` kills the process from any state (foreground included), cancels alarms/jobs/notifications and **removes the task from recents / puts the app in the "stopped" state**; it also matches "user swiped away + Force stop in Settings". It does not clear app data (that is `pm clear`, which also wipes AsyncStorage and would erase the marker/snapshot - never use it in this test). Repeat launch from the launcher; recents card will be gone. Do not treat a pass here as proof for Run 1 or vice versa; Run 1 is the closer proxy for the real Android low-memory kill.

**Run 3 (optional) - swipe-away from recents while navigating:** RN gets no callback; expected to behave like force-stop for our purposes and shows why the notice copy must be cause-neutral (section 8).

For each run record (screenshot + `adb shell uiautomator dump` or TalkBack transcript): landing screen; presence/absence of the #139 notice/card; that `Resume`/`Get new route` behave as specified; that no navigation mode is entered without an explicit tap; GPS: airplane-mode and location-off variants of the relaunch (expect: no Resume offered, only the neutral notice or nothing); age variants by changing device time forward beyond the TTL (`adb shell settings put global auto_time 0; adb shell date ...` on a userdebug/emulator only; on a locked production phone use Settings UI) and clock moved backward (negative age -> discard). TalkBack pass: the notice is announced once and focus lands on the primary button (#128 overlap). After each run confirm the marker/snapshot key is gone after Exit/Done/Dismiss (inspect via a debug build's dev menu or `run-as` on a debuggable build: `adb shell run-as <pkg> sqlite3 databases/RKStorage "select key from catalystLocalStorage"`; not possible on a release build, so verify deletion through behaviour: relaunch shows no notice).

Field/physical requirements that remain regardless of design: real GPS while walking (FIELD REQUIRED), OEM battery-optimizer aggressiveness (Xiaomi/Oppo kill backgrounded apps far more aggressively than a Pixel), and Android version differences in how long a non-foreground-service app survives in background.

## 15. Open questions for the owner

1. A or B (recommendation: B now, A optional later)?
2. TTLs: notice window 2 h, resume window 30 min - acceptable? (No surveyed basis; pure product call.)
3. Should the notice also appear when the destination is a gate/facility that can currently route only via a direct-guide fallback? (Default: yes, same flow.)
4. Retention wording for #145 (owner-authored, per AGENTS.md "no fabricated legal content").
5. Are Urdu UI strings wanted at all (separate ticket)?
