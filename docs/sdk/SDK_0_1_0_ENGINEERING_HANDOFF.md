# SDK 0.1.0 — final engineering handoff

> **Partly superseded (3 November 2026, client-delivery candidate 2).** This record is kept as written for the executable source `21d1ed4` and its candidate-1 artifacts. For what a client
> installs today, use [CLIENT_DELIVERY_REPORT.md](CLIENT_DELIVERY_REPORT.md): the new delivery archive and SDK tarball hashes, the venue pack tool, the single Expo plugin, the
> AppleDouble-free archive and the corrected package command. Corrections to this file are marked "Correction" below; nothing else here has been rewritten.

Authoritative closure record for `@muslim-ummah/offline-navigation` 0.1.0 (3 November 2026). It consolidates, and does not replace, the
evidence in [release-closure-2026-11-02](release-closure-2026-11-02/) and [client/](client/). No new feature work, source change, native rebuild or test
rerun was done for this handoff. No further native diagnostics are planned; reopen only for a new reproducible product defect, a scope
requirement proven missing, or explicit owner authorization.

## 1. Source identity

- Executable source commit: `21d1ed40dc652f54670d49d3075b13d4c3be796d`. Verified for this handoff: `git diff 21d1ed40 -- . ':!docs'` is empty, so every commit since is documentation or test-harness only.
- Branch `feat/muslim-ummah-offline-navigation-sdk`. The commit containing this file is the handoff commit; `git log -1 -- docs/sdk/SDK_0_1_0_ENGINEERING_HANDOFF.md` names it.

## 2. Feature inventory and supported scope

| Capability | Where it ships (package `dist/`) | Status |
| --- | --- | --- |
| Headless controller (`createNavigationController`), session guard | root, `./session` | IMPLEMENTED |
| Public TypeScript API + declarations | `index.d.ts`, per-module `.d.ts`; exports `.`, `./session`, `./ui`, `./maplibre`, `./package.json` | IMPLEMENTED |
| Ready-made `NavigationScreen`, provider/hooks, leaf cards, theme, English copy | `./ui` | IMPLEMENTED |
| Offline MapLibre / PMTiles basemap, route and walker overlay | `./maplibre` (optional peer MapLibre 11.x) | IMPLEMENTED |
| Multi-venue routing (offline A*, venue + street graph contracts) | `domain/venue`, `domain/street`, `domain/navigation` | IMPLEMENTED |
| Directory and search; manual origin and destination | `ui/PlaceDirectory`, `domain/venue` | IMPLEMENTED |
| Preview and Manual Guide (no GPS needed) | `domain/journey`, `ui/RouteGuideCard` | IMPLEMENTED |
| Explicit Live navigation, GPS permission and freshness/accuracy policy | `domain/navigation`, `ui/StartOptionCard`, `ui/GpsSignalBanner` | IMPLEMENTED |
| Reroute, arrival, recovery | `domain/navigation`, `ui/RerouteBanner`, `ui/ArrivalCard` | IMPLEMENTED |
| Pack manifests, SHA-256 verified storage, atomic activation and rollback | `domain/pack` | IMPLEMENTED |
| English / Urdu / Roman Urdu integration contract; Light / Dark / RTL; font scaling and accessibility adaptations | `ui`, [LOCALIZATION_THEME_RTL.md](client/LOCALIZATION_THEME_RTL.md) | IMPLEMENTED (contract); translated strings are host-supplied and pending native review |
| Independent installable consumer (installs the packed `.tgz` only) | `examples/expo-consumer` | IMPLEMENTED |
| Client instructions | [client/README.md](client/README.md), [INTEGRATION_GUIDES.md](client/INTEGRATION_GUIDES.md), [API_REFERENCE.md](client/API_REFERENCE.md) | PRESENT |

Not in 0.1.0 (by design): venue data, tiles, network client, analytics, street routing in the sample, speech, remote or signed pack import (refused; no signing scheme or keys exist). The host owns navigation authority, copy and translations, the location adapter, the basemap file and the controller lifetime. Known limits are in [RELEASE_NOTES.md](client/RELEASE_NOTES.md).

## 3. Artifact identities (all rehashed 3 November 2026; unchanged)

| Artifact | SHA-256 |
| --- | --- |
| SDK tarball `muslim-ummah-offline-navigation-0.1.0.tgz` | `a2bb865d38d457ea19228b81670616a57f353644dd05be1c2d16fafc738f71d4` |
| Delivery archive `delivery-21d1ed4.tgz` | `87e17e33ea10be2ae40c4d1965159989cc5d492d1637263ce5e5ca62b98871e5` |
| Android release APK (arm64) | `40228465e6073b3c37d902f6870f54b0e26895327cb85026e0f4d2d9d7e87f90` |
| iOS `SDKConsumer` executable (Release, arm64, minos 15.1) | `29962a589b6f0249417f5bf290aaf12efef06c729a81b65184f0c80429a8b32d` |
| iOS `main.jsbundle` | `ad88c6c7349e2d95eeecdb50f237beb7dd27f8d71cb3b84fc5315735fa6acf6c` |
| Diagnostic profileable APK (not a deliverable) | `61b0822121497b7b7a245a66557250f712f2bd5295185bd551c1bbab2b38bc60` |

