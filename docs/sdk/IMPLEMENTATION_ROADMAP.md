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
