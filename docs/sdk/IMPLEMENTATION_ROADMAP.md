# Incremental implementation roadmap

Each milestone is separately reviewed/validated on ordinary sequential branches in the same permanent folder. No new checkout. One concern per PR. B1 stops before code migration. Expected paths below are proposals, not created directories. B5 packaging precedes app-root relocation; B7 parity is required before B8 can claim cross-platform readiness.

| Stage | Scope / source and expected files | API / data change | Risks and tests | Rollback / done |
| --- | --- | --- | --- | --- |
| B1 | These seven docs; inspect current layers/native tooling | Proposed API and pack schema only | Source/link/version consistency and independent review | Revert docs; done when RFC delivered for owner approval, not when SDK built. |
| B2a | AStar.ts + MinHeap.ts → packages/offline-navigation/src/domain; old-path re-exports | Internal algorithm seam only; no public navigation API/data change | Imports in both routing services and scripts; tie/zero-weight/unreachable parity, min-heap and routing suites | Revert focused PR; done when one implementation, both callers unchanged and full gates green. |
| B2b | Pure destination-intent policy (from `setPendingJourney`, not JourneyStartPlanner; see B2B_JOURNEY_POLICY_CORRECTION.md), JourneyPresentationState, location capability and progress helpers behind injected ports | Internal generation/cancellation policy, no private store exports | Global state/time/i18n leaks; stale callbacks/fix loss/arrival tests | Keep compatibility facade; done after pure dependency boundary and behavioral parity. |
| B3 | ijtema types/graph builders/RoutingServiceV2/provider inputs → data contract ports; current Ijtema adapter | Typed venue repository, immutable graph/policy; deterministic JSON compiler proposal | Hardcoded IDs/flags/coordinate dialects; graph and gate-cost parity, canonical manifest, surveyed omissions | Keep TS-backed adapter default; done when route engine accepts repository without duplicating logic. |
| B4 | OfflineMapCanvas, LocationSheet/navigation overlays, ViewModels, GPS/FS/speech/storage adapters | Controller/provider/view API from contract; session-scoped internal store | Focus, shared singleton watchers, engine duplication, sheet/RTL/native URLs; lifecycle/component tests + Android runtime | Root wrappers delegate incrementally; done when all overlays share one controller and dispose proof. |
| B5 | packages/offline-navigation/package.json, exports/declarations; root workspaces/Metro/test paths; consumer fixture | Private 0.x version, RN/headless exports; peers exact initial baseline | Autolinking/duplicate React/native binaries, asset paths; package-content allowlist, npm ls, Metro/Gradle/Pod graph, consumer type/build tests | Revert workspace/tooling PR; done with one resolved native set and clean root app scripts. |
| B6 | Existing root app becomes SDK consumer; optional apps/ijtema move is a separate later PR | Replace private imports with public commands; preserve settings/destination marker migration | App stack/identity/signing/build paths, v1 rollback; all source/routing gates + behavior matrix Android | Old facade until parity; done one engine and no consumer private refs. Root move requires separate verified plan. |
| B7 | iOS capability adapter, pack paths/resources, current ios project dependency parity | Full/reduced authorization mapping; no background contract | Stale Podfile.lock, SPM/PMTiles/permissions; simulator build/interactions + device VoiceOver/GPS/airplane tests | Fail closed/manual fallback; done only actual iOS consumer builds and relevant evidence recorded. |
| B8 | apps/muslim-ummah app shell created after owner app-ID requirements; shared workspace consumer | Independent host stack/theme/consent, same controller exports | Native dependency/path duplication, identity/release policy; contract suite against both apps, Android/iOS build/interaction | Remove/revert new consumer only, Ijtema intact; done actual apps consume same SDK, not a mock engine. |
| B9 | PackManager/import/download/verifier/compiler; venue-data/karachi-ijtema | Signed pack v1, compatibility/atomic activation/LKG/pinning | Zip traversal/bombs/key custody/disk/crash/network; malicious fixtures/fault injection/cross-platform offline update | Bundled verified pack and prior pointer retained; done security review plus transaction/rollback tests. |
| B10 | Cross-consumer acceptance harness and evidence docs | Stable API release candidate, no new engine | Native/field/accessibility/security; suites and actual airplane/permission/walking/arrival tests | Pin last validated SDK+pack; done gate-specific certification, not global green from mocks. |

## First safe B2 PR after approval

Extract only `src/utils/AStar.ts` and `src/utils/MinHeap.ts` into the proposed domain folder with unchanged bodies and old-path compatibility re-exports. Inspect existing min-heap/street graph/router tests, add a focused parity test only for a meaningful uncovered algorithm contract. Do not activate workspaces, change routing policy, alter data or rename host UI. Run typecheck/lint/npm test/components/diff-check and four routing gates. Review one-implementation imports and compare route fixtures. Commit/push/PR after owner approves RFC/B2, exact-head CI before integration. Revert PR cleanly if any behavior/tooling regression; do not maintain copied algorithms.

## Bounded spikes before affected stages

- B5: package resolution/autolinking fixture in same folder/branch, no app relocation or dependency upgrades.
- B7: iOS precision capability + local PMTiles test with installed versions, explicit native build approval; preserve current files.
- B9: vetted Ed25519/archive implementation and atomic filesystem crash tests, numerical resource budget selection.

The spikes resolve uncertainty; they are not silently part of B1. No native/framework upgrade, SDK publication or consumer release is authorized by this roadmap.

## Progress

### B3 closeout (B3a-B3d-C, through `c2e6b2e`)

- **Reusable in `packages/offline-navigation/src/domain`:** `algorithms` (A*, MinHeap), `geo`, `journey` policies, `venue` (data contract, `validateVenueGraph`, `findVenuePath`), `street` (`StreetRoutingGraph` contract incl. `covers`, `findStreetRouteToTargets`).
- **Host-owned Ijtema services (deliberate, lazy defaults at the boundary):** `streetAdapter`, `selectStreetGraphOutsidePath` (gate penalty / tie-break), `RoutingServiceV2` (`selectOutsidePath`, `resolveOfflineOsmOutsideCandidate`), `createProductionOutsideRouteSource`, `EntryGateRoutingService`, `IJTEMA_GATES`.
- **V1 dependencies still live:** `src/constants/data.ts` consumers listed in `B3A_VENUE_DATA_CONTRACT.md`; untouched.
- **Missing evidence:** the 8,034-case outside baseline script is unrecovered; outside parity is pinned at 5,418 cases (internal 91,506 == golden).
- **B4 ownership boundary:** the SDK owns headless lifecycle/state only. GPS subscriptions (`GPSManagerService`), the Zustand store (`isNavigating`, `navigationSessionId`, `startNavigation`/`stopNavigation`), RN hooks and UI remain host-owned until a controller replaces them incrementally.

### B4a-1 navigation session lifecycle