Full paths and provenance: [FINAL_ARTIFACT_IDENTITIES.json](release-closure-2026-11-02/FINAL_ARTIFACT_IDENTITIES.json). Binaries live outside Git under `~/.codex/visualizations/2026/11/02/…/pc2-remediation/`.

## 4. Consumer installation and example usage

1. Unpack the delivery archive; install `package/muslim-ummah-offline-navigation-0.1.0.tgz` plus peers (`react >=19.1.0`, `react-native >=0.81.0`, optional `@maplibre/maplibre-react-native >=11.5.0 <12`). Details: [INTEGRATION_GUIDES.md](client/INTEGRATION_GUIDES.md).
2. Copy `examples/expo-consumer` (in the delivery and the repository). It depends on the tarball only. Do not run `npm install` in the repo copy; `sdk.tgz` exists only in the driver's copy.
3. Replace the synthetic venue with a surveyed `VenueDataSource` and install your own basemap archive; on Android keep the `withAndroidConfigChanges` plugin and the two files in `plugins/` (README of the example).
> **Correction (candidate 2):** the native steps in item 3 no longer involve copying `plugins/` files. The SDK now ships one Expo plugin (`"@muslim-ummah/offline-navigation"` in `app.json`) and a
> Metro helper, and the iOS precision module is the installable `@muslim-ummah/ios-location-precision`. Follow [client/QUICK_START.md](client/QUICK_START.md).

4. Verify with the driver from the repo root: `npm run test:sdk-consumer -- <fresh directory outside the repo>`; then follow [CLIENT_CHECKLIST_AND_QA.md](client/CLIENT_CHECKLIST_AND_QA.md).

## 5. Automated verification (historical, unchanged-source; not rerun here)

223 Jest suites / 2,389 tests; 91,506 golden routing comparisons; 2,400 differential comparisons; 14 dependency-security regression checks; TypeScript clean; ESLint 0 errors / 2 pre-existing warnings; `npm test`; deterministic SDK packaging; 63 delivered consumer tests; both production Metro exports (Android, iOS). Evidence: [ARRIVAL_COLUMN_VALIDATION.json](release-closure-2026-11-02/ARRIVAL_COLUMN_VALIDATION.json), [PACKAGE_VALIDATION.md](release-closure-2026-11-02/PACKAGE_VALIDATION.md), [SOURCE_VALIDATION.json](release-closure-2026-11-02/SOURCE_VALIDATION.json).

## 6. Native evidence (virtual devices only)

Original matrices are unchanged and carry separate denominators:

| Platform | PASS | FAIL | BLOCKED | NOT RUN | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Android emulator | 29 | 0 | 4 | 2 | 35 |
| iOS simulator (original, iPhone 13 mini geometry) | 13 | 0 | 6 | 1 | 20 |

Per-row detail: [ANDROID_FINAL_MATRIX.json](release-closure-2026-11-02/ANDROID_FINAL_MATRIX.json), [IOS_FINAL_MATRIX.json](release-closure-2026-11-02/IOS_FINAL_MATRIX.json), [ANDROID_NATIVE_RESULTS.md](release-closure-2026-11-02/ANDROID_NATIVE_RESULTS.md), [IOS_NATIVE_RESULTS.md](release-closure-2026-11-02/IOS_NATIVE_RESULTS.md).

**Separate, additive evidence — iOS 26.3 (not part of the 20-group denominator, not transferable to the iPhone 13 mini):** dedicated iPhone 17 simulator, UDID `BD24E31D-30F4-43C6-8986-784AAD3A5FB6`, iOS 26.3 runtime, accepted Release app installed unchanged. 4 cross-device XCTests PASS / 0 FAIL: full journey (cold launch, offline map, directory/search, manual origin, preview, Guide Next/Previous, explicit Live, reroute, arrival at the correct destination only, Done, clean second journey); background/foreground; Light/Dark/System appearance; Urdu RTL at Extra-Large and AX5. Harness `native-tests/ios26-cross-device/` (the old geometry-specific `ArrivalTouch.swift` is preserved untouched). Details: [IOS26_CROSS_DEVICE_RESULTS.md](release-closure-2026-11-02/IOS26_CROSS_DEVICE_RESULTS.md). The run observed zero app-owned network sockets in 186 host samples; that is supporting evidence only, not a whole-device network-isolation test.

Overall native acceptance: **PARTIAL**.

