# Dependency advisory disposition — SDK 0.1.0

Reviewed 1 November 2026 for release-closure issue #393. This supersedes the earlier three-package exception list. It is an engineering assessment, not independent security approval.

The SDK declares **no direct runtime dependencies**. React, React Native and optional MapLibre are host peers. The root app and delivered example have separate Node build/test graphs. A propagated Expo/RN/Jest/MapLibre/SDK label does not establish handset runtime reachability. Native CocoaPods/Gradle/Hermes/MapLibre libraries are outside this JS lockfile assessment.

## Exact-lock method

```sh
npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000
```

Fresh pre-correction results: root **58 affected entries / 10 distinct advisories** (6 low, 50 moderate, 2 high, 0 critical); corrected delivery consumer **45 / 9** (6 low, 37 moderate, 2 high, 0 critical). The original consumer lock SHA is `cfaf101aa79b34c2e031afc400a5493f2450c66f4197577e74ec76263db909a4`. Counts describe propagated package-name entries, not distinct exploits. Current selected graph: root **57 entries / 4 sources (6 low, 51 moderate, 0 high, 0 critical)**; consumer **43 / 3 (6 low, 37 moderate, 0 high, 0 critical)**. Exact locked versions, paths, parent ranges and every advisory disposition are in `DEPENDENCY_AUDIT_SNAPSHOT.json`; final delivery acceptance verifies the reviewed consumer lock identity. **Audit exits remain nonzero for unresolved findings.**

Raw audit responses, exact commands/timing, every installed version/immediate-parent constraint, call-site hashes and current GitHub advisory/npm registry metadata are preserved in owner audit storage under `offline-sdk-release-closure-2026-10-31/resume-20261101/`. The generated delivery `DEPENDENCY_INVENTORY.md` describes the exact consumer lock used by `npm ci`.

## Applied correction

The earlier compatible patches remain: **shell-quote 1.12.0, node-forge 1.4.2, undici 6.29.1, source-map-js 1.2.2**. Root and example now select exact **PostCSS 8.5.32** via an override. This is the same major, deliberately outside Expo metro-config's `~8.4.32` constraint. Image-size is also pinned to **2.0.4**. Although outside Metro’s declared `^1.0.2`, its published `__esModule` CommonJS default export preserves both exact Metro 0.83.3 buffer call sites; removed 1.x path/callback APIs are not used by Metro. A bounded real-Metro probe reproduces an ICNS memory-exhaustion failure at 1.2.1; 2.0.4 rejects ICNS/JXL zero-length records promptly even renamed `.png`, and reads a healthy PNG correctly. No adapter, monkey patch or local parser backport is needed. Node >=18 is required (tested Node 24.14). PostCSS’s required Nano ID dependency changes 3.3.19 → 3.3.20 in the root lock. No SDK dependency, Expo/RN/MapLibre version, native source, venue data or routing golden changes.

The installed 8.4.49 baseline demonstrably read a harmless canary `.map` outside the CSS directory even with `from` supplied. `npm run test:dependency-security` catches that defect. At 8.5.32 it checks relative traversal, an absolute annotation without `from`, explicit `map:false`, same-directory maps, and Expo's async default/process/content plugin API. Final acceptance also requires types and standalone Android/iOS production Metro exports.

The old claim that supplying `from` mitigates all source-map reads was incorrect: `map:false` bypasses annotation loading; `from` alone did not prevent traversal.

## Every distinct advisory source

Each GHSA links to the primary advisory. Four PostCSS rows are fixed, not exceptions. Version and parent details are point-in-time; reassess when the lock changes.

