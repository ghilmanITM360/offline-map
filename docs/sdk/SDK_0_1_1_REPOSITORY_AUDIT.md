# SDK 0.1.1 repository audit, cleanup and consolidation (10 November 2026)

The one record for this operation. It is a maintenance pass, not a feature pass. Machine-readable inventory: [repository-audit/branch-inventory.csv](repository-audit/branch-inventory.csv). Evidence, the recovery bundle and the rebuilt delivery archives are outside Git in `~/Documents/offline-map-audits/sdk-0-1-1-repository-audit-2026-11-10/` (with `SHA256SUMS`).

Status words: FIXED, VERIFIED PASS, BLOCKED BY ENVIRONMENT, NEEDS OWNER APPROVAL, DEFERRED BY SCOPE, UNVERIFIED.

## 1. Identities

| | |
| --- | --- |
| Machine | `Ghilmans-Laptop.local`, `/Users/ghilmankhan/workprojects/offline-map` (the AGENTS.md checkout), Node 24.14.0, npm 11.9.0, Xcode 26.2, 38 GiB free |
| Start | local = tracking = live = `ac0b3f8c15e65d198d6d0bb843fc55484875d4f3`, ahead/behind 0/0; hosted "SDK checks" SUCCESS on it |
| Repository default branch | `integration/ijtema-clean-baseline` (`9c0fd50d`), unchanged. The SDK branch is ahead of it and not merged into it |
| Worktrees | 1 (the checkout). No clone, worktree or branch was created |
| Stashes | 2, identities unchanged: `stash@{0}` `b5a47d6c…` (on `fix/a3-01-rtl-label-overlay`, base `9c0fd50`), `stash@{1}` `6d4a9c8d…` (on `integration/ijtema-clean-baseline`, base `ddeefb44`, 41 files) |
| Tags | `evidence-splash-emulator-2026-09-29`, `pre-consolidation-2026-09-03`, `testing-apk-4b17fcb`: untouched |
| Open PRs | #381 (A1-08), #380 (A5-03), #179 (draft handoff), #178 (WIP, "do not merge"). None touched |
| `git fsck --connectivity-only` | clean except unreachable dangling objects (normal) |

## 2. Branch inventory and actions

330 refs audited: 118 local, 212 remote. Per branch: SHA, upstream, date, ancestry of the SDK branch and of the default branch, commits not in the SDK branch, `git cherry` patch-equivalence, PR state (CSV above).

| Class | Local | Remote | Meaning |
| --- | --- | --- | --- |
| SAFE LOCAL CLEANUP | 82 | – | ancestor of the SDK HEAD (every commit stays reachable), or patch-equivalent in the SDK with its tip on origin |
| KEEP | 24 | 197 | remote branches are all fully merged into the SDK branch but are never deleted here |
| REVIEW BEFORE DELETION | 6 | 10 | unique commits that are not patch-equivalent (see below) |
| PROTECTED | 6 | 5 | SDK branch, default branch, `main`, the stash-base branch, open-PR branches |

Actions taken (VERIFIED):

1. Recovery manifest written first: `local-branches-before.csv` (name, SHA, upstream, date), `remote-and-tag-refs.csv`, `stashes.txt`, `branch-inventory.csv`, and `local-branches.bundle` (38 MB, every local branch, `git bundle verify` passed).
2. `git branch -d` (never `-D`) on the 82 listed in `deleted-local-branches.txt`: **81 deleted**. `claude/222-camera-ready-gate` was kept: Git refused because its origin copy has one newer commit, and a forced delete was not used.
3. No remote branch, tag, stash or worktree was deleted. 37 local branches remain.

Retained and why:

- `main` (local `fa05647`, 7 behind `origin/main` `42451f1`) and `origin/main`: kept untouched; they carry an older line of work (13 commits not in the SDK branch). Owner decision.
- 21 local-only or non-equivalent branches (`final/karachi-ijtema`, `fix/gps-progress-freshness-p0`, `integration/aud-fix-consolidation`, `integration/ux-simplification-final`, `codex/preview-attribution-height`, `codex/location-capability-audit`, `fix/core-functionality-finalization`, the September `fix/new-*` series, `design/premium-map-ux`, `codex/premium-map-runtime-ui-fixes`, and others): early-September to mid-October lines of host-app work (RTL, safe-area, location acquisition, reroute, arrival). Their PRs are mostly closed or merged by squash, so ancestry cannot prove redundancy. They are in the backup bundle. NEEDS OWNER APPROVAL before any deletion.
- Local branches with `git cherry` showing every patch already in the SDK but no remote copy (`claude/accept-local-stack`, `codex/120-combined-validation`, `codex/core-five-validation`, `codex/core-four-combined-validation`, `tmp/301-validate`): probably redundant, but not deleted because no durable remote copy exists. Bundle holds them. REVIEW.
- Remote-only unmerged: `claude/l10n-*` (5), `claude/docs-canonical`, `feat/phase2-ui-fixes-consolidation` (5 commits, 2026-10-19), the three open-PR branches and `wip/download-map-preserved-for-pc-migration`: potentially valuable (localization, UI fixes). NEEDS OWNER APPROVAL; none is deletable by this operation.

