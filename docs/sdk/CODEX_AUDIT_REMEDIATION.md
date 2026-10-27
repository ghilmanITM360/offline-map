# Codex independent audit — remediation ledger and retest handoff (SDK 0.1.0, #392)

Audit baseline: `13f46292648e9d7cf34713d9487f3835e923fd2a` (tarball `69a78793…4a19`). Evidence: `~/Documents/offline-map-audits/codex-independent-sdk-qa/20261027-081859/`
(never modified). Implementation writer: Claude. **Nothing below is marked "Codex independently verified": that status belongs to Codex alone.**

At the start of remediation `HEAD` equalled the audited SHA (local = remote, both stashes and the Codex worktree intact), so every finding was taken as reproduced at current HEAD
from the audit's own probes before code was changed.

Remediation source: `646a604` (live safety), `cdb2d8e` (packs), `9122bb2` (routing), `467d4a1` (platform), `5f62845` (supply chain), `4f9a4d2` (arrival card), and the commit that adds this file.
Compiled SDK package at `4f9a4d2`, byte-reproducible: **`eab28df2b74887767ecca7eb4f8846c97d3e22268b03bec4a2d7babb3c01e819`** (`muslim-ummah-offline-navigation-0.1.0.tgz`, contains `LICENSE`).
The delivery bundle and native binary identities are in the bundle's `manifest.json` / `CHECKSUMS.txt` and in the evidence directory `~/Documents/offline-map-audits/offline-sdk-codex-remediation-2026-10-27/`.

## Finding ledger

Verification levels: **J** Jest/source, **P** replay of the audit's probes against the *compiled tarball*, **S** iOS simulator, **E** Android emulator, **D** physical device. "Retest" is always *Awaiting Codex independent retest* unless blocked.

| ID | Sev | Fix | Files | Regression tests | Verified | Retest |
| --- | --- | --- | --- | --- | --- | --- |
| NAV-01 resume race | M | `646a604` newest-resume generation; every watcher owned and deaf once stopped; Exit/Dispose end all authorities | `NavigationController.ts` | `SdkNavigationLiveSafety.test.ts` (grant/grant both orders, deny/grant, grant/deny, Exit and Dispose during await, 20 foreground cycles, stopped watcher deaf) | J, P | Awaiting Codex |
| NAV-02 outside endpoint | M | `646a604` route must start within 100 m of the walker and end within 25 m of a destination node; also on reroute | `NavigationController.ts` | `SdkNavigationLiveSafety.test.ts` (right end accepted; wrong end, wrong start, wrong-ending reroute refused) | J, P | Awaiting Codex |
| NAV-03 prototype ids | M | `9122bb2` score records have no prototype | `AStar.ts` | `SdkRoutingCorrectness.test.ts` (`toString`, `valueOf`, `hasOwnProperty`, …, `__proto__` in the search, a parsed pack) | J, P | Awaiting Codex |
| NAV-04 weighted optimality | M | `9122bb2` estimate scaled by the graph's cheapest cost/length ratio (cached per graph); the published estimate is kept for tie choice | `VenueRouting.ts` | `SdkRoutingCorrectness.test.ts` (reproducer, pack reproducer, 300 random graphs vs independent Dijkstra); all 91,506 goldens and 2,400 differential comparisons unchanged | J, P | Awaiting Codex |
| NAV-05 inconsistent estimate | M | `9122bb2` nodes reopen on a better cost; stale queue entries skipped; negative/non-finite edges ignored | `AStar.ts` | `SdkRoutingCorrectness.test.ts` (3.5 reproducer, 400 random inconsistent-estimate graphs) | J, P | Awaiting Codex |
| NAV-06 duplicate seeds | M | `9122bb2` one initial cost per seed id | `VenueRouting.ts` | `SdkRoutingCorrectness.test.ts` | J, P | Awaiting Codex |
| NAV-07 replayed fixes | M | `646a604` monotonic observation mark (duplicate, out-of-order, replay all ignored, future times never raise the mark) | `NavigationController.ts` | `SdkNavigationLiveSafety.test.ts` (A,B,A; replay after loss; weak replay; interleaved watcher/one-shot) | J, P | Awaiting Codex |
| NAV-08 reentrant subscribers | M | `646a604` trip captured locally, ownership re-checked after every publish and watch start | `NavigationController.ts` | `SdkNavigationLiveSafety.test.ts` (Exit, Dispose, selectDestination on the Live state, on a fix, on a reroute) | J, P | Awaiting Codex |
| NAV-09 one-step Live freshness | M | `646a604` permission re-read and, after >5 s or a stale fix, a new fix that must be within 20 m before committing | `NavigationController.ts` | `SdkNavigationLiveSafety.test.ts` (31 s route, moved user, revoked permission, cancel during refresh, quick start unchanged) | J, P | Awaiting Codex |
| NAV-10 shared connector | M | `9122bb2` each street node keeps its cheapest target and that target's cost | `StreetRouting.ts` | `SdkRoutingCorrectness.test.ts` | J, P | Awaiting Codex |
| PACK-01 post-commit deletion | **H** | `cdb2d8e` rejected pointer write is read back; a landed pointer is a success; nothing the persisted pointer names (or a pin) is ever deleted; Expo cleanup after the commit point is best effort | `PackManager.ts`, `expoPackFileSystem.ts` | `SdkPackIntegrity.test.ts` (landed, unreadable read-back, real failure, before/after fault sweep), `expoPackFileSystem.test.ts` | J, P, S (self-test 10/10) | Awaiting Codex |
| PACK-02 verify→activate gap | M | `cdb2d8e` committed manifest must equal the authenticated bytes and the committed files must still verify before the pointer moves | `PackManager.ts` | `SdkPackIntegrity.test.ts` (manifest, resource and extra file swapped at the boundary; normal install still works) | J, P | Awaiting Codex |
| PACK-03 Node link boundary | M | `cdb2d8e` lstat every component, no link followed, links listed as unexpected, optional ownership check | `nodePackFileSystem.ts` | `SdkPackIntegrity.test.ts` (declared, undeclared, nested, outside-root links; disposable data only) | J, P | Awaiting Codex |
| PACK-04 array pointer | M | `cdb2d8e` strict pointer shape; corrupt pointers delete nothing; `repairPointer()` rebuilds from verified directories (idempotent) | `PackManager.ts` | `SdkPackIntegrity.test.ts` (13 malformed shapes, repair keeps only what verifies) | J, P, S (flipped/deleted files repaired) | Awaiting Codex |
| PLAT-01 map availability | M | `467d4a1` availability follows every native outcome; framing stays once per map | `MapLibreNavigationMap.tsx` | `SdkPlatformDefects.test.tsx` (true,false,true; false,true; framing once) | J (native event sequence not exercised) | Awaiting Codex |
| PLAT-02 iOS announcements | M | `467d4a1` `useSafetyAnnouncements`: GPS lost interrupts, weak/recovery/reroute/instruction queued, each once; Android keeps live regions | `useSafetyAnnouncements.ts`, `NavigationScreen.tsx` | `SdkPlatformDefects.test.tsx`, `SdkNavigationScreen.test.tsx` | J. **Audible VoiceOver is a physical-device gate.** | Awaiting Codex; **Blocked by hardware** for speech |
| SUP-01 advisories | M | `5f62845` four in-range patches; disposition per advisory; reproducible consumer lock + inventory | `package-lock.json`, docs | `test:sdk-package`; `DEPENDENCY_ADVISORY_DISPOSITION.md` | repo audit 15→8 nodes (0 critical), fresh consumer 9→5 | Awaiting Codex |
| REL-01 debug-signed APK | Info | documented, nothing fabricated | `RELEASE_SIGNING_AND_DISTRIBUTION.md` | — | — | Informational |
| Hypothesis: arrival card overflow | — | `4f9a4d2` **reproduced on iOS at the largest text size** (both buttons clipped), buttons stacked, card scrolls | `ArrivalCard.tsx` | `SdkPlatformDefects.test.tsx`; before/after screenshots | J, S | New; Awaiting Codex |
| Hypothesis: arrival modal vs Android nav bar | — | **not reproduced, not tested**: the Android run did not complete (host starvation) | — | — | none | Open |

