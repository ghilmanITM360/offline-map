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
