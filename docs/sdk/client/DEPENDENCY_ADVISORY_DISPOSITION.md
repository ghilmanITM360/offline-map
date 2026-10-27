# Dependency advisory disposition — SDK 0.1.0 release candidate

**Source:** the independent audit (Codex, baseline `13f4629`) ran `npm audit --package-lock-only --ignore-scripts` and reported **15 affected package
nodes in the repository lockfile (1 critical, 10 high, 4 moderate)** and **9 in a freshly resolved consumer (0 critical, 8 high, 1 moderate)**. Those are
package-graph nodes, not 24 runtime vulnerabilities: a vulnerable build tool marks every package that depends on it (Expo, MapLibre's peer, the SDK itself in
the consumer) as affected. The SDK package has **no runtime dependencies** (React, React Native and MapLibre are peers supplied by the host app).

This document records, for every distinct advisory, what was installed, how it is reached, what it needs to be exploited, whether a compatible fix exists
and what was decided. The repository's own package-by-package triage is [`docs/DEPENDENCY_SECURITY_STATUS.md`](../../DEPENDENCY_SECURITY_STATUS.md) (issue
#370); this page adds the SDK-release view and the changes made for this release candidate. No `npm audit fix`, `--force` or major upgrade was run.

## What changed in this release candidate

Four packages had a fixed release **inside the range their parent already declares**. Each was updated on its own (`npm update <name>`), the lockfile diff
was checked to contain nothing else, and the full test chain was re-run.

| Package | Advisory | Before | After | Parent range | Why safe |
| --- | --- | --- | --- | --- | --- |
| shell-quote | GHSA-pqg4-j6r4-53mv (critical) | 1.10.0 | 1.12.0 | `^1.6.1` (react-devtools-core) | patch/minor inside the declared range; developer tooling only |
| node-forge | GHSA-86w9-cpqp-85rv (high) | 1.4.0 | 1.4.2 | `^1.3.3` (Expo code-signing helper) | patch inside the declared range; not used by the app at runtime |
| undici | GHSA-4qv8-2p9j-2685, GHSA-xjj6-f33q-929c (high) | 6.28.1 | 6.29.1 | `^6.18.2` (Expo CLI) | patch inside the declared range; Expo CLI network client, build host only |
| source-map-js | GHSA-68fv-2mgg-jv7q (high) | 1.2.1 | 1.2.2 | `^1.2.1` (PostCSS) | patch inside the declared range; build host only |

Repository lockfile result: **15 nodes (1 critical / 10 high / 4 moderate) → 8 nodes (0 critical / 2 high / 6 moderate)**, measured with the same command. The
remaining nodes come from three distinct packages (below) and their propagation through Expo.

## Advisories that remain, and why

| Advisory | Installed | Path | Reached at | Needs to be exploited | Fix | Decision | Residual risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| image-size GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr (high, denial of service via infinite loop in JXL/HEIF/ICNS parsing) | 1.2.1 | Metro `^1.0.2` → `metro/src/Assets.js` | **Build time** (the bundler reads image dimensions of assets in the project). Not in the app bundle. | An attacker-supplied image asset placed in the project's asset set | 2.0.3+, a **major** version outside Metro's `^1.0.2` | **Documented exception.** A forced override could break Metro's asset API; a major bump of Metro/Expo is a separate compatibility decision. | A hostile asset in the repository could hang a developer or CI build. The SDK and sample assets are repository-owned PNG/PMTiles files. |
| postcss GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp (high; XSS in CSS stringify, arbitrary file read through a hostile `sourceMappingURL`) | 8.4.49 | `@expo/metro-config` pins `~8.4.32` | **Build time**, only when a CSS file is processed. The app has no CSS, and Expo supplies `from`. | An attacker-controlled CSS file or source map in the project | 8.5.23+, outside Expo's `~8.4.32` pin | **Documented exception.** | Same as above: a hostile file already inside the project. |
| uuid GHSA-w5hq-g745-h8pq (moderate; missing bounds check in v3/v5/v6 when the caller passes an output buffer) | 7.0.3 | `xcode@3.0.1` (Expo config plugins) | **Build time** (native project generation). `xcode` calls only `uuid.v4()` without a buffer, which the advisory does not cover. | The vulnerable call shape, which the code does not use | 11.1.1+, a major version outside `xcode`'s `^7.0.3` | **Documented exception — not reachable.** | None identified. |

## The fresh consumer (what a client installs)

The consumer example pins its direct dependencies to exactly what the repository resolves (checked by `scripts/sdk-package/consumer.mjs`); everything below them
resolves to the newest release allowed by each parent range at install time, which is why the consumer count differs from the repository's. The delivery
bundle ships the **resolved lockfile** (`examples/expo-consumer/package-lock.json`, produced against the delivered tarball) so a client installs the same
graph with `npm ci`, plus a generated inventory (`docs/DEPENDENCY_INVENTORY.md`). Re-run `npm audit` against the lockfile in your own tree: advisories are published daily and
this table is a point-in-time record. Remaining items there are the same three packages above (build-time Expo/Metro tooling).

## What is not claimed

- Not a statement that the host application is free of advisories: the host's own lockfile governs its build.
- Not an audit of native libraries (CocoaPods, Gradle, Hermes, MapLibre Native). Generate those inventories from the host build; see `LICENSES_AND_NOTICES.md`.
- Runtime exploitability of the three remaining packages was reviewed from the installed sources (call sites above), not demonstrated; an external security review of the final build is still open.
- A major React Native, Expo or MapLibre upgrade would clear the two build-time exceptions but needs its own compatibility decision and native re-acceptance; it is deliberately **not** part of SDK 0.1.0.
