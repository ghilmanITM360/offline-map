# SDK contract tests and distinct readiness gates

B1 evidence: docs-only source/config inspection; no new runtime acceptance. Phase A source results are still at matching source SHA6996b7e: 165/1602 components, lint0errors/1warning, routing16PASS/2fieldBLOCKED/0FAIL. No fresh Jest campaign required for these docs. Dependency inventory66 (13moderate/52high/1critical) remains open in [#370](https://github.com/ghilmanITM360/offline-map/issues/370); B1 performs no remediation or new audit.

## Contract suite translation

| Preserved invariant | Proposed proof and current seam |
| --- | --- |
| Fresh usable GPS → destination → route → guarded automatic live | PendingJourneyState, DestinationLiveIntent, LocationCapability, JourneyPolicyCharacterization and LocationSheet tests: origin must belong to current journey; require usable fix at commit. |
| No usable GPS → origin resolution → preview → explicit manual | JourneyPresentationState/routeGuide store tests: no watcher/reroute/arrival in manual mode. |
| Block2 hypothetical until confirmation | Origin/planner policy tests: no live/manual authorization from preview alone. |
| Manual-to-live replacement preview and rollback | useManualLiveUpgrade/manualLivePreview: failed upgrade keeps guide; stale preview cannot commit. |
| Directions PEEK/reopen + active Directions | LocationSheet/DirectionsPeekHandle/NavigationChrome tests; native UX21 interaction still required. |
| Invalid/stale/inaccurate/permission-lost GPS freezes progress | GPSManagerService/LocationCapability/NavigationViewModelV2: no simulated advancement/arrival, recover only fresh authority. |
| Stale requests never activate navigation | DirectionsViewModel/OutsideRouteRequestCoordinator: abort/dispose/destination/venue/session epoch tests, delayed callback after unmount. |
| Complete gate cost/manual override and truthful direct guide | RoutingServiceV2/outside provider contract: geometry/endpoints/classification plus gate selection cost; no false road route. |
| One implementation / v1 rollback ownership | Import graph assertions, sourceVersion dispatch; don't extract v1 as second SDK engine. |
| Offline availability | Headless data tests plus actual map/PMTiles/airplane tests; no style network URLs/auth/geocoding prerequisite. |
| No process-death live resume | useAppStore/dataRetention/unfinishedJourney tests; persisted destination only, fresh capability evaluation. |
| Localized semantic instructions/RTL | i18n/instructions + map label tests; stable IDs, Roman UrduLTR, view-local UrduRTL, mapgeometry unchanged. |
| Cleanup and host isolation | Multiple mount/unmount/controllers, one presentation lease, timers/watchers/subscriptions/pack pins released, no callbacks after dispose. |
| Pack safety | Signature/schema/hash/size/path adversarial fixtures, unknown keys, no-code allowlist, crash at each transaction step, LKG/pin/downgrade tests. |

Domain changes require existing algorithm/routing fixture parity plus `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:components -- --runInBand`, `git diff --check`, `npm run test:all-gates-v2`, `npm run test:outside-street-gate-selection-cost-v2`, `npm run test:core-provider-routing-contract-v2`, `npm run test:reroute-v2`. Localization scanner `node --import tsx scripts/hardcoded-strings.ts`; data integrity `npm run data:check`; basemap `npm run test:offline-basemap`. Inspect scripts before running. Do not force gates18/19 green with invented data.

## Readiness boundaries

| Gate | Required evidence / current state |
| --- | --- |
| Internal SDK architecture | B1 docs reviewed, owner design approval pending; implementation not built. |
| Internal SDK extraction | Phase A permits incremental implementation after B1 approval; private contracts/source/CI parity per milestone. |
| Android integration | Real consumer build + emulator interactions, permissions/sheets/offline/RTL/large font; not established by B1. |
| iOS integration | Current dependency graph rebuilt, iOS precision/path parity and consumer simulator/device tests; NOT VERIFIED. |
| Offline data packs | Signed verifier/transactions/pinning/adversarial tests on both filesystems; proposed only. |
| Consumer integration | Both actual apps build and use same package, independent identities, no private imports/duplicate engines; Muslim Ummah not created. |
| Public release | Native/device/field acceptance, security remediation or explicitly approved exceptions, signing/privacy/licenses/proxy deployment as applicable; NOT AUTHORIZED. |

UX21/25/26/27, airplane mode, 320dp/200% text, Urdu native rendering, TalkBack/VoiceOver speech, real GPS/arrival and iOS remain unverified. Gates18/19 require physical venue geometry evidence. Security deferrals in [security status](../DEPENDENCY_SECURITY_STATUS.md) remain genuine risks for build/dev hosts and future pack tooling: untrusted PR assets, configuration and certificates cannot be deemed safe because a mobile exploit was not established. Reassess reachability when importer/downloader/signing changes add attack surfaces. Keep remediation isolated from extraction; no audit fix --force or native upgrades in B1.

Before private packaging audit package contents/SBOM/licenses, native peer graph, no configs/recovery archives/credentials. MapLibre RN installed license MIT; preserve native framework notices and current OSM ODbL attribution/provenance. [Release/privacy](../RELEASE_SECURITY_PRIVACY.md) and [owner actions](../KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md) remain governing facts; do not invent legal text, signing keys or distribution enrollment.