| Source / CVE | Severity; installed → fixed | Reachable path and exploitation prerequisite | Disposition |
| --- | --- | --- | --- |
| [deepmerge GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), CVE-2026-93753 | Low; 4.3.1; no patched release | Expo config/config-plugins and Jest merging attacker-controlled project configuration. Returned-object prototype poisoning, not demonstrated global Object.prototype compromise. | **E1 conditional exception.** Latest 4.x remains affected. Reviewed local configuration only; malicious config can change merged behavior. |
| [glob GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), CVE-2026-118773 | Moderate; 13.0.6 → 14.0.2 | Expo config/fingerprint/Metro filesystem discovery. Abort-budgeted walks can continue costly traversal. Reviewed config uses fixed synchronous patterns without signals. | **E2 conditional exception.** No fixed 13.x backport. Host availability risk on hostile trees. Glob 7.x is outside this source range but inherits minimatch findings. |
| [minimatch GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), CVE-2026-118764 | Moderate; root 3.1.5 / 9.0.9 / 10.2.5; consumer 3.1.5 / 9.0.9 / 10.2.6 → 11.0.1 | Glob, Expo CLI/fingerprint, RN codegen, Jest/test-exclude; root also ESLint. Hostile glob patterns amplify globparts at optimizationLevel 2, selected by modern glob. Legacy 3.x lacks that exact algorithm despite broad advisory range. | **E2 conditional exception.** No fixed 3/9/10 backport. Do not feed untrusted patterns into privileged builds. CPU/memory exhaustion remains possible. |
| [image-size GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), CVE-2025-71329 | High; 1.2.1 → 2.0.3 | Metro Assets.js reads project asset bytes; malformed JXL/HEIF can loop. Content sniffing means renaming PNG is insufficient. | **Fixed 2.0.4 override.** Exact Metro interop and bounded malformed-image rejection verified; remaining acceptance includes both production Metro exports. |
| [image-size GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), CVE-2025-71330 | High; 1.2.1 → 2.0.3 | Same Metro path; malformed ICNS lengths can loop. Node parser not identified in handset navigation. | **Fixed 2.0.4 override**, with the same exact-Metro regression. |
| [PostCSS GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), CVE-2026-41305 | Moderate; 8.4.49 → 8.5.10 | Untrusted CSS stringified into HTML style context; no such native sample path identified. | **Fixed 8.5.32.** |
| [PostCSS GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), CVE-2026-45623 | High; 8.4.49 → 8.5.12 | PreviousMap follows hostile sourceMappingURL and reads host files with automatic maps enabled. | **Fixed 8.5.32.** |
| [PostCSS GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), CVE-2026-69153 | Moderate; 8.4.49 → 8.5.23 | Follow-up source-map read when `from` is absent. | **Fixed 8.5.32.** |
| [PostCSS GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), CVE-2026-73646 | High; 8.4.49 → 8.5.18 | Traversal outside CSS directory even with `from`; reproduced with harmless canary before patch. | **Fixed 8.5.32.** |
| [uuid GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), CVE-2026-41907 | Moderate; root only 7.0.3 → 11.1.1 | xcode/config-plugin project generation calls v4 without buffers. Advisory needs v3/v5/v6 plus caller-provided buffer. | **E4: affected API not identified on reviewed path.** Fixed major outside xcode `^7.0.3`; reassess if callers change. Absent from consumer. |

## Scope and operating conditions

No compatible fixed backport was published within current deepmerge/glob/minimatch/uuid parent ranges. No blanket audit fix or framework upgrade/downgrade was adopted. The two deliberate overrides are bounded by installed API evidence and executable regressions. Transitive status does not make a finding harmless.

E1–E2 require reviewed, provenance-pinned repository assets, configuration, plugins and patterns. Do not process untrusted uploads, PR assets/config, themes or arbitrary patterns on privileged build hosts without separate review/isolation. Pins establish integrity, not publisher authenticity or safety of future inputs. The sample's non-web CSS returns before PostCSS; configured web processing normally uses `map:false`; no tracked CSS/PCSS/PostCSS config was found. Those facts do not cover every future host.

**Engineering disposition:** retain E1–E2 under the reviewed-input conditions above; no affected attendee-input runtime call path was identified. The owner delegated implementation judgment after requesting further web research; that is not independent security approval. External security acceptance remains a release gate. Untrusted build-input support invalidates these exceptions. External security and native dependency reviews remain open. No unrestricted production security GO is given.

## Primary compatibility sources

- [Image-size 1.2.1 supported API and disabled-types facility](https://github.com/image-size/image-size/blob/v1.2.1/Readme.md). Disabling types alone is not the selected fix: detection can enter validators before the disabled-type check.
- [Published image-size release metadata](https://registry.npmjs.org/image-size/2.0.4), with tarball SHA-512 verified against registry integrity before inspecting its CommonJS export.
- [PostCSS 8.5.32 release](https://github.com/postcss/postcss/releases/tag/8.5.32) and [8.5 compatibility release notes](https://github.com/postcss/postcss/releases/tag/8.5.0).
- [Deepmerge upstream investigation](https://github.com/TehShrike/deepmerge/issues/273); no patched release listed by the current advisory.

All six image-size/PostCSS advisory sources in the initial audit are addressed by published fixed versions. The remaining source advisories are deepmerge, glob, minimatch and root-only uuid; no critical/high source advisory remains in the selected graph, confirmed by fresh exact-lock metadata audits; actual delivery must match the reviewed lock. npm audit still reports low/moderate findings.