## 7. Open items — classification (none is a confirmed product defect; none is PASS)

| Item | Disposition |
| --- | --- |
| A27 repeated native reroute | BLOCKED by emulator/location-harness conditions; one native reroute independently captured. Not to be repeated in this closure. |
| A29 full TalkBack traversal | BLOCKED by automation tooling; human screen-reader acceptance pending. |
| A34 stale/weak/accuracy variants | BLOCKED: end-to-end SDK-callback attribution insufficient. Location-source confusion was resolved. No PASS. |
| iPhone 13 mini geometry | BLOCKED: iOS 18.x runtime unavailable; earlier system-banner geometry anomaly unexplained. |
| CoreLocation fault cases (stale/weak/error) | Retain existing evidence level; `simctl location` cannot inject them. |
| Memory | INCONCLUSIVE after the Release campaign and a profileable heapprofd campaign; no confirmed leak, no source change. Smallest unresolved gap: Hermes heap census / Java hprof ([memory-profile-run4/summary.json](release-closure-2026-11-02/memory-profile-run4/summary.json)). |

Emulator limitations: GMS/Expo hide watcher ownership; mock providers do not prove weak/stale handling end to end; Android emulator graphics PSS reports 0; `simctl` has no per-app network control, accuracy or CoreLocation-error injection.

## 8. Deferred work

Original-host controller migration; external provider integration (location, routing, speech, remote pack publishing/signing); surveyed Gate 18/19 connectivity; production translations; physical-field behavior. None is attempted in 0.1.0.

## 9. Security exception status

Root audit 0 critical / 0 high; remaining low/moderate advisories have a complete disposition ([DEPENDENCY_ADVISORY_DISPOSITION.md](client/DEPENDENCY_ADVISORY_DISPOSITION.md)). Conditional tooling exceptions are authored and author-reviewed only; independent/security acceptance is **pending**.

## 10. Human / external acceptance checklist (all pending)

- [ ] Physical Android and iOS walking with real GPS; continuous physical-iPhone Live
- [ ] Whole-device airplane-mode cold start
- [ ] Audible VoiceOver and TalkBack; physical J01–J18 ([matrix](release-closure-2026-11-01/external-acceptance/J01_J18_ACCEPTANCE_MATRIX.md))
- [ ] Native-reviewed Urdu / Roman Urdu wording ([TRANSLATION_REVIEW.md](client/TRANSLATION_REVIEW.md))
- [ ] Venue data redistribution rights; Gate 18/19 survey
- [ ] Independent security review, native-library review, security-exception acceptance
- [ ] Production signing authority and distribution approval ([RELEASE_SIGNING_AND_DISTRIBUTION.md](client/RELEASE_SIGNING_AND_DISTRIBUTION.md))

## 11. Verdicts

| Classification | Verdict |
| --- | --- |
| Software implementation | **IMPLEMENTATION COMPLETE** for the agreed 0.1.0 scope (section 2), with the limits in sections 2, 7 and 8 |
| Automated engineering verification | **PASS** (historical, unchanged source; section 5) |
| Virtual-device acceptance | **PARTIAL** (section 6) |
| Memory | **INCONCLUSIVE**, no confirmed leak |
| Controlled pilot | **NO-GO** until actual approval |
| Unrestricted production | **NO-GO** until the external gates in section 10 are satisfied |

## 12. For the next engineering team

- **Correction (candidate 2) — the package is NOT reproduced by `npm pack`.** The source package exports TypeScript from `src/`; the delivered tarball is compiled by `tsc`, has its `exports` rewritten
  to `dist/`, and ships only an allowlist. The supported command is `npm run pack:sdk -- <fresh directory outside the repository>` (`scripts/sdk-package/pack.mjs`); it prints the `.tgz` path, and
  running it twice gives identical bytes (`npm run test:sdk-package -- <fresh dir>` proves that). The delivery archive is built by `npm run sdk:bundle -- <fresh dir outside the repository>` from a clean tracked tree.
  A bare `npm pack` inside `packages/offline-navigation` yields a source-only package with a different hash.
- Reproduce automated checks: `npm test`, `npm run typecheck`, `npm run lint` at `21d1ed40`; golden/differential suites run inside `npm test`. ~~Package: `npm pack` from the SDK package directory should reproduce the tarball hash above (deterministic).~~ (Incorrect as written; use the command in the correction above.)
- Reproduce native: Android runners and iOS harness are in [native-tests/](release-closure-2026-11-02/native-tests/); iOS 26.3 usage `run_cross_device.py <UDID> <workdir> [TestName …]` after `simctl privacy grant location com.example.sdkconsumer`.
- Raw evidence stays outside Git under `~/.codex/visualizations/2026/11/…`; manifests with SHA-256 are the `*_MANIFEST.json` files in the closure folder.