## Evidence summary at the remediation source

- Typecheck (app + scripts), ESLint, `git diff --check`: clean. Full Jest 222 suites / 2,363 tests; `npm test` chain exit 0 (2,400 differential comparisons, 91,506 golden pairs equal, all-gates, outside/street/gate/reroute scripts); plain-Node headless 83 checks; exports; package; fresh consumer from the tarball (63 tests, Android 769-module and iOS 771-module production bundles). The final re-run at the closing commit is recorded in the evidence directory.
- Replay of the audit's probes against the new compiled package: navigation parent replay 18 of 19 (the 19th, "unknown equal endpoints", is the one Codex itself classed Not Applicable); extended probes 4 of 4 including the 100 independent-Dijkstra graphs; pack parent replay 8 pass / 4 fail where the four failures are exactly the defect demonstrations (declared/undeclared link, staging race, Expo cleanup, array pointer) that no longer reproduce.
- iOS simulator (new isolated simulator, new Release binary): pack self-test 10/10, corruption repair ("1 repaired at start", hashes restored), Live to arrival, background/foreground keeps the journey, arrival card at the largest text size before and after the fix.
- **Android emulator: not completed.** See `android/RESULT.md` in the evidence directory. No Android claim is made for this binary.

## How Codex retests

1. Rebuild or take the tarball above (`node scripts/sdk-package/pack.mjs <dir>` is byte-reproducible).
2. Navigation: `node --import ./node_modules/tsx/dist/loader.mjs navigation-review/parent-replay.ts` (and `extended-probes-dist.ts`), after pointing the `../artifact/package/dist/...` imports at the new package's `dist`.
3. Packs: `node --import ./node_modules/tsx/dist/loader.mjs pack-review/probes-parent-dist.cjs` with the same re-pointing; **the four defect probes are expected to fail now** (their assertions encode the defect).
4. Platform: `platform-review/MapAvailability.contract.test.tsx` now passes (true,false,true); PLAT-02 needs a device with VoiceOver.
5. Advisories: `npm audit --package-lock-only --ignore-scripts --json` in the repository and in a consumer installed from the delivered `package-lock.json`.
6. Then run `npm test` and the 18 device scenarios J01–J18, which remain **unexecuted**.

## Verdict (fresh, evidence-backed, provisional until Codex retests)

- **Controlled pilot: conditionally ready, about 65/100** (was 55). Reason for the rise: every audited code defect is fixed with regression tests and replayed against the compiled package, and the new iOS binary passed on a simulator. Why not higher: Android was not re-verified for this binary, nothing is verified on a physical device, VoiceOver/TalkBack and GPS walking are untested, and Codex has not retested.
- **Unrestricted production: NOT READY, about 38/100** (was 36). The mandatory external gates are unchanged (device walking, continuous GPS on an iPhone, whole-device airplane mode, screen readers, reviewed Urdu/Roman Urdu, Gate 18/19 survey where supported, data-distribution rights, owner signing/publishing, independent security acceptance).