- Production today: `useAppStore.startNavigation` (guarded, bumps `navigationSessionId`) creates a session; `stopNavigation` (exit/arrival dismiss in `NavigationViewModelV2`) ends it; stale async work is rejected by `OutsideRouteRequestCoordinator` plus per-hook generation/mounted refs (`NavigationViewModelV2` reroute `ownsSession`, `DirectionsViewModel` `journeyGenerationRef`, `useManualLiveUpgrade` `generation`).
- Added `domain/session/NavigationSession.ts`: `createNavigationSession(id)` with `idle -> active -> cancelled` (or `idle -> cancelled`), `disposed` from any state; one current request per session (supersede/cancel/dispose abort it, `commit` applies at most once); idempotent `cancel`/`dispose`; no listener calls after disposal. No GPS, timers, globals or Ijtema constants; the host injects the id.
- Not wired into production; `NavigationViewModelV2` and the store are unchanged. Covered by 8 checks in `test:sdk-headless`.
- B4a-2 (next, not started): adopt the session behind one existing caller (e.g. reroute's `ownsSession` + coordinator) with parity tests.

### B4a-2 reroute session ownership

- `NavigationViewModelV2` now holds one SDK `NavigationSession` per journey: created and started in an effect keyed on `isNavigating` + `navigationSessionId`, disposed on Exit/stop, a new trip or unmount, and cancelled when arrival latches. `attemptReroute` takes `beginRequest()` and both result-commit gates require `request.canCommit()` as well as the existing store check; pending/status cleanup keeps the store-only check. `OutsideRouteRequestCoordinator`, `arrivedRef` and the in-flight marker are unchanged.
- No change to routing geometry, GPS thresholds or subscriptions, UI, ETA or provider policy; no global session.
- Covered by `NavigationViewModelV2RerouteSession.test.tsx` (7 behaviours characterized on the pre-change code, then 4 session checks, one of which fails if the SDK gate is removed while the store and coordinator guards stay) plus the existing V2 reroute/arrival suites.
- B4a-3 (done below): candidate is folding the outside-request coordinator's abort signal into the session request so there is one rejection path.

### B4a-3 one rejection path for reroute requests

- `OutsideRouteRequestCoordinator.begin(key, parentSignal?)`: an aborted parent aborts that handle only (never a later one). `NavigationViewModelV2` passes the journey request's signal, so supersede, Exit, a new trip, arrival and unmount abort the outside provider through the session.
- Removed the three now-duplicate `cancelCurrent()` calls (unmount effect, inside-reroute branch, arrival). Kept the independent ones: GPS lost and loss of live capability (journey continues), plus `outsideHandle.canCommit()`, the store check, request tokens and the direct-guide rejection.
- Behaviour change: Exit and a new trip now abort a pending outside provider fetch instead of only discarding its result.
- Covered by a coordinator link test and two V2 abort tests (Exit/new journey, arrival); removing the link fails those plus the unmount abort test.
- B4a-4 (done below): candidate is the same session ownership for `DirectionsViewModel`'s `journeyGenerationRef` preview requests.
- Known gap (closed in B4a-5): an inside-venue reroute aborting a pending outside reroute is now pinned by a V2 session test.

### B4a-4 route preview ownership

- `DirectionsViewModel` holds one SDK `NavigationSession` (`directions-preview`) per mount, created and started in the mount effect and disposed on unmount. It is separate from the journey session, so closing Directions never touches a live journey.
- `calculateRoute` takes `beginRequest()`; its `canCommit` also requires `request.canCommit()`, and the outside preview handle is linked to the request's signal. `invalidateJourneyWork` (destination/intent change, manual gate, unmount) supersedes the request instead of calling `cancelCurrent()` directly.
- Kept unchanged: `journeyGenerationRef`, `routeRequestRef`, `mountedRef`, the `isNavigating` and intent checks, the location-request guards and the two `cancelCurrent()` calls inside `calculateRoute`. Removing `journeyGenerationRef` is not proven equivalent yet (the location and hypothetical-selection paths still use it).
- Covered by `DirectionsPreviewSession.test.tsx` (6 cases: valid preview, rapid destination changes, origin change, close + late result + reopen, preview-to-live with no cross-cancellation, inside manual preview). If the signal link is removed, the close/unmount abort test fails.
- B4a-5 (done below).

### B4a-5 manual-to-live upgrade ownership

- `useManualLiveUpgrade` holds one SDK `NavigationSession` (`manual-live-upgrade`) per mount, separate from the Directions preview and journey sessions. `confirmLiveUpgrade` takes `beginRequest()`; its `owns()` and `startUpgradedNavigation` also require `request.canCommit()`, and the outside upgrade handle is linked to the request's signal. Cancel, a new request, the trip/gate/chooser invalidation effects and unmount supersede or dispose the session instead of calling `cancelCurrent()` directly.
- Kept unchanged: `generation`, `mounted`, `ownsCommittedTrip`, explicit confirmation, capability/fresh-fix checks, one-shot Start with rollback and the private map candidate.
- Closed in B4a-6: a destination change through the store (prop unchanged) now aborts the provider as well as rejecting the late result.
- Covered by `ManualLiveUpgradeSession.test.tsx` (7 cases) plus the existing `DirectionsManualLiveUpgrade` suite. If the signal link is removed, the cancel, gate and unmount abort tests fail.
- B4a closeout: done in B4a-6 below.

### B4a-6 external destination-change abort and B4a closeout

- `useManualLiveUpgrade` subscribes to the store's `routePlannerDest` id and adds it to the trip-invalidation effect. A destination changed outside Directions (prop unchanged) now supersedes the upgrade request, so the outside lookup is aborted, not just rejected. The manual guide, the Directions preview session and any live journey session are untouched. A test in `ManualLiveUpgradeSession.test.tsx` fails without the link.
- **SDK-owned lifecycles:** three `NavigationSession`s (journey/reroute in `NavigationViewModelV2`; `directions-preview` and `manual-live-upgrade`, one per mount). Each owns one current request whose signal is linked to `OutsideRouteRequestCoordinator`. Supersede, cancel and dispose abort the request; `canCommit` gates each commit.
- **Still owned by the host:** the Zustand store (`isNavigating`, `navigationSessionId`, `startNavigation`/`stopNavigation`, planner/guide state), `GPSManagerService` subscriptions, location-permission requests, the explicit Live approval/Start flow, and all RN views and hooks.
- **Why the generation guards stay:** `journeyGenerationRef` still guards the location-request and hypothetical-selection paths, which have no session. The upgrade `generation` tokens the preview candidate for one-shot Start. `ownsSession` / `ownsCommittedTrip` check store facts the session cannot see. Removing any of them needs equivalence tests first.
- **Open limitations:** `LocationAccessService.resolveCurrentLocation` cannot be aborted, so a superseded GPS acquisition runs to completion and only its result is rejected. Inside-venue `calculatePreview` is synchronous, so there is nothing to abort. GPS loss and loss of live capability still call `cancelCurrent()` on their own, because the journey continues.
- **Verdict:** B4a is complete, and B4b UI extraction can start. Views read view-model output and do not touch sessions. Candidate for B4b-1: `ManualLiveUpgradeCard`, which is props-only (48 lines, no store access), extracted behind its existing props contract.

### B4b-1 reusable ManualLiveUpgradeCard

- The implementation now lives in `packages/offline-navigation/src/ui/ManualLiveUpgradeCard.tsx`. It is presentation-only and takes typed `labels` (resolved copy), `isRTL`, and a `theme` (host `Card`/`Button`, text style, spinner colour, gap) plus the existing props. It contains no Ijtema copy and does not import Zustand, GPS, navigation or the app.
- `src/views/components/map/ManualLiveUpgradeCard.tsx` is now the Ijtema binding. It keeps the same props and supplies `useI18n` copy/direction and the app design system, so the `LocationSheet` call site is unchanged. `useAccessibilityFocus` moved to `ui/`, and the old hook path is an `export *` shim.
- Boundary: `test-astar-extraction` lets only `ui/` import `react`/`react-native`. The domain stays relative-only and inside `domain/`, and nothing in `packages/` may reach the app. Covered by `ManualLiveUpgradeCard.test.tsx` (10 cases: delegation, idle, confirm/cancel/start/recover separation, busy states, Urdu RTL + a11y, host-supplied labels).
- Next, B4b-2: `RouteGuideCard` (same matrix row).

### B4b-2 reusable RouteGuideCard

- The implementation now lives in `packages/offline-navigation/src/ui/RouteGuideCard.tsx`. It is presentation-only and takes the current `step` (localized instruction plus formatted distance or null), `stepIndex`/`stepTotal`, typed `labels` (step count, spoken summary, Previous/Next, live, end), `isRTL`, and a `theme` (host `Button`, direction-picked `BackIcon`/`ForwardIcon`, colour tokens, radius). Previous/Next/live/end stay host callbacks. The 1.5 font-scale stacking, a11y labels and the live region are unchanged.
- `src/views/components/map/RouteGuideCard.tsx` is now the Ijtema binding. It keeps the same props (`guide`, callbacks, `liveBusy`, `message`) and supplies `useI18n` copy/direction, `localizeInstruction`, the distance unit from the store, `backChevron()`/`forwardChevron()` and the design tokens. The `LocationSheet` call site, sheet detents and `useOverlayInsets` are untouched.
- Covered by `RouteGuideCard.test.tsx` (6 cases: delegation, step numbering/instruction/distance, Previous/Next boundaries, live/end separation, Urdu RTL + spoken summary, host-supplied labels/theme). The existing `GuideControlsLocalization` and `LocationSheetRouteGuide` suites still pass.
- Next, B4b-3 candidate: `DirectionsHeader` from `DirectionsSheetParts.tsx`, which uses props, i18n, chevrons and `useAccessibilityFocus` only.

### B4b-3 reusable DirectionsHeader

- The implementation now lives in `packages/offline-navigation/src/ui/DirectionsHeader.tsx`. It is presentation-only and takes `title`, `subtitle`, `onBack`, an optional `focusKey` (via the SDK `useAccessibilityFocus`) and `accessibilityContext`, plus the resolved `backLabel`, `isRTL` and a `theme` (a direction-picked `BackIcon` and heading, secondary and back-fill colours). The 48dp back target, the header role, the spoken "title. context" label, the layout and the unbounded title wrapping are unchanged. The header has no Close or loading state, so none was added.
- `DirectionsHeader` in `src/views/components/map/DirectionsSheetParts.tsx` is now the Ijtema binding. It keeps the same props and supplies `directions.back`, `useI18n` direction, lucide chevrons and `directionsSheetColors`. The `LocationSheet` call site (titles, subtitles, focus key, destination context), the Directions lifecycle, sheet detents and `useOverlayInsets` are untouched.
- Covered by `DirectionsHeader.test.tsx` (5 cases: delegation and Back, spoken context, Urdu RTL + 48dp target + wrapping, focus on key change only, host-supplied labels/theme). The `GuideControlsLocalization`, `LocationSheetRouteGuide`, `LocationSheetDirectionsRedesign` and `DirectionsCopyLocalization` suites still pass.
- Next, B4b-4 candidate: `StartOptionCard` from the same file. It is props-only, but it reads the global `isRtl()` and is shared with `LocationsDirectoryScreen`.

### B4b-4 reusable StartOptionCard

- The implementation now lives in `packages/offline-navigation/src/ui/StartOptionCard.tsx`. It is presentation-only and takes `icon`, `title`, `subtitle`, `active`, `disabled`, `loading`, `onPress` and a `theme` (a direction-picked `ForwardIcon`, a `LoadingIcon` and colour tokens). The 72dp card, the single spoken "title. subtitle" name, the selected/disabled/busy accessibility state, the dimmed disabled style, the busy icon that replaces the option icon, and the unbounded wrapping are unchanged.
- `StartOptionCard` in `src/views/components/map/DirectionsSheetParts.tsx` is now the Ijtema binding. It keeps the same props and supplies the `useI18n` direction (in place of the global `isRtl()`; same value, now reactive), lucide chevrons, `RefreshCw` and `directionsSheetColors`. `LocationsDirectoryScreen` still decides which start options exist (current location, last known), their order and copy, and what choosing one does. Location permission, journey activation, sheet detents and safe areas are untouched.
- Covered by `StartOptionCard.test.tsx` (5 cases: delegation and press, active + loading, disabled, Urdu RTL chevron + wrapping, host-supplied icons/colours). The `LocationsDirectoryScreen` and `DirectionsManualStartSelection` origin-choice suites still pass.
- Next, B4b-5 candidate: `RouteEndpointRows` from the same file, which also reads the global `isRtl()`.

### B4b-5 reusable RouteEndpointRows

- The implementation now lives in `packages/offline-navigation/src/ui/RouteEndpointRows.tsx`. It is presentation-only and takes typed `from`/`to` rows (`label`, `name`, optional `detail`, `icon`, `actionAccessibilityLabel`, `onAction`), optional `children` drawn inside the card, and a `theme` (a direction-picked `ForwardIcon` and colour tokens). The rows keep their FROM-then-TO order and their 56dp height. Each row is still one tap target with one spoken name. The divider, the optional detail line and the unbounded wrapping are unchanged. The rows have no disabled or selected state, so none was added.
- `RouteEndpointRows` in `src/views/components/map/DirectionsSheetParts.tsx` is now the Ijtema binding. It keeps the same props and re-exports `EndpointRow`. It supplies the `useI18n` direction (in place of the global `isRtl()`), lucide chevrons and `directionsSheetColors`. The styles in that file that nothing used were removed with the move. `LocationSheet` still owns all row copy, the start/destination formatting, the change-start/change-destination handlers and the warning card. Route selection, the Directions lifecycle, sheet detents and `useOverlayInsets` are untouched.
- Covered by `RouteEndpointRows.test.tsx` (4 cases: delegation, order and per-row press; the optional detail; Urdu RTL chevron and wrapping; host-supplied copy, icons and colours). The LocationSheet route-ready, start-state, manual-start and journey suites still pass.
- `DirectionsSheetParts.tsx` now holds only bindings. B4b presentation extraction from it is complete. Next: the B4b closeout.

### B4b closeout

- **Verified at `e2e8acc`.** `ManualLiveUpgradeCard`, `RouteGuideCard`, `DirectionsHeader`, `StartOptionCard` and `RouteEndpointRows` live in `packages/offline-navigation/src/ui/`.
  - The SDK files import only `react`, `react-native` and the SDK's `useAccessibilityFocus`. They contain no Zustand, i18n, lucide, GPS, routing or app code, and no Ijtema copy.
  - Each one takes typed props, plus host labels or copy and a `theme` with a direction-picked icon and colour tokens.
  - The app files are thin bindings with unchanged props, so the `LocationSheet` and `LocationsDirectoryScreen` call sites did not change.
  - RTL comes from the `useI18n` direction. The exception is the `RouteGuideCard` chevrons, which come from `backChevron()`/`forwardChevron()` and read the global `isRtl()`; aligning them is a small follow-up. Accessibility (roles, spoken names, 48–72dp targets, states, focus) and wrapping are unchanged.
  - The five suites pass 31/31. Full `npm test` passed at `e2e8acc` (B4b-5).
- **Remaining UI, classified (inspection only, not an audit):**

  | Item | Lines | Class | Why |
  |---|---|---|---|
  | `ActiveDirectionsPanel` | 61 | SDK-reusable | Props-only full-screen `Modal` step list (instructions, current step, close). Depends on i18n, `localizeInstruction`, the `V2NavigationInstruction` type, `staticColors`, the app `useAccessibilityFocus` shim and `SafeAreaView` (safe areas stay host-injected). Used only by `NavigationChromeV2`. |
  | `OutsideRouteStatusCard` | 144 | SDK-reusable, later | Typed outside candidate, but tied to `OutsideRouteLocalizationService` and the app `Button`. |
  | `DirectionsPeekHandle`, `MapControls` | 86 / 166 | SDK-reusable, later | Presentational. `MapControls` couples to `CompassMode` from the camera manager. |
  | `NavigationChromeV1`/`V2` (arrival modal, reroute banner, recenter) | 253 / 368 | Host-owned for now | They read the overlay view models, `useOverlayInsets`, safe areas and venue-name localization. Decompose them into leaf cards before any extraction. |
  | `LocationSheet` (Directions sheet, Route Preview) | 1248 | Host-owned | Owns the lifecycle, detents, copy and handlers. Only its leaf cards were extracted. |
  | `DirectionsSheetFooter` | 96 | Platform-specific | `@gorhom/bottom-sheet` footer and safe-area insets. |
  | Location recovery (permission / GPS-off prompts in `LocationsDirectoryScreen`, `HomeScreen`) | n/a | Host-owned | Platform permissions and app flow. |
  | `MapLabelOverlay`, `LayersSheet`, `MapTopBar`, `OsmAttribution` | n/a | Host- or platform-specific | MapLibre and app chrome. |

- **Verdict:** B4b is complete as a leaf-component extraction milestone (the five Directions-sheet leaves). The full ready-made navigation UI is **not** complete. The SDK has no turn-by-turn chrome, arrival, reroute or recovery UI, and no composed sheet.
- **Next, B4c-1:** extract `ActiveDirectionsPanel` into `ui/` behind a binding. Host-resolved instruction strings and labels go in, `isRTL` and a `theme` are passed, and focus uses the SDK `useAccessibilityFocus`. The `NavigationChromeV2` call site stays unchanged. After that, decompose `NavigationChromeV2` leaves: the arrival card, then the reroute banner.

### B4c-1 reusable ActiveDirectionsPanel

- The SDK's `ui/ActiveDirectionsPanel` is the full-screen `Modal` step list. It takes typed props: already-localized `steps` (`{ key, text }`), `currentStepIndex`, `destination`, `labels` (title, close, no steps, current step), `isRTL` and `onClose`. It also takes a `theme`, which carries a host `Container` (safe areas stay host-owned) and colour tokens. Focus uses the SDK `useAccessibilityFocus` (stage `active-directions`). The file imports only `react`, `react-native` and that hook.
- `src/views/components/navigation/ActiveDirectionsPanel.tsx` is now the Ijtema binding, with the same props as before. It keeps the `${id}:${index}` keys and maps the engine's instructions through `localizeInstruction` on every render, so a locale change updates the visible text without a reroute. It supplies the `useI18n` copy and direction, `SafeAreaView` and `staticColors`. The `NavigationChromeV2` call site is unchanged. Step progression, the open/close state, rerouting, arrival and `RouteGuideCard` are untouched.
- Styles, spacing, wrapping (no line limits), `ScrollView`, roles, spoken names and the selected state are unchanged.
- Covered by `ActiveDirectionsPanel.test.tsx` (5 cases): delegation with ordered localized steps and stable keys; close; a single current step that moves with the index; empty and single-step lists; Urdu RTL, copy and wrapping; and the SDK panel with host copy and container. The `NavigationViewModelHybrid` locale-change suite and the `NavigationChromeV1`/`V2` suites still pass.
- Still open (tracked separately, unchanged here): the `RouteGuideCard` binding chevrons read the global `isRtl()`.
- **Next, B4c-2:** the `NavigationChromeV2` arrival card leaf, then the reroute banner.

### B4c-2 reusable ArrivalCard

- The SDK's `ui/ArrivalCard` is the arrival sheet: a transparent, sliding `Modal` with the pin, title, subtitle, destination, Recenter and Done. It takes typed props: `visible`, an already-localized `destination`, `labels` (title, subtitle, recenter, done and their spoken names), the host `bottomInset` (#301), `onRecenter` and `onDone` (Android back also calls `onDone`). Its `theme` carries the host icons, `hitSlop` and colour tokens. Focus uses the SDK `useAccessibilityFocus` (stage `arrival`). The file imports only `react`, `react-native` and that hook.
- `src/views/components/navigation/ArrivalCard.tsx` is the Ijtema binding. It supplies the `useI18n` copy, `useSafeAreaInsets`, the lucide icons, `NAV_TOUCH_TARGET_HIT_SLOP` and `staticColors`. `NavigationChromeV1` and `V2` had identical inline sheets, and both now render the binding with `onDone={completeArrivalNavigation}`. The `arrived*` styles left `navOverlayStyles`.
- The host keeps the arrival latch, the one-time announcement, the exit paths and Recenter's auto-follow. `NavigationViewModelV2`, thresholds, rerouting and voice are untouched. Markup, testIDs, styles, roles and spoken names are unchanged. The host's shared heading-focus hook is unchanged; while arrived, its ref is unattached, so the card's own hook focuses the title.
- Source-pin scripts (`navigation-buttons-v2`, `navigation-ui`, `ui-components`, `critical-actions`, `nav-safety-text-accessibility`) now pin the chrome's `onDone` wiring and read the markup and font floors from the SDK card.
- Covered by `ArrivalCard.test.tsx` (5 cases): delegation, copy, destination, and Recenter/Done/back each firing its own callback; hidden state and #301 padding; Urdu copy and wrapping; arrival focus; and the SDK card with host theme. The `NavigationChromeV1`/`V2` arrival suites still pass.
- **Next, B4c-3:** the `NavigationChromeV2` reroute banner.

### B4c-3 reusable RerouteBanner

- The SDK's `ui/RerouteBanner` is the settled-reroute status banner: one bordered warning box with centred 16/700 text and a polite live region. Its typed props are an already-localized `message` and a `theme` of colour tokens (`fill`, `border`, `text`). The file imports only `react` and `react-native`.
- `src/views/components/navigation/RerouteBanner.tsx` is the Ijtema binding, which supplies the `staticColors` warning tokens. `NavigationChromeV1` and `V2` had identical inline banners. Both now render `<RerouteBanner message={rerouteStatusMessage} />` inside their unchanged status-slot chain, ordered GPS lost or weak, then reroute, then basemap. The `rerouteHintBanner` and `rerouteHintText` styles left `navOverlayStyles`.
- The host keeps the status copy and when it clears, `reroutePending`, the priority chain and all reroute logic. The "Rerouting…" pending card stays in the chrome, because it shares the `instructionCard` style with the maneuver card. Markup, styles and the live region are unchanged. The previously noted no-op arrival-focus call is still tracked separately.
- Source-pin scripts (`navigation-buttons-v2`, `nav-safety-text-accessibility`) now pin the chrome's binding call and read the font floor from the SDK file.
- Covered by `RerouteBanner.test.tsx` (3 cases): delegation of colours, text style and live region; Urdu wrapping; and the SDK banner with a host theme. The `NavigationChromeV1`/`V2` status-priority and reroute view-model suites still pass.
- **Next, B4c-4:** the reroute pending card. It needs a decision on how its shared `instructionCard` base style crosses into the SDK.

### B4c-4 reusable RerouteProgressCard

- The SDK's `ui/RerouteProgressCard` is the in-progress "Finding a new way…" card. Its typed props are an already-localized `label`, a host-drawn `icon`, the host's shared turn-card `cardStyle` and a `theme` of colour tokens (`fill`, `text`). It overrides only fill, centring and gap on top of `cardStyle`, and keeps the 18px bold text. The file imports only `react` and `react-native`.
- Shared-style decision: `instructionCard` stays in `navOverlayStyles` and is injected by the binding; the SDK never copies or imports it. The maneuver card is unchanged.
- `src/views/components/navigation/RerouteProgressCard.tsx` is the Ijtema binding: `instructionCard`, the `RefreshCw` icon and the `rerouteBackground`/white tokens. `NavigationChromeV1` and `V2` now render `<RerouteProgressCard label={t('navigation.rerouting')} />` as the first branch of their unchanged `reroutePending` ternary. `rerouteCard` and `rerouteText` left `navOverlayStyles`. The card never had a test ID or live region, and none was added.
- Source-pin scripts (`navigation-buttons-v2`, `nav-safety-text-accessibility`) pin the binding call and read the font floor from the SDK file.
- Covered by `RerouteProgressCard.test.tsx` (4 cases: injected style, colours and icon; turn-card style untouched; Urdu wrapping; standalone SDK card) and two `NavigationChromeV2` priority cases (pending replaces the turn card and holds back the settled banner; settled restores both).
- **Next, B4c-5:** the GPS weak/lost status banner (`weakGpsBanner`, shared by V1 and V2).

### B4c-5 reusable GpsSignalBanner

- The SDK's `ui/GpsSignalBanner` is the weak/lost GPS warning. Its typed props are a `status` (`weak` | `lost`), an already-localized `message` and a `theme` of colour tokens (`fill`, `text`). `lost` is an assertive live region and `weak` a polite one, as before. Layout and the 16/700 centred text moved unchanged from `weakGpsBanner`/`weakGpsText`. The file imports only `react` and `react-native`.
- `src/views/components/navigation/GpsSignalBanner.tsx` is the Ijtema binding: `weakGpsBackground`/white tokens. `NavigationChromeV2` renders `<GpsSignalBanner status="lost" …/>` then `status="weak"` as the first two branches of its unchanged status-slot ternary; `V1` renders only the weak branch. Copy stays `t('navigation.lost'|'navigation.weak')` in the chromes. GPS detection, thresholds and the slot priority are untouched; `weakGpsBanner` and `weakGpsText` left `navOverlayStyles`.
- Source-pin scripts (`gps-signal-loss-v2`, `nav-safety-text-accessibility`) pin the binding calls and read the font floor from the SDK file.
- Covered by `GpsSignalBanner.test.tsx` (5 cases: colours and unchanged layout; assertive/polite per status, rendered once; Urdu wrapping; standalone SDK banner) and two `NavigationChromeV2` cases (lost during a pending reroute shows one lost banner beside the progress card and no weak banner; recovered GPS clears it).
- **Next, B4c-6:** the basemap-unavailable status banner (`mapUnavailableBanner`, last branch of the same slot in V1 and V2).

### B4c-6 reusable MapUnavailableBanner

- The SDK's `ui/MapUnavailableBanner` is the basemap-unavailable notice. Its typed props are an already-localized `message` and a `theme` of colour tokens (`fill`, `border`, `text`). It is a polite live region with no icon, testID or retry action, as before. Layout and the 14/20 centred text moved unchanged from `mapUnavailableBanner`/`mapUnavailableText`. The file imports only `react` and `react-native`.
- `src/views/components/navigation/MapUnavailableBanner.tsx` is the Ijtema binding: `bannerTranslucentWhite`/`border`/`iconMuted` tokens. V1 and V2 render it as the last branch of their unchanged status-slot ternary, so GPS and reroute status still outrank it. Copy stays `t('navigation.mapUnavailable')` in the chromes. Basemap loading, PMTiles availability (`hasBaseMap`) and any recovery stay host-owned; nothing in MapLibre, assets or connectivity changed.
- `test-navigation-ui` pins the binding call. Covered by `MapUnavailableBanner.test.tsx` (4 cases: colours and unchanged layout; one polite announcement; Urdu wrapping; standalone SDK banner) and a `NavigationChromeV2` case (shown once without a basemap, hidden with one); the existing #66/#156 cases keep priority and live-region coverage.
- **Next, B4c-7:** the V2 entry-gate origin banner (`v2EntryGateBanner`), the smallest remaining status-stack leaf.

### B4c-7 reusable EntryGateOriginBanner

- The SDK's `ui/EntryGateOriginBanner` is the V2 "route starts from {origin}" notice. Its typed props are an already-localized `message` (origin name already filled in) and a `theme` of colour tokens (`fill`, `border`, `text`). It is plain text with no icon, testID, live region or action, as before. Layout and the 12px bold centred text moved unchanged from `v2EntryGateBanner`/`v2EntryGateText`. The file imports only `react` and `react-native`.
- `src/views/components/navigation/EntryGateOriginBanner.tsx` is the Ijtema binding: `entryGateBackground`/`entryGateBorder`/`focusedBlock` tokens. It is V2-only; V1 never had it. `NavigationChromeV2` keeps the visibility rule (`startedOutside && entryGateId`), the copy `t('navigation.origin', …)` with `localizeVenueName(route.origin.label)`, and its place below the single status slot. Gate recommendation, origin selection, EntryGateRoutingService and GPS stay host-owned and unchanged; gates 18/19 remain field-blocked.
- Covered by `EntryGateOriginBanner.test.tsx` (4 cases: colours and unchanged layout; one non-live announcement; Urdu wrapping; standalone SDK banner) and two `NavigationChromeV2` cases (shown once below a lost-GPS banner; hidden for inside starts and outside starts without a gate).
- **Next, B4c-8:** the V2 direct-gate chooser (`directGateOptions`), the next leaf of the same status stack.

### B4c-8 reusable GateChooser

- The SDK's `ui/GateChooser` is the V2 direct-guide "Choose a gate" list. Typed props: an already-localized `title`, `options` (`id`, localized `label`, localized `accessibilityLabel`, optional `disabled`, SDK-only: the Ijtema binding never sets it) rendered in the order given, `selectedId`, `onSelect(id)`, and a `theme` carrying the host `Button` plus colour tokens (`fill`, `border`, `title`). The selected gate gets the `secondary` variant, others `outline`, as before. Layout moved unchanged from `directGateOptions`/`directGateOptionsTitle`. It has no search, scroll, Modal or Back handling because the inline list never did; no testIDs existed. The file imports only `react` and `react-native`.
- `src/views/components/navigation/GateChooser.tsx` is the Ijtema binding: `t('navigation.chooseGate')`, `t('navigation.useGate')`, `localizeVenueName`, the app `Button` (52dp targets) and warning tokens. V2-only; V1 never had it. `NavigationChromeV2` keeps `showGateOptions` (toggled by the outside status card, closed on selection), the `directOutsideActive` visibility rule, `availableOutsideGates` eligibility, `manualGateId` and the `selectOutsideGate` call. EntryGateRoutingService, chooser generation, fresh-GPS activation and manual-to-live stay host-owned and unchanged; gates 18/19 remain field-blocked.
- Covered by `GateChooser.test.tsx` (5 cases: copy, Button and unchanged layout; order, selected styling and callback; 52dp targets and Urdu wrapping; standalone SDK with a disabled option; empty list) and two `NavigationChromeV2` cases (open/close toggle, close on selection, one host call; no chooser for road-following outside legs).
- **Then, B4c closeout:** confirm no V2 status-stack leaf remains inline, then pick B4d.

### B4c closeout

- **Verified at `0468cc8`** (inspection and static checks only, no new extraction). `packages/offline-navigation/src/ui/` holds 13 components plus `useAccessibilityFocus`. Each has exactly one production importer, its thin Ijtema binding (`src/views/components/{map,navigation}/`), and no other copy in the app. The SDK UI files import only `react`, `react-native` and `./useAccessibilityFocus`. They contain no Ijtema copy, i18n, Zustand, GPS, routing, lucide or `staticColors`. Hosts supply resolved copy, `isRTL`, the theme (Button, Card, Container, icons, colour tokens) and every callback.
  - **V1/V2:** ArrivalCard, RerouteBanner, RerouteProgressCard, GpsSignalBanner and MapUnavailableBanner are shared by both chromes. EntryGateOriginBanner and GateChooser are V2-only, as before. The status-slot priority is unchanged in the host ternaries. V2 runs lost > weak > reroute > map-unavailable. V1 runs weak > reroute > map-unavailable and has no lost branch. In V2, the entry-gate banner, outside status card and gate chooser follow as separate siblings. No inline V2 status-stack leaf remains. `OutsideRouteStatusCard` is already a separate host component, tied to `OutsideRouteLocalizationService`.
  - **Domain:** `src/domain` uses relative imports only. `test-astar-extraction` PASS, and `test:sdk-headless` PASS (35 checks). The loaded graph has no RN, Expo, Zustand, app code or Ijtema data. `NavigationSession` stays React-Native-free.
- **Known gaps (tracked, not blockers for B5a):**
  - The `RouteGuideCard` binding chevrons still use `backChevron()`/`forwardChevron()`, which read the global `isRtl()` rather than the `useI18n` direction. The SDK component itself takes `isRTL`.
  - `NavigationChromeV1`/`V2` still call `useAccessibilityFocus("arrival")` on a maneuver heading that is unmounted after arrival. That call is a no-op, because `ArrivalCard` owns arrival focus.
  - EMU-N8 has no record in this repo. It and iOS acceptance (B7) remain unverified; there is no iOS consumer build or device evidence.
  - Gates 18/19 (#43/#44) remain field-blocked (`ground_truth_required`); no connectors were added.
- **Remaining SDK scope:**

  | Area | State |
  |---|---|
  | Reusable UI | Done as leaves: 13 components listed above. |
  | Navigation shell/chrome | Host-owned: `NavigationChromeV1`/`V2` (instruction card, trip info, recenter, status-slot composition), `LocationSheet`, `DirectionsSheetFooter` and `OutsideRouteStatusCard`. |
  | MapLibre/PMTiles | Host-owned: `@maplibre/maplibre-react-native` 11.5.0, the map canvas, layers and pack assets. No SDK adapter exists. |
  | GPS/permissions | Host-owned: `GPSManagerService` and the permission and recovery prompts. The SDK domain takes injected ports only. |
  | Ijtema integration | 13 bindings plus 16 production imports of `src/domain`, all by relative path into `packages/`. |
  | RN package deps | None declared. There is no `packages/offline-navigation/package.json`, no workspaces and no `exports`/index. `react` 19.1.0 and `react-native` 0.81.5 are implied peers. |
  | Native/device | Android only (emulator/APK). iOS, B7 and field walking are open. |

- **Importable today?** A new RN app cannot `import` the SDK as a package: there is no manifest or entry point. It could only copy-reference individual files by path. What reuse exists is component-level: the 13 presentational leaves and the headless `NavigationSession`/routing domain. There is no ready-made navigation experience (map, chrome, GPS and sheet stay host-owned).
- **Decision: B5a, package contract.** The boundaries are clean and statically enforced, and none of the gaps above affect a package contract. The first small task is B5a-1:
  - Add a private 0.x `packages/offline-navigation/package.json` with `react`/`react-native` as peers.
  - Add a headless `src/index.ts` and a `src/ui/index.ts` barrel.
  - Add one boundary test that pins the public export list.
  - No workspaces, Metro, Gradle or Pod changes, and no app import rewrites.

### B5a-1 package manifest and public exports

- `packages/offline-navigation/package.json`: private `@muslim-ummah/offline-navigation` 0.1.0, Apache-2.0, `sideEffects: false`, no `dependencies`. `react` >=19.1.0 and `react-native` >=0.81.0 are optional peers; headless consumers need neither.
- Source-only: `main`, `types`, `react-native` and every `exports` target point at `.ts` source. There is no build output. A consumer needs a TS-aware bundler (Metro on Expo 54 resolves `exports` by default) or its own compile step; plain Node cannot run it uncompiled.
- Public entrypoints:
  - `.` is headless: A*, MinHeap, SpatialGrid, isValidCoordinate, journey, session, street and venue.
  - `./session` is NavigationSession only.
  - `./ui` is the 13 leaves plus `useAccessibilityFocus`.
  - Deep `src/...` paths are not exported. SpatialGrid's internal `haversineM` is deliberately not re-exported, because venue owns the public one.
- `scripts/test-sdk-exports.mjs` (`npm run test:sdk-exports`, in `npm test`) runs 8 checks:
  - The manifest and every target it names exist.
  - The UI barrel matches the `.tsx` file list.
  - The headless import graph never reaches react, react-native or `ui/`.
  - No package file imports the host app.
  - A throwaway consumer type-checks all three entrypoints by package name (bundler resolution), and is refused deep paths and root-level UI.
  - The compiled headless entry runs in plain Node without loading React.
- Not covered: consumer installation, a Metro bundle by package name and workspaces. Ijtema still imports by relative path and is unchanged.
- **Next (B5a-2 candidate):** make Ijtema consume the package by name (a `file:` or workspace link plus Metro and TS resolution), switch one binding's import, and prove it with an Android bundle.

### B5a-2 real package consumer and Android JS export (#382)

- Root npm workspace includes only the existing `packages/offline-navigation`; the app depends on `@muslim-ummah/offline-navigation` 0.1.0. npm creates the reproducible local link. No global link, extra app, compiled SDK distribution or dependency upgrade. Lockfile adds workspace records and npm recalculates peer metadata; existing versions/integrities remain unchanged.
- Only `src/views/components/navigation/MapUnavailableBanner.tsx` now imports `@muslim-ummah/offline-navigation/ui`; its copy, theme, layout and polite live region are unchanged. Other host bindings remain relative imports. Its four existing Jest tests exercise the public entrypoint without a resolver alias.
- **SOURCE/RUNTIME VERIFIED (PC 1, 2026-10-23):** the actual host TypeScript import resolves through package exports; app and SDK share React 19.1.0 and React Native 0.81.5. Existing headless/export/boundary contracts remain required. `npm ls react react-native --all` still reports the pre-existing test-renderer 1.2.0 / react-reconciler 0.33.0 peer requirement (`react ^19.2.0` versus installed 19.1.0); no duplicate React/RN instance was added and no broad dependency repair is included.
- **ANDROID PRODUCTION JS BUNDLE VERIFIED (not APK/native/device):** installed Expo CLI export with `--platform android --source-maps --dump-assetmap --max-workers 2` succeeds. Metro source map includes the host public import, SDK `src/ui/index.ts` entrypoint and SDK banner; the asset map retains `ijtema-basemap.pmtiles`. No Metro/native configuration changes were necessary.
- Evidence outside Git: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b5a-2/` (validation logs, Android export and `resolution-evidence.json`). Hermes bundle SHA-256: `7937342e57230add89c37b6cdaff5c5c691e26973263d6dcb37685f58c75cf0e`.
- Final source gates: `npm run typecheck`, `npm run lint` (zero errors, one existing generated-file warning), `npm test` (including 35 SDK headless and 8 export checks), `git diff --check`, focused banner Jest (4/4) and one full `npm run test:components -- --runInBand` (186 suites / 1,788 tests) pass. Existing React `act` console warnings and Metro `use-latest-callback` export fallback warnings are not failed assertions. Independent read-only review found no actionable issues.
- Remaining: source-only SDK still requires a TS-aware bundler or compilation. This proves one existing consumer, not standalone distribution, all-binding migration, native acceptance, iOS readiness or a ready-made navigation screen. B5a-3 is not started and requires its own bounded scope/owner authorization.

### B5a-3 reproducible compiled private artifact (#383)

- **Contract:** the existing npm workspace keeps its TypeScript source exports for Expo. Distribution is an explicit, separate command: `npm run pack:sdk -- /absolute/path/outside-repository`. `scripts/sdk-package/pack.mjs` uses the installed, lockfile-controlled TypeScript compiler and `packages/offline-navigation/tsconfig.build.json` to emit CommonJS ES2020 JavaScript plus declarations into external staging. It derives the artifact manifest from the source manifest, redirecting root, `/session` and `/ui` to matching `dist/*.js` and `dist/*.d.ts`. Version 0.1.0, `private: true`, public API, optional React/RN peers and no runtime dependencies remain unchanged. Raw `npm pack` from the source package is still source-only; use the dedicated command for the compiled artifact. No registry publication or new build dependencies.
- **Contents and reproducibility — SOURCE/RUNTIME VERIFIED (PC 1, 2026-10-23):** `npm pack --dry-run --json` checks the staged allowlist before the actual pack. Artifact has 69 files: manifest and compiled SDK JS/declarations only; no host data, source maps, private configuration, caches, native outputs or repository paths. Two independent compilations/staging directories produce byte-identical tarballs with this installed toolchain. SHA-256: `bb13fd89a91c15adaa1e590c2ff5c8bc4306db8c33cdb857d31c9978b5cdb176`. This does not promise identical compiler output across arbitrary toolchain versions.
- **Independent consumer — SOURCE/RUNTIME VERIFIED:** `npm run test:sdk-package -- /fresh/outside-repository/evidence-directory` installs the tarball offline into a tiny non-Git fixture, with lifecycle scripts and automatic peer installation disabled. Plain Node, without a TS loader, repository cwd, NODE_PATH or React/RN, runs the artifact's A* cheapest-path routing, heap ordering and session supersession/commit/cancellation. Root/session agree, deep private exports are rejected, and root does not expose UI. Headless declarations resolve from the installed artifact. A separate UI declaration probe resolves `/ui` using the existing host React/RN peers via fixture-only links (no duplicate peer installation); those links are not packaged and are not needed by the headless runtime. Build/test tooling uses the repository's compiler, but the artifact contains no absolute repository dependency.
- **UI/native limit:** artifact contains compiled UI entrypoints and declarations suitable for an RN-aware consumer. Plain Node UI execution is not claimed. Independent Metro/native app consumption is **NOT VERIFIED**. B5a-2 Android workspace bundle evidence remains historical evidence for workspace consumption only; PMTiles and Metro configuration are unchanged. No full navigation screen, native adapters, iOS/device or field acceptance is added here.
- Evidence: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b5a-3/`; final artifact and `evidence.json` under `final/`, with both pack inspections and isolated consumer retained. No root dependency or lockfile changes. The known test-renderer/react-reconciler React peer mismatch still causes `npm ls` ELSPROBLEMS; artifact consumer checks confirm shared peer identity and no duplicates. Usage metrics were unavailable (UNKNOWN).
- Next bounded candidate (B5a-4, not started): install this tarball into an independently configured RN/Expo consumer fixture and prove Metro production resolution, with explicit peer/toolchain compatibility. Native/device acceptance remains separate.
- Final gates **SOURCE/RUNTIME VERIFIED:** package/consumer smoke passed; `npm run typecheck`, `npm run lint` (0 errors, the existing generated-file warning), focused banner Jest (4 tests), full Jest once (186 suites / 1,788 tests), `npm test` once (including 35 headless / 8 export checks), and `git diff --check` passed. Existing React `act` console warnings are not assertion failures. Independent read-only code/evidence/roadmap review found no actionable issues. Reproducibility toolchain: Node v24.14.0, npm 11.9.0, TypeScript 5.9.3.


### B5a-4 independent Metro evidence and B6a-1 first host session migration (#384)

- **B5a-4 — HISTORICAL EVIDENCE (PC 1, 2026-10-23):** the unchanged B5a-3 compiled 0.1.0 tarball (SHA-256 `bb13fd89a91c15adaa1e590c2ff5c8bc4306db8c33cdb857d31c9978b5cdb176`) was installed into one external non-Git fixture. Android production Metro export passed (586 modules), resolving installed `dist/ui` and `dist/domain/session` public entrypoints; source-map contents matched the installed artifact. Shared local Expo 54 / React 19.1.0 / RN 0.81.5 toolchain dependencies were reused through fixture links; this was not a fresh dependency installation. Independent read-only review was clear. Evidence: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b5a-4/RESULT.md`. This supersedes the earlier independent-Metro NOT VERIFIED status, without claiming native acceptance.
- **B6a-1 scope:** only production `NavigationViewModelV2` now imports the factory and type from `@muslim-ummah/offline-navigation/session`. Package exports resolve to the same existing session barrel and implementation. No lifecycle, generation guard, routing, GPS, cancellation or UI logic changed. Its existing session suite now mocks the public import and explicitly verifies public/relative module and factory identity.
- **SOURCE/RUNTIME VERIFIED:** six focused suites / 40 tests cover ownership, supersession, cancellation, arrival, Exit/unmount, session reuse, and unchanged Directions/manual-upgrade behavior. Android production JS export source map includes the migrated host public import and exactly one session implementation, React index and RN index; PMTiles remains in the asset map. No package, lockfile, Metro or native configuration changed. Bundle SHA-256 `da3a32ff3c910a2610e5b9eaaeb40d4c1ec3aab100b63b5b44e45c4b6696398d`. Evidence and validation logs: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b6a-1/`.
- Remaining direct session consumers: `DirectionsViewModel` and `useManualLiveUpgrade`, deliberately unchanged. Other direct source imports remain in domain forwarding services/utilities, store policy, venue/street adapters and UI wrappers. **Exact next bounded B6a-2 candidate:** migrate only DirectionsViewModel session imports to the public `/session` entrypoint, preserving preview cancellation and stale-result guards; requires separate owner instruction. No B6a-2 work started. JS bundling does not establish APK/device/iOS/field acceptance.
- Final source validation: `npm run typecheck` passed; `npm run lint` passed with zero errors and one existing generated-file warning; `npm test` passed once (including 35 SDK headless and 8 export checks); full `npm run test:components -- --runInBand` passed once (186 suites / 1,789 tests); `git diff --check` passed. Existing React act console warnings and use-latest-callback Metro export warnings were not assertion or bundle failures.
- Independent read-only review: CLEAR, no actionable findings in the scoped code/test changes or Metro evidence. Reviewer required full Jest completion before commit; its successful exit and final totals above were then confirmed by the implementer.

### B6a-2 Directions preview session package migration (#385)

- Scope: only production `DirectionsViewModel` factory/type imports move to `@muslim-ummah/offline-navigation/session`. No lifecycle, request, abort, generation, routing, GPS or UI logic changes. `useManualLiveUpgrade` remains unchanged.
- Public exports resolve to the same session barrel; the Directions suite now mocks the public entrypoint and checks module/factory identity against the existing relative implementation.
- Verification evidence: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b6a-2/`. Final results are recorded below. JS export evidence does not imply native/device/iOS acceptance.
- Exact next bounded candidate B6a-3: migrate only `useManualLiveUpgrade` session imports, preserving upgrade ownership and cancellation; requires separate owner authorization. Other direct domain/adapter/UI source bindings remain outside this milestone.
- **SOURCE/RUNTIME VERIFIED (PC 1, 2026-10-23):** focused Jest 3 suites / 29 tests; full Jest once 186 suites / 1,790 tests; typecheck; lint (zero errors, one existing generated-file warning); npm test once including 35 SDK headless / 8 export checks; diff-check passed. Existing React act console warnings are not failed assertions.
- **ANDROID PRODUCTION JS BUNDLE VERIFIED:** one export passed (3,547 modules); source-map evidence confirms the Directions public import, one session implementation, one React/RN entry each; shared peer realpaths and PMTiles asset retained. Bundle SHA-256 `b96e2fca3b4dcc53c12f6e68417ddabe9e3c98ab4ef410c4d4926c6aae9784b9`. Existing use-latest-callback export fallback warnings did not fail bundling. No package, lockfile, Metro or native changes.
- Independent read-only review CLEAR, no actionable findings. Its outstanding full-Jest completion condition was subsequently verified by the implementer (successful exit and totals above) before commit. Both stashes and detached checkout are preserved. Remaining direct production session owner: `useManualLiveUpgrade`.

### B6a-3 manual-to-live session package migration (#386)

- Scope: only production `useManualLiveUpgrade` factory/types now import `@muslim-ummah/offline-navigation/session`. No lifecycle, confirmation, GPS, route validation, generation, cancellation, rollback or one-shot activation logic changed. The regression suite mocks the public entrypoint and proves identical module/factory identity against the existing source barrel.
- **SOURCE/RUNTIME VERIFIED (PC 1, 2026-10-23):** focused Jest 4 suites / 58 tests; full Jest once 186 suites / 1,791 tests; typecheck; lint (0 errors, one existing generated-file warning); npm test once including 35 SDK headless / 8 export checks; diff-check passed. Existing React act warnings are not failed assertions.
- **ANDROID PRODUCTION JS BUNDLE VERIFIED:** one export passed (3,547 modules). Source map confirms the migrated public import, one session barrel/implementation and one React/RN index each; host/SDK peer realpaths agree and PMTiles remains in the asset map. Bundle SHA-256 `87f7ab7a745eaadf7db374d0cbf710f1969ff8ffa4e839647dfc95e6e8cf41d2`. Existing use-latest-callback fallback warnings did not fail export. No package, lockfile, Metro or native changes. This is not APK/device/iOS/field acceptance.
- Independent read-only review CLEAR; its full-Jest/npm completion conditions were verified before commit. Evidence: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b6a-3/`. Both stashes and detached checkout preserved.
- No direct production imports of SDK session source remain under `src`; all three session owners use the public entrypoint. B6a is ready for a separately authorized closeout. Other direct SDK domain/adapter/UI imports remain outside this scope; B6b has not started.


### B6a CLOSED; B6b readiness only (#387)

- **LIVE/SOURCE VERIFIED (PC 1, 2026-10-23):** start HEAD and live GitHub SDK ref both `5547069b10d86768ca95edfeecca3239daa856a6`, clean checkout. Owner's exclusive PC 1 SDK authorization remains in effect; no competing local SDK writer was observed in the targeted process check. PC 2 filesystem/session state is not remotely verified. Both preserved stash objects (`b5a47d6c39274b77d5cb8132e4c4b28f1092a734`, `6d4a9c8de0ab763ca3719b50caa2c782d9d11cce`) and two registered worktrees remain unchanged. The detached checkout is a pending policy exception, not a technical SDK blocker. Current five-hour/weekly metrics are UNKNOWN (usage API unavailable); no expensive validation started.
- **B6a COMPLETE:** `NavigationViewModelV2`, `DirectionsViewModel`, and `useManualLiveUpgrade` all import factory/types through `@muslim-ummah/offline-navigation/session`. Targeted production-source search finds no private session-source imports. Test-only identity probes intentionally reference the source barrel; SDK-internal relative imports are implementation details, not host boundary violations. Package exports and current realpaths select the existing session barrel, with one implementation. Host and SDK resolve the same React/RN files; no resolver aliases or dependency changes.
- **Exact-head reused SOURCE/RUNTIME evidence:** B6a-3 at the above HEAD passed focused Jest 4 suites / 58 tests, full Jest 186 / 1,791, typecheck, lint (one existing warning), npm test (headless 35 / exports 8), and diff-check. Its Android production JS map shows one session implementation and shared peers; PMTiles retained. Evidence: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b6a-3/completion.md` and sibling resolution/validation files. Import-only B6a changes preserve independent preview/live/upgrade ownership, cancellation, generation/late-result guards, arrival cleanup and explicit manual-to-live confirmation; no policy redesign. These suites/bundle were not rerun for this documentation-only closeout. Fresh `npm run test:sdk-exports` passes 8 checks, including package-name type resolution, private-boundary rejection and headless runtime separation.

#### Remaining production domain-source boundaries (SOURCE VERIFIED inventory)

All paths below are under `src/`. All referenced domain APIs are already available from the SDK root unless noted; this is an inventory, not authorization to migrate them.

| Production consumer | Domain responsibility / public availability | Existing coverage / migration risk |
|---|---|---|
| `utils/isValidCoordinate.ts` | Pure coordinate predicate; root exports same named function | Export type probe; B6b-1 must add explicit runtime identity and finite/range edge cases. Lowest risk: one forwarding binding |
| `utils/MinHeap.ts`, `utils/AStar.ts` | Headless algorithms; root exports existing APIs | SDK headless and routing contract coverage; low risk, separate migrations |
| `utils/SpatialGrid.ts` | Headless spatial lookup; root exports SpatialGrid/SpatialGridPoint | SDK headless / OutsideStreetRoutingService tests; medium risk: source also forwards `haversineM`, while root deliberately selects venue's public version. Never blindly replace wildcard |
| `services/LocationCapability.ts` | Pure journey capability policy with host clock/localized copy; root exports policy/types | LocationCapability + JourneyPolicyCharacterization tests; medium, preserve facade/copy/time semantics |
| `services/LocationNavigationCapability.ts` | Pure start policy with host clock/copy; root exports policy/types | LocationNavigationCapability + JourneyPolicyCharacterization tests; medium |
| `services/JourneyPresentationState.ts` | Pure journey presentation forwarding; root exports API | JourneyPresentationState + DirectionsJourneyState tests; low/medium |
| `store/useAppStore.ts` | Destination journey policy consumed by host store; root exports policy | JourneyPolicyCharacterization / destination and journey integration suites; medium due to store ownership |
| `services/RoutingServiceV2.ts` | Generic venue path functions and StreetRoutingGraph type; root exports both | RoutingServiceV2 / reroute / gate-selection regressions; higher risk: host owns Ijtema gates, complete-journey selection/composition; keep these policies in host |
| `services/OutsideStreetRoutingService.ts` | Generic street graph/search; root exports API | OutsideStreetRoutingService tests and headless contracts; medium/high, preserve provider/fallback/connector policy |
| `services/outsideRouting/ProductionOutsideRouteSource.ts` | StreetRoutingGraph type; root exports type | Outside routing/provider regression coverage; low runtime risk, host provider wiring remains host-specific |
| `data/ijtema/streetAdapter.ts`, `data/ijtema/venueAdapter.ts` | Public graph/venue types adapting Ijtema data; root exports types | SDK headless contracts and host routing tests (indirect adapter coverage); low runtime risk, venue data/adaptation stays host-owned |

- Remaining direct SDK UI bindings: `views/hooks/useAccessibilityFocus.ts`; navigation wrappers `RerouteBanner`, `EntryGateOriginBanner`, `GateChooser`, `ArrivalCard`, `GpsSignalBanner`, `RerouteProgressCard`, `ActiveDirectionsPanel`; map wrappers `ManualLiveUpgradeCard`, `RouteGuideCard`, and `DirectionsSheetParts` (DirectionsHeader, RouteEndpointRows, StartOptionCard). These have the existing public `/ui` barrel available; they are deferred, not migrated. `MapUnavailableBanner` already uses `/ui`. SDK-internal paths and test probes are excluded from this production list.
- **Recommended B6b-1 ONLY (not started):** change the existing `src/utils/isValidCoordinate.ts` forwarding binding to the explicit named root export `export { isValidCoordinate } from '@muslim-ummah/offline-navigation';`. No new export, extraction, routing logic or host caller changes. Acceptance: confirm identical function identity through host facade/public root/source; cover finite values, NaN/infinity, valid boundaries and out-of-range latitude/longitude; preserve existing callers. Run focused predicate/affected consumer tests, headless/export checks, typecheck/lint/diff-check and required final project validation; one Android JS export should confirm the root boundary remains headless, shared peers and PMTiles. Review independently before normal commit/push. Stop if API identity differs; do not add aliases or expose private modules.
- **Limitations:** this closes only session consumption. Root domain and UI migration remain incomplete; no ready-made navigation screen/native adapter completion is claimed. JS export is not APK/native/device/iOS/field acceptance; EMU-N8, iOS and Gates 18/19 field evidence remain separate acceptance concerns, not re-tested here. Existing React peer/tooling warnings remain outside this scope. B6b requires a separate instruction and has not begun.
- Closeout independent read-only review: **CLEAR**, no actionable findings; reviewer checked source inventories/public barrels, import-only B6a diffs and external exact-head evidence. Fresh diff-check passed; only this roadmap changed. Full Jest/npm/Android checks were intentionally reused, not rerun.

### B6b-1 public coordinate facade (#388)

- Only production change: `src/utils/isValidCoordinate.ts` now explicitly re-exports `isValidCoordinate` from `@muslim-ummah/offline-navigation`. The root already forwards the same domain function. No new API, wrapper, duplicate implementation, caller, routing, GPS, session, UI, dependency or configuration change.
- **SOURCE/RUNTIME VERIFIED (PC 1, 2026-10-23):** new focused predicate tests prove facade/public/domain reference identity and 17 finite/range cases (zero/signed zero, confirmed existing coordinate, all boundary corners, both out-of-range signs and NaN/positive/negative infinity in either axis). Focused Jest: 5 suites / 68 tests. SDK headless 35 checks and exports 8 checks pass. An external root import-graph check finds 19 modules, no cycles, host/UI/React/RN dependencies, one coordinate implementation and shared host/SDK React/RN realpaths. Typecheck and lint pass (0 errors, one existing generated-file warning); diff-check passes.
- **ANDROID PRODUCTION JS BUNDLE VERIFIED:** one bounded existing Expo export (`--platform android --source-maps --dump-assetmap --max-workers 2`) passes. Source map includes the migrated facade public import, root barrel, exactly one coordinate implementation and one React/RN entry each. PMTiles remains in assetmap. Bundle SHA-256: `9becefd83f624174e190feaad8a352ce51b88ee5614d401f0198b023fea88a8f`. Evidence: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b6b-1/`.
- `npm test` passes once, including required all-gates (16 passed / 0 failed / 2 blocked pending physical ground truth: Gates 18/19), outside street gate cost, core provider contract and reroute regressions. Full `npm run test:components -- --runInBand` passes once: 187 suites / 1,809 tests / 0 failures. Independent read-only review: **CLEAR**, no actionable findings; reviewer inspected the production diff, public/domain boundary, tests and external evidence without rerunning checks. Existing React act/tooling and routing diagnostic messages do not establish native behavior. No native build, emulator, device, iOS or field validation was performed.
- **Next bounded B6b candidate (not started):** migrate only `src/utils/MinHeap.ts` to its existing public root export, after verifying its current export surface and reference/type identity. Requires separate owner instruction. B6b-1 stops here; remaining inventory above remains deferred.

### B6b-2 public MinHeap facade (#389)

- Only production change: `src/utils/MinHeap.ts` explicitly re-exports the existing named generic class from `@muslim-ummah/offline-navigation`. Public/domain/facade class identity is exact. No implementation, AStar, routing, graph, UI, metadata, dependency or configuration changes. Updated only the old private-import structural assertion and added focused identity/generic/empty/tie-order Jest coverage.
- **SOURCE/RUNTIME VERIFIED (PC 1, 2026-10-23):** focused Jest 1 suite / 2 tests; heap operations/stress checks; AStar 2,400 differential comparisons and golden/tie/source-hash checks pass. Golden path/cost parity over 91,506 venue pairs passes. Headless 35 checks, exports 8 checks, typecheck and diff-check pass. Lint: zero errors, one existing generated-file warning. Root graph: 19 modules, no cycles/host/UI/external imports; one heap implementation and shared peer realpaths. Full `npm run test:components -- --runInBand` once: 188 suites / 1,811 tests pass. `npm test` once: exit 0, including required gate-cost/provider/reroute regressions; existing Gates 18/19 ground-truth blocks remain. Existing React act/diagnostic warnings remain.
- **ANDROID PRODUCTION JS BUNDLE VERIFIED:** one bounded Expo export passes; source map contains public root and exactly one heap implementation; PMTiles preserved. Legacy heap facade is not reached by production entrypoint, so its import resolution/identity is proven by Jest/Node, not this bundle. Bundle SHA-256 `9becefd83f624174e190feaad8a352ce51b88ee5614d401f0198b023fea88a8f`. Evidence and exact commands: `/Users/ghilmankhan/Documents/offline-map-audits/pc1-2026-10-23/b6b-2/completion.md`. No native/emulator/device/iOS/field verification.
- Independent read-only review: **CLEAR**, no actionable source findings; focused evidence reviewed. Final full-suite results confirmed separately by coordinator. Both original stashes/worktrees preserved. No canonical merge.
- **Next bounded B6b candidate (not started):** `src/utils/AStar.ts` public root facade migration, preserving named types/functions, identity and golden/differential parity. B6b-2 stops here.
