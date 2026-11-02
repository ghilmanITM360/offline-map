# PC2 dependency reconciliation — 2 November 2026

Tracking: [#395](https://github.com/ghilmanITM360/offline-map/issues/395). Machine `Users-MacBook-Pro.local`; existing checkout; starting source `2d9fa73874938a2d7483c4499ed0a1bddc3ba0bc`.

**SOURCE/RUNTIME VERIFIED — PC2-ENV-01 resolved.** Task-local Node24.14.0 (CI reference), bundled npm11.9.0; global Node25.2.1 unchanged. No engines/packageManager declared. `npm ci --no-audit --no-fund --prefer-offline` exited0, added1080 packages, normal patch-package postinstall completed. No legacy-peer override. Known React reconciler peer/deprecation warnings retained in raw log.

Before:1052 matches/23 version mismatches/50 absent locations. After:1079 exact version matches/0 mismatches/0 missing applicable packages;46 optional foreign-platform binaries appropriately absent. Darwin/arm64 applicable optional binaries installed. The root workspace link resolves to this checkout. package.json/package-lock.json/Podfile/Podfile.lock SHA256 unchanged.

`npm run test:dependency-security`:14 checks PASS, Metro0.83.8/PostCSS8.5.32; neither test nor parser modified. Baseline `npm run typecheck`, `npm run lint` (0errors/2existing warnings), `npm test`, `npm run test:components -- --runInBand --watchman=false` (222suites/2367tests), `git diff --check`, `npm run test:sdk-package` all exited0. Baseline source tests do not certify subsequent source changes or native behavior. Final correction validation is recorded separately.

## Exact corrections

| Locked location | Before | Accepted lock / after |
|---|---|---|
| `node_modules/content-type` | MISSING | 2.1.0 |
| `node_modules/hermes-estree` | 0.32.0 | 0.35.0 |
| `node_modules/hermes-parser` | 0.32.0 | 0.35.0 |
| `node_modules/metro` | 0.83.3 | 0.83.8 |
| `node_modules/metro-babel-transformer` | 0.83.3 | 0.83.8 |
| `node_modules/metro-cache` | 0.83.3 | 0.83.8 |
| `node_modules/metro-cache-key` | 0.83.3 | 0.83.8 |
| `node_modules/metro-config` | 0.83.3 | 0.83.8 |
| `node_modules/metro-core` | 0.83.3 | 0.83.8 |
| `node_modules/metro-file-map` | 0.83.3 | 0.83.8 |
| `node_modules/metro-minify-terser` | 0.83.3 | 0.83.8 |
| `node_modules/metro-resolver` | 0.83.3 | 0.83.8 |
| `node_modules/metro-runtime` | 0.83.3 | 0.83.8 |
| `node_modules/metro-source-map` | 0.83.3 | 0.83.8 |
| `node_modules/metro-symbolicate` | 0.83.3 | 0.83.8 |
| `node_modules/metro-transform-plugins` | 0.83.3 | 0.83.8 |
| `node_modules/metro-transform-worker` | 0.83.3 | 0.83.8 |
| `node_modules/metro/node_modules/accepts` | MISSING | 2.0.0 |
| `node_modules/metro/node_modules/mime-types` | MISSING | 3.0.2 |
| `node_modules/metro/node_modules/negotiator` | MISSING | 1.1.0 |
| `node_modules/nanoid` | 3.3.19 | 3.3.20 |
| `node_modules/node-forge` | 1.4.0 | 1.4.2 |
| `node_modules/ob1` | 0.83.3 | 0.83.8 |
| `node_modules/postcss` | 8.4.49 | 8.5.32 |
| `node_modules/shell-quote` | 1.10.0 | 1.12.0 |
| `node_modules/source-map-js` | 1.2.1 | 1.2.2 |
| `node_modules/undici` | 6.28.1 | 6.29.1 |

## Preservation and evidence

No process held a file under node_modules and no npm/Metro/Gradle/pod/xcodebuild job was active at replacement check. Existing installation was renamed intact to the external evidence directory after hashing85859 file/symlink records. Private environment files/stashes/history untouched. Disk before install38Gi available; no broad cleanup.

Evidence root: `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation`.

- `dependencies-before.json` and `dependencies-after.json`: every locked location, installed/expected version, platform, status.
- `node-modules-recovery-manifest.json`: exact original/backup paths, file hashes and symlink targets. Restore the preserved directory to the original node_modules location only after stopping dependency users and preserving any newer installation. The workspace link target is stored verbatim; it resolves correctly when restored to its original location.
- `runtime/node-v24.14.0-darwin-arm64.tar.gz`:SHA256 `a1a54f46a750d2523d628d924aab61758a51c9dad3e0238beb14141be9615dd3`, checked against downloaded nodejs.org SHASUMS256.txt.
- `checks.jsonl`: argv/cwd/runtime/start UTC/duration/exit/log SHA256. First six records retain baseline command summaries; repeated command log filenames were superseded by the final correction run. Last six records and tracked SOURCE_VALIDATION.json are the authoritative final logs/hashes.
- `logs/npm-ci.log`, `logs/dependency-security.log`, `input-hashes-before.json`.

No device/field claim. Native graph is separately unverified on PC2.