## 3. Local files

Ignored/untracked content inventoried, nothing removed: `node_modules` 1.9 GB, `ios/Pods` 904 MB, `android/build`, `ios/build`, `.expo`, `.idea`, `.env` (ignored; only `.env.example` is tracked), `docs/audit/ui-ux/` (ignored evidence), `.DS_Store` files (ignored, none tracked). Tracked `android/app/debug.keystore` is the stock Android debug keystore. A secret scan of tracked files found no credential (the one pattern hit is an xcresult file name inside an evidence manifest). No `git clean`, `reset --hard` or cache deletion was run.

## 4. Source health

Reviewed with TypeScript, ESLint, an import-graph/export scan written for this pass, grep, and reading of the highest-risk modules (XLSX/CSV intake, node pack filesystem, tar writer/reader, catalog/availability, controller destination handling, delivery bundle, CI workflow, Android config plugins).

| Finding | Verdict |
| --- | --- |
| Import cycles in SDK/script sources | one: `PackManifest` ↔ `PackCompatibility`, type-only (erased at build). Harmless, left |
| Exported symbols referenced only inside their own file | 102, almost all public types; 16 are constants or helpers (`searchKey`, `isFiniteWgs84`, `isInBounds`, preset version constants, `XLSX_LIMITS`, …). Public surface preserved; un-exporting is cosmetic. DEFERRED BY SCOPE |
| `as any`, `@ts-ignore`, TODO/FIXME in SDK package source | none |
| Host and SDK Android config plugins | not duplicated: the host plugin delegates to the SDK plugin |
| Pack/node filesystem, tar reader/writer, XLSX reader | symbolic links refused, path escape refused, zip limits and ZIP64/encryption/macro refusal present, entity declarations refused. One defect (below) |
| Gate 18/19 and pending places | destination and origin both refused without a route (existing tests, rerun: pass) |
| `tools/venue-pack/` (named in the assignment) | does not exist; the venue CLI is `scripts/sdk-package/venue-tool.mjs` and `scripts/sdk-pack/` |
| Lint warnings | 2 → 1. Fixed an unused import. The other is the first line of a generated file (`markerImages.generated.ts`, its hash is generated); left |
| Version metadata | SDK 0.1.1 consistent (package, presets `>=0.1.1 <0.2.0`, delivery id); remaining `0.1.0` strings are genuine lower bounds or fixtures |

## 5. Issue ledger

| # | Severity | Reproduction | Root cause | Fix | Regression | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | P3 | A place whose second name folds to nothing (`ur: "--"`) plus the alias `Foo` and another place named `Foo`: search "foo" ranked both 3, the alias place first | `rank` took the first N entries of a list that had had empty keys filtered out, so the shift made an alias count as a name | `PlaceCatalog.ts` keeps a separate `exact` list of the place's own names | `SdkGeometryCatalogParsers.test.ts` "an alias never outranks a real name…" (failed before, passes) | FIXED, commit `3fbcd82` |
| R2 | P3 | A workbook cell containing `&#x110000;` | `String.fromCodePoint` threw a raw `RangeError`; the CLI printed "Invalid code point 1114112" | `xlsx.ts` refuses it as `not-xlsx` | `SdkIntakeFiles.test.ts` "refuses a character reference…" (failed before, passes) | FIXED, commit `c173bd2` |
| R3 | P4 | Three relative links in `docs/history/2026-10-06-project-status.md` pointed at files that moved | links not updated | prefixed `../` | link checker over 66 tracked Markdown files: 0 broken | FIXED, commit `f8f4cf8` |
| R4 | P4 | `waitFor` imported and unused in the consumer test | leftover | removed | eslint clean | FIXED, commit `f8f4cf8` |

