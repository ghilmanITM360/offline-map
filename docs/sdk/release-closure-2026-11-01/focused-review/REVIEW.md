# Focused SDK closure review — 1 November 2026

**PASS for the bounded SOURCE/RUNTIME engineering review. No new critical, important, or minor defect found.** This was a fresh-context read-only subagent review within the same Codex chat as the implementation author. It is not organizationally external independent acceptance. Owner release decisions, external security acceptance and physical/field gates remain pending; controlled-pilot GO remains withheld and unrestricted production remains NO-GO.

## Scope and preservation

Reviewed only DELIV-01, SUP-01 and REG-01 for issue #393. Read the issue and all comments, repository instructions, focused handoff, release checkpoint, identities, dependency disposition/snapshot, and actual final tooling/lock diff. GitHub connector returned 404; read-only gh fallback retrieved the full issue. No source or Git reference mutation, install in root, native rebuild, accepted delivery/native artifact overwrite/regeneration, worktree/clone/branch creation, publication or data deletion occurred. Final-state Git checks disabled optional index writes.

- Canonical checkout: /Users/ghilmankhan/workprojects/offline-map; branch feat/muslim-ummah-offline-navigation-sdk
- Reviewed HEAD/local/upstream/live remote: 18847f7fb11fe846af1766b99c2c835910d93fb3
- Accepted executable/artifact source: 1a913b9e521c093499855625c8b3a76cc11fd61a
- Original accepted source: 923a604be161c749bd5bf50d8fdd8c036ba4bcbb
- Original src, SDK package, assets, pack-compiler and headless trees match the original source exactly. Git tree identities are in final-state.json. Original component test/config bytes match. The 16 unchanged original findings were preserved and not reopened.
- Exactly one registered worktree, clean final status, protected baseline and both stashes unchanged.

## Gate results

| Gate | Fresh verification | Result |
| --- | --- | --- |
| DELIV-01 | Archive verifier: 73 payloads; 12 packfiles plus shared PMTiles match pins. Clean shipped-lock npm ci; TypeScript; 6 suites/63 tests; sequential Android 772-module and iOS 774-module production Metro exports. | PASS |
| SUP-01 | Installed root and delivered-consumer Metro/PostCSS regressions: 14 checks each. Coherent Metro0.83.8, PostCSS8.5.32, image-size absent; paths/versions/immediate parent constraints and resolution match disposition. | PASS engineering disposition; external security acceptance pending |
| REG-01 | Original 2/2 suites, 57/57 tests; then full 222/222 suites, 2,367/2,367 tests, default 5,000ms timeout, zero skipped/todo/failed tests. | PASS |

Full component command exit0, wall148.995s; focused command exit0, wall17.097s. No repeat full run was needed. Original remount and clear/remove scenarios retain their assertions. Historical timeout causation remains unproven.

Android sourcemap: 769 nonvirtual sources; iOS: 771; all resolve to real files within the fresh consumer. Only two known Metro virtual polyfills per map are excluded. Both exports contain SHA-256 matches for all 13 pinned assets. All 76 original archive files (73 payloads plus manifest/checksums/README) remain byte-identical. No assets were injected, no compiler ran inside the consumer, and no implementation-source imports/resolver aliases/watchFolders were introduced. The delivered configs use stock Expo/Babel with only asset extensions. One React/RN/MapLibre installation; SDK runtime has no direct dependencies.

Root typecheck passed; lint passed with 0 errors and 2 pre-existing source warnings (unused waitFor import and generated markerImages eslint-disable). npm ci retained its React reconciler peer warning and package deprecations. Full component logs retain React act/cleanup console diagnostics. No assertion or timeout was weakened. Passing Jest/Metro does not establish native/device behavior.

## Fresh metadata-only security audits

| Graph | Low | Moderate | High | Critical | Propagated entries | Distinct sources | Exit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Root | 6 | 51 | 0 | 0 | 57 | 4 | 1 |
| Delivered consumer | 6 | 37 | 0 | 0 | 43 | 3 | 1 |