No P0/P1 defect was found. Routing, goldens, surveyed coordinates and gate connectivity were not touched.

Behavioural check for R1: the old and new search were compared on the real Karachi catalog (60 places, 384 queries made from every name, alias, id and word): **0 differences**. The fix therefore changes no result for shipped data.

## 6. Documentation

66 first-party Markdown files outside the dated `release-closure-*` evidence folders (49 more are evidence and are kept as provenance): 3 root, 16 in `docs/`, 19 SDK engineering files and 15 client files in `docs/sdk/`, plus a few README/ADR/plan files. The client-facing set is `docs/sdk/client/` (15 files) with `CLIENT_DELIVERY_REPORT.md` as the single status record. Delivery tooling and CI check some of these files by name, so none was deleted or merged in this pass. A consolidation of the 19 SDK engineering files (roadmap, RFC, handoffs, closure ledgers) into an archive folder is possible but changes provenance links: NEEDS OWNER APPROVAL. No new generation of audit reports was created; this file is the only new Markdown.

## 7. Verification (after the fixes)

| Check | Result |
| --- | --- |
| `npm run typecheck` (app + scripts) | VERIFIED PASS, exit 0 |
| `npm run lint` | VERIFIED PASS, 0 errors, 1 warning (generated file) |
| `npm run test:components -- --runInBand` | VERIFIED PASS, **234 suites, 2,527 tests** (2,525 + the two new regressions) |
| `npm test` (112 scripts) | VERIFIED PASS, exit 0; routing parity vs 91,506-pair golden `== golden`; 2,400 seeded A* comparisons PASS; dependency-security 14 checks PASS |
| `git diff --check` | clean |
| `npm run test:sdk-package` | VERIFIED PASS: reproducible tarball `d914fbe3…98584`, isolated runtime, declarations |
| Internal delivery `delivery-f8f4cf8` (89 entries), archive `374ec610a36f966f13812eca0272ca5fa61d4070e32f75a98d710bbf90fd496a`, members `06d609ba…c79` | 13-step independent client acceptance VERIFIED PASS (both Android and iOS production exports) |
| External delivery `delivery-f8f4cf8-external` (81 entries), archive `c244cb2d418ab9dad9c41504032687575b15172853438ccabab680f9c80e17ab`, members `24a186d3…560` | 13-step client acceptance VERIFIED PASS |
| Profile separation | internal holds the 8 Karachi pack files; external holds none. Both ship the shared basemap `karachi-basemap.pmtiles` (rights decision, below) |
| Venue tool manifest | `11665a6c…d32` in both profiles |
| Hosted CI | `ac0b3f8` SUCCESS (before this pass); the commits of this pass are checked after the push (result recorded below) |

Candidate 3 identities from earlier (`delivery-b74aa4a`, native binaries) are retained as history. The SDK tarball changed from the native-tested `5d5bdb3f…` to `d914fbe3…` because `PlaceCatalog.ts` changed.

## 8. Native acceptance

Not rerun, deliberately. The only SDK runtime change is R1, which changes no search result for the Karachi or synthetic catalogs (differential above); R2 is a build-time CLI; the rest is tests and documentation. The Android API 36 emulator and iOS 26.2 simulator acceptance of Candidate 3 stands at its documented scope (CLIENT_DELIVERY_REPORT §10), against binaries built from `b74aa4a`, and is not claimed for `f8f4cf8` binaries. UNVERIFIED for the new bundle by design; DEFERRED BY SCOPE.

## 9. Remaining external dependencies (not software bugs)

- Physical-device GPS and TalkBack/VoiceOver review: not done (emulator/simulator only).
- Field survey: verified access points, Gate 18/19 connectors, tent/ilaqa/facility coordinates.
- Native-speaker review of the 85 draft Urdu/Roman Urdu strings.
- Rights decisions: external distribution of the Karachi data and of the OpenStreetMap-derived basemap that is named `karachi-basemap.pmtiles`; production signing (Android uses the Expo debug keystore).
- Owner decisions on the remote and non-equivalent local branches in section 2, and on merging/closing #178, #179, #380, #381.

## 10. Classification

| Item | Class |
| --- | --- |
| SDK source, tests, packages, both client deliveries | **GO** for continued engineering and client integration trial on emulators/simulators with the stated limits |
| Physical devices, field use, external release of the Karachi data, production signing | **NO-GO** until the external items above are closed |
| Branch cleanup | done at the safe boundary; rest NEEDS OWNER APPROVAL |