Sources: deepmerge GHSA-gcqx-w48m-w2h4; glob GHSA-3g3m-2fjr-6pw4; minimatch GHSA-g3hv-75wg-m249; root-only uuid GHSA-w5hq-g745-h8pq. Fresh advisory sets/counts match disposition. Independently checked 17 root and 10 consumer installed source paths plus immediate parent ranges/resolution: zero differences. Audit exits1 are preserved. E1/E2 reviewed-input conditions and E4 API-path limitations remain engineering dispositions, not owner/external risk acceptance or native security approval. These graphs retain unresolved low/moderate advisories.

## Findings

- Critical: none found in scope.
- Important: none found in scope.
- Minor: none newly found in scope.

## Behaviors considered and declined

- Re-running the broad routing/golden chain or reopening 16 original findings: declined because exact relevant source/data/compiler trees are unchanged and scope is the final three gates. Full npm test was not rerun; prior author full-chain evidence is not relabelled as fresh execution.
- Native rebuilding or final iOS/APK/device acceptance from exports: declined; these packaging/tooling corrections require production Metro checks and physical/native boundaries remain open.
- Altering timeouts, assertions, mocks or app behavior for REG-01: declined; original tests/config passed at the unchanged default.
- Blanket audit fix, framework major changes, local parser backports or resurrecting the rejected image-size candidate: declined; published supported fixes were checked against the actual delivered graph.
- Treating zero high/critical or transitive placement as security clearance: declined; low/moderate advisories and external/native assessment remain open.
- General hostile-tar extraction hardening: declined as outside verification of this hash-pinned trusted-producer archive. No adversarial extraction guarantee is claimed.
- Fixing pre-existing npm peer/deprecation, lint and React test diagnostics: declined as outside this closure diff; warnings remain visible in raw logs.
- New worktrees/clones, source changes or removing temporary/historical evidence: declined under preservation constraints. One technically required fresh /private/tmp consumer was used and retained.

## Byte reproducibility

Two fresh temporary SDK proof packs were generated in proof-first and proof-second under the existing /private/tmp allocation; no second consumer was created. Both pack commands exited0 (2.513s and3.246s). Both generated archives are byte-identical to each other AND to the actual delivered accepted SDK, SHA-256 d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca. No accepted delivery/native artifact was overwritten or regenerated. Exact commands/logs are indexed; reproducibility.json records all paths/sizes/hashes.

## Artifact identities

| Artifact | SHA-256 |
| --- | --- |
| bundle | 82b32fd74702a2e29ee8ff3913765c9591110b5d58eb7fec4c0730db72e8972e |
| sdk | d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca |
| consumerLock | 64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68 |
| manifest | 9b8fec4a704dd3f2de69ab85de302f21299ae26606fde82d3947191de572c947 |
| checksums | 5922cca5270c16bc5db88280c03994b73114de6fe254db74570c87e97089ca0f |

Root lock: 760e0aac4cf4651554a55b59f6be196697e579c7ae8a5413e336ac852b92b80b
Original test SHA-256: LocationsDirectoryScreen 833c47997796a6e0d54128cc10ad3f242060ef501653df10f6a64b9cef2b88f7; DirectoryRecentManagement d8ae57839472414dbad2307fffe4a9f0cca077d4fccab1720d2d5611a57b514a. All 228 root test-source file hashes are in test-source-sha256.json.

## Evidence and boundary

Exact commands/cwd/UTC/exits/durations/raw log hashes: COMMAND_INDEX.md and commands.jsonl. Machine verdict/counts: RESULTS.json. Git/source preservation/storage: final-state.json. Export source/asset inventories: delivery-export-verification.json, android-sources.json, ios-sources.json. Security graph comparison: audit-graph-comparison.json. EVIDENCE_SHA256.json covers all dedicated evidence files except itself. Existing evidence was preserved.

Fresh consumer: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
Allocated storage after proof (du -sk): 378308	/private/tmp/offline-sdk-focused-review-7987d90b0152; 2300	/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7
Final disk free: 11631288320 bytes. New consumer/proof/evidence allocation remains below2GiB.


Physical Android/iOS J01–J18/walking, continuous iPhone GPS, whole-device airplane cold launch, audible VoiceOver/TalkBack, reviewed Urdu/Roman Urdu, redistribution rights/Gate18–19 survey, external/native security, signing and authorized distribution remain owner/external gates. Main agent may record this focused engineering result in tracked docs/issue; organizationally external independent acceptance stays pending.
