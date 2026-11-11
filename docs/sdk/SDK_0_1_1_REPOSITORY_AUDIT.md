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
| Hosted CI | `ac0b3f8` SUCCESS (before this pass); the commits of this pass were checked after the push: SUCCESS on `f604386`, the commit that added this file (a later doc-only commit has its own run, not claimed) |

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

---

# Production Scale, Navigation Accuracy & Client Handover Review (10 November 2026, second pass)

A separate pass after the repository audit above. It reads the source, measures behaviour with one repeatable script, fixes what the measurements proved, and ends in a handover recommendation. Evidence files (tracked): [repository-audit/scale-accuracy-2026-11-10.json](repository-audit/scale-accuracy-2026-11-10.json) (measurements after the fixes), [repository-audit/first-party-file-inventory-2026-11-10.csv](repository-audit/first-party-file-inventory-2026-11-10.csv) (159 files), [repository-audit/branch-review-2026-11-10.csv](repository-audit/branch-review-2026-11-10.csv) (53 refs). Reproduce the measurements with `npm run bench:sdk-scale -- <out.json>`.

Evidence levels used below: SOURCE VERIFIED, AUTOMATED TEST VERIFIED, EMULATOR/SIMULATOR VERIFIED, PHYSICAL DEVICE VERIFIED, FIELD SURVEY VERIFIED, NOT MEASURED, BLOCKED, DEFERRED, OWNER APPROVAL REQUIRED. Nothing in this pass reached PHYSICAL DEVICE or FIELD SURVEY level, and nothing was run on an emulator or simulator in this pass.

## R1. Executive verdict

SDK 0.1.1 is technically ready for a **client integration trial** (the client builds it into their app and tests on their devices). It is **not** shown to be ready for unattended production use by 100,000 people: that needs physical-device and field evidence that does not exist yet. This pass found no P0 defect. It found and fixed one P1-class performance defect that only large venues hit (a Live request from far outside the venue froze the app's JavaScript thread, 26 s at 100,000 graph nodes), one P2 navigation defect (progress could run hundreds of metres ahead of the walker on a route that folds back beside itself, under heavy GPS noise) and one P2 search defect (the ready-made screen did not find Urdu typed on an Arabic keyboard or names typed with punctuation). All three have tests that failed before and pass now.

## R2. Actual Git state (verified live, not taken from the earlier report)

| | |
| --- | --- |
| Machine | `Ghilmans-Laptop.local` (PC 1), `/Users/ghilmankhan/workprojects/offline-map`, 8 cores, 16 GB, 36 GiB free. Node 24.14.0, npm 11.9.0, Xcode 26.2, CocoaPods 1.16.2, JDK 17.0.19, Android SDK present |
| Start of pass | local = tracking = live GitHub = `08c94495a0904ced4cdb66039d0213be9a66e1c0` on `feat/muslim-ummah-offline-navigation-sdk`, clean tree, hosted "SDK checks" SUCCESS on it. The other machine had not advanced the branch |
| Default branch | `integration/ijtema-clean-baseline` (GitHub). The local `origin/HEAD` still points at `origin/main` (stale pointer, harmless, not changed) |
| Worktrees | 1. No clone, worktree or branch was created in this pass |
| Stashes | 2, unchanged: `b5a47d6c…` (on `fix/a3-01-rtl-label-overlay`), `6d4a9c8d…` (on `integration/ijtema-clean-baseline`) |
| Tags | 3, unchanged. **No SDK release tag and no release branch exists** |
| Branches | 37 local, 218 remote-tracking refs. Nothing deleted |
| Open PRs | #381 MERGEABLE, its only check FAILED (the run that never got a runner, see the earlier billing note); #380 MERGEABLE, checks pass; #179 draft, pass; #178 draft, CONFLICTING. All four target the host baseline, none targets the SDK branch. None touched |

The earlier figures (81 branches removed, 37 left, one worktree, two stashes, four open PRs) all match the live state.

Branch review of the 53 refs that are not ancestors of the SDK branch (read-only): SUPERSEDED 23, PROTECTED 12, FULLY INTEGRATED 9, REQUIRES REVIEW 6, KEEP 3. The six REQUIRES REVIEW refs are remote-only host-app work with no PR: `origin/feat/phase2-ui-fixes-consolidation` (RTL overlay, Android nav-bar lift, footer fit), four `origin/claude/l10n-*` (host localization) and `origin/claude/docs-canonical`. **No unmerged branch holds a routing, GPS, arrival, search or venue-data fix that the SDK package lacks.** The one unmerged behavioural GPS fix (#381, A1-08) is for a host-app defect the SDK controller does not have: `acquireLive` takes one fresh fix per explicit start. The SUPERSEDED verdicts on the old September lines rest on the key identifiers being present on this branch; their UI diffs were not compared line by line.

## R3. Architecture health

The SDK package is 77 tracked files, about 7,400 lines of source: `domain/` (headless: A*, venue and street routing, geometry, catalog, journey policy, session, controller, pack manager and verifier), `ui/` (the ready-made screen and its parts), `maplibre/` (map adapter and offline style), one Expo plugin and one Metro helper. The inventory CSV lists every first-party file with its area, reachability, API surface, imports, state it holds and security relevance. (Its last column is a file-name heuristic: tests import through the package entrypoint, so a "no" there does not mean untested. Line coverage was NOT MEASURED.)

Findings, SOURCE VERIFIED:

- **One navigation authority.** `NavigationController` is the only owner of trip state. One trip is one `NavigationSession`; every asynchronous result commits through `request.commit()`, so a late route, fix or reroute for a superseded trip cannot land. Exit, a new destination and arrival all cancel the session. Watchers are owned by identity, so a stopped watcher that still calls back is ignored. No timer lives in the domain: the clock is injected and the host calls `tick()`.
- **No leak found by reading the controller**: every watcher, abort controller and listener set it owns has a release on exit, dispose, arrival and resume. The UI components were not read line by line for this. A retained-memory leak was NOT MEASURED on a device and none is suspected.
- **Duplication that mattered** (fixed, R13): the screen had its own text filter that did not share the catalog search's folding.
- **Work on the JS thread that mattered** (fixed, R13): the nearest-node search and the per-keystroke search indexing.
- **Host coupling**: the package imports nothing from the host app (`src/`), and the delivered tarball is compiled `dist/` only. `react`, `react-native` and MapLibre are peers, so the client app supplies the single copy.
- **Not in the package**: the Expo location adapter and the pack runtime (file-system store, native digest) live in the sample app, not the SDK (see R9). This is the main remaining integration friction.

## R4. Navigation correctness

**Routing, AUTOMATED TEST VERIFIED.** On the real Karachi graph (303 nodes, 686 directed edges) every ordered node pair, 91,506, was routed by the SDK's A* and by an independent array-scan Dijkstra written for this pass: **0 cost differences, 0 endpoint errors**; 1,206 pairs are unreachable and both agree (every one involves Gate 18 or Gate 19). The existing 91,506-pair golden and the 2,400 seeded differential comparisons still pass unchanged (R14); no golden was regenerated. The heuristic is provably admissible: it is scaled by the smallest cost/straight-line ratio of any edge, and a node whose cost improves is re-expanded.

**The twenty scenarios** (what the code does; S = source reading, T = a test exists or the simulation measured it):

| # | Scenario | Behaviour | Level |
| --- | --- | --- | --- |
| 1 | Near two parallel footpaths | Live starts from the nearest graph node. While walking, a continuity window keeps progress on the corridor the walker was on unless another is clearly closer | S, T |
| 2 | Block close by, no verified entrance | The route ends at a block boundary node and the screen says "edge of the block", never "entrance" | S, T |
| 3, 19 | Gate disconnected / no route | `destination_unreachable` or `no_route`; no route is drawn, Guide and Live are not offered | S, T |
| 4 | Nearest node cannot reach the destination | Live is refused (`no_route`); a reroute keeps the old route and says so. It never joins two nodes that have no edge. Limit: it does not try the next-nearest node. In Karachi the only such nodes are Gates 18 and 19, 362 m and 190 m from any connected node, so no walker within the 100 m snap radius is affected | S, T |
| 5 | GPS jump across a wall | One or two outlier fixes cause nothing. Three in a row, 12 m of movement and no cooldown trigger a reroute from the nearest node. The SDK has no wall data: it cannot know a wall is there | S, T |
| 6 | Weak or reduced accuracy | A fix worse than 50 m, or approximate-only permission, freezes progress, arrival and reroute evidence and shows a weak/lost signal; the trip is kept | S, T |
| 7, 8 | Repeated, stale or out-of-order fixes | Dropped: an observation time at or before one already seen is no news; a fix older than 30 s or from the future is stale | S, T |
| 9 | Walking the opposite way | Progress never moves backwards by more than 15 m, so it stays where it was; the dot on the map follows the walker. **No "you are going the wrong way" warning exists.** Characterised, not changed (owner decision) | S |
| 10 | Pausing for minutes | Nothing changes; no reroute without 12 m of movement | S, T |
| 11, 12 | Crossing or looping route | The continuity window and the forward bound keep progress on the leg the walker is on; see the fold defect fixed in this pass | T |
| 13 | Two routes of similar cost | The cheaper wins; an exact tie is broken deterministically (start-major order), identical to the published goldens | T |
| 14 | Overlapping reroutes | One at a time; a new request supersedes and aborts the old one | S, T |
| 15 | Destination changes during calculation | New session; the old result cannot commit | S, T |
| 16 | Venue changes during navigation | A controller serves one venue. The host must create a new controller for a new venue (the sample does). Not enforced by the SDK | S |
| 17, 18 | Arrives near but outside the destination / at a block boundary | Arrival is judged at the route's last node (20 m), on the last walking step. For a block that node is a boundary corner, and the wording says so | S, T |
| 20 | Location service stops | After 8 s without a usable fix the signal is `lost`; progress and arrival freeze; fixes resuming restore it. On foreground resume the watcher is restarted and cached fixes are rejected | S, T |

**Simulated accuracy on the Karachi graph, AUTOMATED TEST VERIFIED (simulated fixes, not real GPS).** 1,492 live walks (26 start nodes × 58 routable destinations; 16 more pairs refused because the walker already stood on the destination), one fix a second at 1.4 m/s:

| Measure | No noise | 5 m noise | 12 m noise |
| --- | --- | --- | --- |
| Arrival declared | 1,492 / 1,492 | 1,492 / 1,492 | 1,492 / 1,492 |
| Reroutes of a walker who never left the route (unnecessary) | 0 | 0 | 0 |
| Along-route position error p50 / p95 / p99 / max | 0 | 3.4 / 10.0 / 13.5 / 54.6 m | 8.9 / 25.2 / 33.5 / 72.6 m |
| Route still to walk when arrival was declared p50 / p95 / max | 14.4 / 20.0 / 22.0 m | 19.4 / 27.8 / 39.0 m | 28.4 / 41.2 / 83.2 m |
| Arrivals with more than 40 m of route left | 0 | 0 | 105 (7.0 %) |
| Straight-line distance to the endpoint at arrival, max | 20.0 m | 38.4 m | 55.3 m |

Reading: with good or ordinary GPS the engine does not arrive early and does not reroute needlessly. With 12 m noise (reported accuracy 24 m, still inside the 50 m acceptance) one lucky fix inside the 20 m radius declares arrival early, typically 28 m and at worst 83 m of route before the end (the walker is then within about 55 m in a straight line). This is the arrival-radius versus accuracy policy that PR #380 characterises for the host. It was measured, not changed: OWNER APPROVAL REQUIRED to tighten it (for example, two consecutive fixes inside the radius), because a stricter rule can also leave a walker with poor GPS standing at the destination without an arrival.

Before this pass the 12 m column had a worst along-route error of **461 m** and a worst early arrival of 108 m of route: the fold defect (R13, N-1).

**Not measurable here**: real along-route error, real arrival correctness, crowd and tent-canopy effects, recovery from real GPS loss. NOT MEASURED; they need physical devices at the venue. A route that is optimal on the graph is only a correct walking route if the graph is a correct survey.

## R5. Geographic truth (Karachi)

Counted from the pack the build produces (`karachi-ijtema@1.1.0`, manifest `4eea9a74…cec1`), AUTOMATED TEST VERIFIED:

| Kind | In the SDK today | Routable | Status |
| --- | --- | --- | --- |
| Blocks | 42 polygons, 42 centres, 168 corner nodes | 42, as **provisional**: the route ends at a corner-derived boundary node | Corners are geometry. All 168 access points are `LEGACY_UNVERIFIED`. **Verified entrances: 0** |
| Gates | 18 | 16 routable, 2 unreachable | Gates 18 and 19 are located but have no connector; they stay unsupported |
| Rastas | 11 lines (+ 3 special routes) | Drawn on the map; they are not searchable destinations | — |
| Ilaqas | **0** in the pack | — | The owner's `Map data.xlsx` (sha-256 `c6ef3be4…1f1e`) was re-run through the importer in this pass: 99 ilaqas, **all without coordinates**, outcome `NEEDS_REVIEW` (5 duplicate-name pairs, 89 unreviewed draft names, 1 placeholder name, no Metadata sheet, redistribution unconfirmed). None is in the shipped pack; none was given a location |
| Tents, facilities (water, canteen, medical…) | **0** | — | No data exists. The schema, importer and screen support them |

For all 58 routable places the route from a gate ends on one of the place's own nodes; for the 2 unreachable gates no route is drawn (0 wrong out of 60). The destination marker (block centre) and the route endpoint (boundary node) are separate and labelled. A walker is therefore led to the **edge of the right block**, not to a verified entrance and not to a tent. FIELD SURVEY VERIFIED: nothing.

**Data freshness policy (recommended, uses the existing pack mechanism; nothing implemented):** stable for years: block polygons, gate positions, the basemap. Changes per event: which gates are open, ilaqa and tent assignment, temporary walkways, facilities, restrictions. So: one pack version per event edition (`karachi-ijtema@<year>.<n>.<patch>`), every pack pinned by its manifest digest in the app build, `createdAt` and survey provenance shown to the operator, a pack older than the event refused by the host at start-up (a host check; the SDK exposes the manifest). Until a signed remote update exists (separate authorisation), a data change is an app update.

## R6. Offline verification

SOURCE VERIFIED: the SDK package, its plugin and the iOS module contain no `fetch`, XMLHttpRequest, WebSocket, analytics or storage of location history; the only URL is the OpenStreetMap credit link text. The map style has no `glyphs`, no `sprite` and no remote source; tiles come from `pmtiles://<local file>`. Routing, search, steps, progress, reroute and arrival are pure functions over the local pack. Packs are verified (size, SHA-256, strict JSON) from local files; a corrupt or missing pack is refused with a specific error and there is no online repair.

AUTOMATED TEST VERIFIED: the headless journey (pack → venue → route → guide → live with injected fixes → reroute → arrival) runs in plain Node without React Native, in the package test and in the client acceptance; there is no network call in that code to make.

EMULATOR/SIMULATOR VERIFIED: only by the earlier Candidate 3 run (Android API 36 emulator in airplane mode, iOS 26.2 simulator), on binaries built from `b74aa4a`. **Not rerun in this pass**; the three fixes below are in JavaScript that those binaries do not contain. A cold-start-offline run on a physical phone is NOT MEASURED.

Three separate things: (1) the SDK makes no network request, as above; (2) the client's own app may still need the network for its other features: not ours to state; (3) the phone's location service may use Wi-Fi and cell assistance when it has them and falls back to satellites alone when it has none, which is slower to a first fix. That is the operating system, not an SDK call. Manual Guide needs no location at all and stays available whenever a route can be calculated.

## R7. Readiness for 100,000 users

There is no server. Every device routes on its own, so 100,000 users is 100,000 independent installs, not concurrent load. The questions are per-device cost, device variety, and how data updates reach people.

Measured on this Mac (Node 24, one core; a mid-range phone is roughly 5 to 10 times slower: that factor is an estimate, NOT MEASURED). Karachi is real data; the larger rows are **synthetic grids**, not venues:

| Dataset | Pack JSON | Parse + index | Retained heap | Search p50 / p95 | Screen filter p50 / p95 | Route p50 / p95 / p99 | Live start p50 / p95 | Live request 1,000 km away |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Karachi (303 nodes, 60 places) | 0.2 MB | not timed separately | not timed | not timed | not timed | 0.05 / 0.17 / 0.21 ms (n = 91,506) | not timed | not timed |
| 1,000 places | 0.6 MB | 27 ms | 2.8 MB | 0.24 / 0.45 ms | 0.09 / 0.19 ms | 0.11 / 0.64 / 1.4 ms | 0.12 / 0.64 ms | 0 ms (was 79 ms) |
| 10,000 | 5.7 MB | 205 ms | 28 MB | 1.9 / 2.9 ms | 0.7 / 2.4 ms | 0.6 / 6.2 / 7.2 ms | 0.34 / 3.7 ms | 0 ms (was 46 ms) |
| 50,000 | 29 MB | 987 ms | 107 MB | 15.8 / 22.0 ms | 7.5 / 8.9 ms | 7.1 / 36.6 / 39.4 ms | 2.8 / 16.0 ms | 0 ms (was 3,324 ms) |
| 100,000 | 58 MB | 2,077 ms | 281 MB | 32.3 / 40.4 ms | 15.5 / 17.9 ms | 15.9 / 62.5 / 81.6 ms | 11.6 / 98.3 ms | 0 ms (was 26,554 ms) |

Search, screen filter and route: n = 60 per row; live start n = 20. The first screen filter after the list is built indexes every item once (380 ms at 100,000; it was 139 ms on **every** keystroke before).

What this supports and what it does not:

- **Karachi-sized venues (hundreds of nodes, tens to a few hundred places): comfortable**, with two orders of magnitude of headroom even on a slow phone. AUTOMATED TEST VERIFIED on a desktop; EXTRAPOLATED to phones.
- **Up to about 10,000 places**: expected fine on a phone (tens of ms). EXTRAPOLATED.
- **50,000 to 100,000 places in one pack**: works, but 107 to 281 MB of JavaScript heap and a 1 to 2 s parse on a desktop mean several seconds and real memory pressure on a low-end Android phone. Not recommended without splitting the venue or moving the graph out of JSON. The pack format's own limits are 200,000 nodes, 1,000,000 edges, 100,000 places.
- NOT MEASURED: time to a usable map, frame times, CPU, battery, memory during and after Live, disk-pressure behaviour, on any physical device. The location adapter in the sample asks for one fix a second; battery cost of that was not measured.

Proposed acceptance budgets for the owner to approve (none exists today): cold start to usable map ≤ 3 s on a 2020 mid-range Android; search result ≤ 100 ms per keystroke; route ≤ 300 ms; Live start (after the fix arrives) ≤ 500 ms; no frame over 100 ms while live; ≤ 5 % battery per hour of Live; crash-free sessions ≥ 99.5 % in the pilot.

Reliability matrix: missing, corrupt or invalid pack; permission denied or approximate-only; GPS off; background and foreground; rapid repeated starts; no network: each is handled with a specific state and none produces a route that was not calculated (S, T). An interrupted pack installation never changes or loses the active pack (T). Process death, low storage, low memory, slow devices, orientation and font changes on real hardware: the first is by design a restart to browsing (the SDK persists nothing); the rest are NOT MEASURED on devices in this pass.

**100K verdict: NOT VERIFIED.** The engine is per-device and cheap at Karachi size, which is the right shape for 100,000 users. The evidence is a desktop benchmark, simulated walks and two virtual devices. It is not evidence of reliability across 100,000 real phones.

## R8. Core UX

AUTOMATED TEST VERIFIED (component tests of the ready-made screen): destination list with category chips, search, selected destination and start rows, route length and time, Manual Guide stepping, the explicit Live button and its two-step review, every reason Live can be refused in words, weak and lost signal, rerouting notice, arrival card (with the block-edge wording), Exit and a new trip. RTL, dark mode, large fonts and Android insets were verified on virtual devices in earlier passes, not rerun here.

Found and fixed in this pass: Urdu search on the screen (R13, S-1). Still open, not defects of the code: no wrong-way warning (scenario 9); no tolerance for misspellings (a dropped letter finds 25 of 218 names, a swapped pair 0 of 218: places are found by prefix, any word, alias or number, not by fuzzy match. Adding aliases in the data is the supported remedy; fuzzy search would be a feature, OWNER APPROVAL REQUIRED); five ilaqa name pairs are duplicates in the owner's workbook and the screen will show a namesake hint for them once they have locations; 85 Urdu and Roman Urdu strings are drafts awaiting a native reviewer. TalkBack and VoiceOver by ear: NOT MEASURED.

## R9. Client integration

What was actually exercised in this pass, AUTOMATED TEST VERIFIED: the 13-step independent client acceptance on both delivery archives (R14): unpack with Node only, verify checksums, compile and verify a venue pack with the shipped tool, `npm ci` from the shipped lockfile in a fresh directory outside the repository, one copy each of react, react-native and MapLibre, type-check against the shipped declarations, run the consumer tests, apply the Expo plugin and inspect the generated native configuration, and make production Metro exports for Android and iOS.

| Scenario | Status |
| --- | --- |
| A. New Expo app, Expo 54 / RN 0.81.5 / MapLibre 11.5 | Verified **with the shipped sample app** as the starting point (above). A blank `create-expo-app` project following only the quick start: NOT MEASURED |
| B. Existing Expo app with its own navigation, theme and store | NOT MEASURED. By design the screen is one component given a controller, a theme and copy; it owns no navigator and no global store. Conflicts to expect: an app that already lists `expo-location` or the MapLibre plugin must remove them (the SDK plugin applies both), and RN other than 0.81.5 stops the Android font fix unless it is switched off |
| C. Bare React Native CLI | Documented, **not validated**: no bare project has been built. Not plug-and-play |

Client steps, counted from the quick start: (1) verify the archive; (2) install two tarballs and the peers; (3) one plugin entry in `app.json` and one line in `metro.config.js`; (4) put the venue pack in the app with `venue-pack app-assets`; (5) provide the location adapter; (6) mount `NavigationScreen`; (7) build. No native file is edited by hand on Expo.

Honest size of step 5 and the pack wiring: about **580 lines that the client copies from the sample app** (`expoLocation.ts` 115, `packRuntime.ts` 172, `packRuntimeExpo.ts` 140, `expoPackFileSystem.ts` 128, `nativeDigest.ts` 24), all with tests in the sample, plus roughly 50 lines of their own to create the controller and mount the screen. The SDK supplies the engine, the screen, the map adapter, the plugin and the tool; the host supplies location (through that adapter), the pack files, the theme and copy overrides, its own navigation around the screen, and signing. **Recommended next step (not done: it adds Expo peer dependencies and a new entrypoint, OWNER APPROVAL REQUIRED): ship those five files as `@muslim-ummah/offline-navigation/expo`**, which would cut the client's own code to about 50 lines.

## R10. Client handover

| Option | Client receives | Needs GitHub | Karachi data | Reproducible | Support burden | First client |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Versioned tarballs + integration kit** (the delivery archive) | SDK tarball (compiled, declarations), iOS precision tarball, venue tool, sample app source, 15 client documents, checksums, licence inventory | No | external profile: none; internal profile: yes | Yes: byte-reproducible from a named commit, checked twice per build | Low | **Recommended** |
| B. SDK-only source repository or release branch | Source of `packages/` and tooling | Yes | Must be stripped first | Yes | Medium: no such repository or branch exists; it would have to be extracted | Only if source is contractually required |
| C. Private npm registry | The same tarballs, by version | Registry account | No | Yes | Medium: a registry and release process to run | Later, once there are several clients or frequent releases |
| D. Access to `ghilmanITM360/offline-map` | Everything: host app, about 250 branch refs, the whole history, the Karachi survey, evidence, the walking-proxy backend | Yes | Yes, all of it, in history too | Yes | High, and it cannot be undone | **Not recommended** |

Identities: the last change to executable SDK code is `6128d3a`; the delivery archives of R14 are built from `8078c4eae511f8f8ce46acbf74948b9278b85b14` (the same code plus evidence files and client release notes) and carry that commit in their manifest; this section is a later, documentation-only commit. Native binaries were last built from `b74aa4a` (Candidate 3) and are history, not this delivery.

**Recommendation: Option A, external profile**, with a venue pack the client compiles from their own data. Give the internal profile only to a party the owner has cleared to hold the Karachi survey. Both profiles contain the OpenStreetMap-derived basemap of the Karachi area (ODbL, attribution included): removing the Karachi venue JSON does not remove that geography, and shipping it is a rights decision for the owner (ODbL permits redistribution with attribution and share-alike; whether the owner wants to is theirs to decide).

**Release reference (PROPOSED, not created):** annotated tag `sdk-v0.1.1` on `8078c4eae511f8f8ce46acbf74948b9278b85b14`, after owner approval. No tag or release branch of that or any similar name exists today. Policy proposed: one annotated tag per delivered archive, never moved; a fix is a new patch version and a new tag; a `release/sdk-0.1` branch only if a second client needs maintenance fixes while development continues. Nothing was tagged, published, shared or sent in this pass.

Installation instructions for the client are `docs/sdk/client/QUICK_START.md` inside the archive.

## R11. What we need from the client

REQUIRED

- App: Expo or bare; exact React, React Native and Expo versions; New Architecture on or off; Android `minSdk` and iOS deployment target; map or navigation libraries already in the app (MapLibre, Mapbox, Google Maps, `expo-location`); bundle identifiers; who builds and signs.
- Venue: a venue id and version; the venue bounds; **a surveyed pedestrian path graph** (nodes with coordinates, edges with walked length and direction); gates with coordinates and which are open; block polygons and centres; for every destination a stable id, a name, a category and either a coordinate or an explicit "not located yet"; **for every destination that should be routable, the graph node(s) where a person actually enters it, each marked verified or not**; survey source, date and who confirms it.
- Map: a PMTiles archive covering the venue (vector tiles with `landuse`, `water`, `buildings`, `roads` layers) with its bounds, zoom range, size, SHA-256, attribution text and the right to ship it; or agreement to use an OpenStreetMap extract we build.
- Location: the reviewed text for the location prompt (per language); whether Live is wanted or Manual Guide only.
- Approvals: written redistribution rights for the venue data; a named release acceptance owner; test and escalation contacts.

CONDITIONAL: approved Urdu and Roman Urdu wording if those languages ship (85 strings are drafts); aliases and alternative spellings for search; ilaqa-to-block and tent assignments if those are destinations; outside-venue street routing (needs a street graph or the host's provider); physical test devices list (needed for the pilot); walking restrictions and one-way paths.

OPTIONAL: brand colours and icons; custom copy; facilities; arrival wording; update cadence.

**Spreadsheet intake.** The importer accepts one workbook (or a folder of CSV files) with the sheets `Ilaqas`, `Tents`, `Facilities`, `Access_Points`, `Gates_Changes`, `Blocks_Changes`, `Geometry_Files`, `Metadata`; without a `Metadata` sheet (owner, rights, version) the best possible outcome is `NEEDS_REVIEW` for internal use only; every other sheet is optional and only the sheets that have data need to be present. A row without a coordinate is accepted as *pending*: it is listed and searchable, never routed. The tool reports `ACCEPT`, `ACCEPT_AS_PENDING`, `NEEDS_REVIEW` or `REJECT` with one line per problem, and never overwrites anything. Columns and a worked example are in `docs/sdk/client/VENUE_PACK_TOOL.md`; a complete fictional venue ships in the archive (`examples/synthetic-venue/`) and compiles with the shipped tool (checked in every client acceptance).

What a spreadsheet cannot give: **connectivity.** Coordinates say where things are, not which paths join them, where a fence stands or which side a tent opens on. The path graph has to come from a survey (walked GPS traces or a drawn GeoJSON of the footpaths, with someone confirming each junction). We do not derive edges from coordinates, and the client should not be asked to type edge lists by hand without that survey.

## R12. Security, privacy and data rights

- Dependencies: `npm run test:dependency-security` 14 checks PASS (R14); the disposition of the open advisories is unchanged from `docs/sdk/client/DEPENDENCY_ADVISORY_DISPOSITION.md`. No dependency was added or upgraded in this pass.
- Untrusted input: pack files go through a strict JSON parser, size and count limits and id checks; lookups use Maps, so an id such as `__proto__` is an ordinary id (SOURCE VERIFIED here for the venue-data and catalog parsers). The delivery archive is written and audited by the project's own TAR code; the importer reads only regular files under a size limit and refuses links. The pack manager, verifier, TAR and XLSX code were verified in earlier passes and were **not** re-audited line by line in this one.
- Privacy: the SDK stores no location, keeps no history and sends nothing. The last accepted fix lives in memory for the trip and is dropped on exit. Only foreground location is requested.
- **A SHA-256 pin proves integrity, not who published the pack.** Bundled packs are authenticated by being inside the signed app. Installed (downloaded) packs require a signature by default, but no signing key or update service exists yet: OWNER APPROVAL REQUIRED before any over-the-air pack.
- The sample apps are debug-signed. Production signing belongs to the client's build.
- Rights still open (OWNER APPROVAL REQUIRED): external distribution of the Karachi survey; shipping the Karachi-area basemap to third parties; the licence under which the client receives the SDK (the package says Apache-2.0 and `private: true`; that combination should be confirmed for a commercial handover).

## R13. Code changes in this pass

| Id | Sev | Defect and proof | Fix | Regression test (failed before, passes now) |
| --- | --- | --- | --- | --- |
| P-1 | P1 at scale, P2 for Karachi | `SpatialGrid.nearest` walked up to 200+ rings of empty cells, visiting every cell of each square (cubic), when the query was far from the grid. A Live request from outside the venue blocked the JavaScript thread: 79 ms at 1,000 nodes, 3.3 s at 50,000, **26.6 s at 100,000** (desktop) | optional `maxDistanceM`; the controller passes its 100 m snap radius; rings are scanned along their perimeter only, in the same order as before, so equal-distance ties are unchanged | `SpatialGrid.test.ts` "bounded nearest" (2 tests; on the old code the timing test does not finish) |
| N-1 | P2 | On a route that folds back beside itself, a noisy fix nearer the far leg was "bounded" by adding the maximum plausible advance (29 m) to progress, again on every such fix. Simulated walk SPSP-05 → Block 41, 12 m noise: progress **461 m ahead** of the walker, wrong step shown, arrival up to 108 m of route early | when the nearest point is farther ahead than the walker can have gone, and the fix is also within the off-route tolerance of the part of the route they can be on, that part wins. A fix that is near nothing reachable keeps the old bounded advance, so every existing behaviour and test is unchanged | `SdkRouteProgress.test.ts` "a route that folds back beside itself" (3 tests, 2 failed before) |
| S-1 | P2 | The ready-made screen filtered with its own function, without the catalog search's folding. On the Karachi names: Urdu typed on an Arabic keyboard (ي ك ه) found **0 of 67**; names typed with punctuation found 67 of 285 | the screen filter uses the catalog's `searchKey`; an exact name comes first; keys are folded once per item instead of on every keystroke | `SdkNavigationScreenSupport.test.ts` "folds text the way the catalog search does" (3 tests, all failed before) |
| S-2 | P3 | Headless catalog search: "block three" listed Block 23 before Block 3 (7 of 285 names were not their own first hit) and rebuilt its namesake index on every query | an exact alias breaks a tie inside a rank (rank values unchanged); the index is built once | `SdkGeometryCatalogParsers.test.ts` "an exact alias breaks a tie inside a rank" |

Also added: `scripts/sdk-audit/scale-accuracy.ts` and `npm run bench:sdk-scale`; `ui/placeSearch.ts` (the filter moved out of the React file so it can be measured; `PlaceDirectory` re-exports the same names). Removed: nothing. Public API: one optional parameter added (`SpatialGrid.nearest(lat, lng, maxDistanceM?)`); nothing removed or renamed. The host app's own copies of the progress logic (`src/services/`) were not touched.

Considered and rejected: holding progress completely on any implausible jump. It fixed N-1 but delayed arrival for a walker who takes a shortcut, and broke seven screen tests that depend on the current behaviour; too broad for a frozen candidate.

Residual, measured, not fixed: with 12 m noise 13 of 1,492 simulated walks still show a momentary progress error above 60 m (worst 73 m) where the last legs of a route wrap a block corner. The continuity window looks only forward of the last progress; making it symmetric is a design change to a published policy. OWNER APPROVAL REQUIRED.

Commits: listed at the top of R14.

## R14. Verification

Source under test: `8078c4eae511f8f8ce46acbf74948b9278b85b14` (the delivery source commit). Commits of this pass, in order: `e33eaff` (P-1), `9dae3b0` (N-1), `6128d3a` (S-1, S-2: the last change to executable SDK code), `025acb1` (measurement script, evidence files), `8078c4e` (client release notes). Everything below was run fresh in this pass on this machine.

| Check | Result |
| --- | --- |
| `npm run typecheck` (app + scripts) | AUTOMATED TEST VERIFIED, exit 0 |
| `npm run lint` | exit 0, 0 errors, 1 warning (the generated marker file, as before) |
| `npm run test:components -- --runInBand` | **234 suites, 2,536 tests PASS** (2,527 before + 9 new) |
| `npm test` (112 scripts) | exit 0; Ijtema parity 90,300 routable + 1,206 unreachable pairs `== golden`; service search parity over 91,506 pairs `== golden`; 2,400 seeded A* comparisons PASS; dependency-security PASS; venue tool, pack and headless checks PASS |
| Independent Dijkstra, 91,506 pairs (new) | 0 differences |
| `git diff --check` | clean |
| `npm run test:sdk-package` | PASS: SDK tarball `acbdd74aa9a5cc8ea7aeaad59043b0755dfc786938d90784f7df591688a0332b`, byte-reproducible, isolated runtime, declarations. (It was `d914fbe3…` before; three source files changed) |
| iOS precision tarball | `6ee10a9fb77ceeaf2266916b4979a694c6f7efba005165560d578cb13505551d` (unchanged code) |
| Internal delivery `delivery-8078c4e` (89 entries) | archive `89dc98d220a1bcf61fef486178ab4b338c0d5af3fa04278ad6962a45522d88e5`; 13-step client acceptance PASS, including Android and iOS production Metro exports |
| External delivery `delivery-8078c4e-external` (81 entries) | archive `1c31d81824eaa5b81b74e47c0001f5562e214840b6be7b76ab345475b69b6c4a`; 13-step client acceptance PASS. Built twice in this pass, byte-identical both times |
| Profile separation | internal: 8 Karachi pack files + the basemap; external: **no** Karachi pack file. Both contain `karachi-basemap.pmtiles` (OpenStreetMap-derived geography of the Karachi area: rights decision, R10) |
| Hosted CI ("SDK checks") | SUCCESS on `025acb1` (every code change) and on `8078c4e` (the delivery source commit); run ids under this table |
| Native (Android emulator, iOS simulator) | **NOT RUN in this pass. DEFERRED.** The last native acceptance is Candidate 3 on binaries from `b74aa4a`; it is not claimed for this source. The three fixes are JavaScript, covered by Jest and by the production exports, not by a device |
| Git at the end | one worktree; stashes `b5a47d6c…`, `6d4a9c8d…` unchanged; 3 tags unchanged; 37 local branches; no branch, tag, clone or worktree created; no binary or credential committed |

Archives and logs are outside Git in `~/Documents/offline-map-audits/sdk-0-1-1-production-review-2026-11-10/final/` with `SHA256SUMS`. (The parent folder also holds a first build whose two archives came from two different commits because the release notes were committed between them; it passed but is superseded by `final/` and is kept only as a record.)

Hosted CI: run 42869985073 SUCCESS on `025acb1`; run 42870971247 SUCCESS on `8078c4e`. The run for the commit that adds this section is not claimed here.

## R15. Remaining work

- **Product defects known and open:** none at P0/P1. P2/P3 by decision: no wrong-way warning; arrival can be early under heavy noise (policy); the residual fold case above; no misspelling tolerance.
- **Unverified behaviour:** everything on physical phones (GPS, battery, memory, start-up time, TalkBack/VoiceOver); native builds containing this pass's fixes; a blank new Expo app; an existing client app; bare React Native.
- **Data collection:** verified entrances for 42 blocks; connectors for Gates 18 and 19; coordinates for 99 ilaqas; tents and facilities; resolution of 5 duplicate ilaqa names and 1 placeholder; native review of 85 draft strings.
- **Field testing:** walked routes at the venue against the graph; arrival and reroute behaviour in a crowd and under canopy.
- **Owner decisions:** data and basemap rights; SDK licence for the client; the release tag; the Expo entrypoint (R9); arrival policy; the six REQUIRES REVIEW branches and the four open PRs; whether the three fixes of this pass are ported to the host app's own copies.

## R16. GO / NO-GO

| Gate | Decision | Basis |
| --- | --- | --- |
| SDK engineering (freeze 0.1.1 at `8078c4e`) | **GO** | no open P0/P1; all checks of R14 pass |
| Client integration trial (their app, their devices, external profile) | **GO** | both delivery acceptances pass; limits stated above |
| 100,000-user readiness | **NO-GO (not verified)** | desktop benchmark and simulation only |
| Controlled pilot at the venue | **NO-GO until** physical-device runs on both platforms and at least one walked field check of the graph | nothing at PHYSICAL DEVICE or FIELD SURVEY level |
| Production | **NO-GO** | pilot not done; entrances unverified; rights and signing open |

## R17. Direct answers (Roman Urdu)

**Q1. Kya SDK integrate karne se full offline navigation screen aur engine mil jata hai?** Ji haan. Engine (routing, steps, progress, reroute, arrival), ready-made `NavigationScreen`, MapLibre map adapter aur offline style sab SDK mein hain aur koi network call nahin karte. Client ko location adapter aur venue pack ki wiring khud lagani hoti hai (sample app se copy).

**Q2. Client ko kitni configuration aur coding karni hogi?** Expo par: 2 tarball install, `app.json` mein 1 plugin entry, `metro.config.js` mein 1 line, pack ko app mein rakhne ki 1 command, phir screen mount. Code: taqreeban 580 lines sample app se copy (location adapter + pack runtime) aur taqreeban 50 lines apni. Native files haath se edit nahin karni. Bare React Native abhi validated nahin.

**Q3. Karachi ka kya data usable hai, kya pending hai?** Usable: 42 blocks (route block ke kinare tak), 16 gates, 11 rastas aur 3 special routes (sirf map par). Pending: Gate 18 aur 19 (connector nahin), 99 ilaqas (kisi ka coordinate nahin), tents aur facilities (data hi nahin), aur kisi block ka verified entrance nahin (0).

**Q4. Kya route verified entrance tak le jata hai?** Nahin. Gates ke liye route gate ke apne node par khatam hota hai. Blocks ke liye route block ke corner-based boundary node par khatam hota hai, aur screen saaf likhti hai ke yeh block ka kinara hai, entrance nahin. Verified entrance ka data abhi mojood nahin.

**Q5. Kya navigation internet ke baghair kaam karti hai?** SDK ki had tak haan: source mein koi network call nahin, map local PMTiles se, headless journey bina network ke test mein chalti hai, aur pehle emulator par airplane mode mein chali thi. Is pass ke fixes ke saath naya native build aur physical phone par offline cold start abhi test nahin hua.

**Q6. Kya 100,000 users ke liye evidence kaafi hai?** Nahin. Koi server nahin, har phone khud route nikalta hai, aur Karachi size par engine bohat halka hai (route 0.2 ms desktop par). Lekin yeh desktop benchmark aur simulated walks hain. Asli phones par battery, memory, startup aur GPS accuracy measure nahin hui.

**Q7. Koi P0/P1 bug, architectural flaw ya memory leak?** P0 koi nahin. Aik P1-class performance defect mila aur fix hua (venue se door Live request par app 26 second tak freeze, 100,000 nodes par; Karachi par sirf chhota sa jank). Do P2 fix hue (fold wale route par progress aage bhaag jana; screen par Urdu search). Koi architectural flaw ya memory leak confirm nahin hua; device par memory measure nahin hui.

**Q8. Client ko kis branch, commit ya tag ka access dein?** Git access na dein. Client ko **`.tgz` delivery archive (external profile)** dein: `delivery-8078c4e-external`, sha-256 `1c31d818…6c4a`, commit `8078c4e` se bana hua. Agar client Git se hi checkout par israr kare to poora `ghilmanITM360/offline-map` repo mat dein (us mein host app, Karachi survey aur poori history hai); pehle SDK-only repository banayein aur us par proposed tag `sdk-v0.1.1` (abhi bana nahin) dein, jo commit `8078c4eae511f8f8ce46acbf74948b9278b85b14` ki taraf ho. Aaj repository mein koi SDK release tag ya release branch mojood nahin.

**Q9. Client ko kya files deni hain?** Aik archive: `muslim-ummah-offline-navigation-0.1.1.tgz`, iOS precision module ka tarball, venue pack tool, sample Expo app ka source (lockfile ke saath), synthetic venue ka input, 15 client documents (quick start, API reference, compatibility, troubleshooting, licences), `CHECKSUMS.txt` aur manifest. Dependencies: Expo 54, React Native 0.81.5, React 19.1, MapLibre React Native 11.5.x, expo-location.

**Q10. Client se kya lena hai?** App ke exact versions aur build/signing ka zimmedar; venue ka surveyed path graph, gates, block polygons, har destination ka id/naam/category/coordinate aur uska asli entrance node; PMTiles basemap aur uske rights; location prompt ka approved text; languages aur approved translations; data redistribution ki tehreeri ijazat; acceptance owner aur test contacts. Tafseel R11 mein.

**Q11. Kaun kya maintain karega?** SDK owner: engine, screen, plugin, venue tool, pack format, compatibility matrix, security fixes, naye versions aur tags. Client: apni app, build aur signing, location permission text, venue data ki sehat aur updates (agar pack woh banate hain), translations ki approval, apne devices par testing aur store release.

**Q12. Freeze karke client integration phase mein jayein?** Ji haan. SDK 0.1.1 ko is commit par engineering level par freeze kiya ja sakta hai; koi demonstrable release-blocking defect baqi nahin. Client integration trial shuru karein. Pilot aur production se pehle physical device testing, field survey (entrances, Gates 18/19, ilaqas) aur rights ke faislay zaroori hain.

## R18. Fresh-checkout acceptance (2026-11-11)

**FRESH CHECKOUT: PASS** on this Mac (single machine; a second Mac was NOT run, so cross-Mac reproduction is NOT VERIFIED).

Method: `git clone --branch feat/muslim-ummah-offline-navigation-sdk` from GitHub into a throwaway folder outside the canonical checkout (no worktree, no reuse of `node_modules`, scratch folders or old deliveries). Tested SHA `78310097c6d5449f07101aad6bc2f8ef8c030825`, equal to local, origin and live remote (0/0). Tools: Node 24.14.0, npm 11.9.0, Xcode 26.2, Java 17.0.19, CocoaPods 1.16.2.

| Step | Result |
| --- | --- |
| Git LFS | none used (`.gitattributes` has no LFS filter); the 434,589-byte basemap and all pack pins are ordinary tracked files; basemap SHA-256 `d5e6883d…8cc0` matches `BASEMAP_PROVENANCE.json` |
| `npm ci` from the committed lockfile | OK |
| `npm run typecheck`, `npm run lint` | 0 errors (1 existing warning) |
| `npm test` (112 scripts, incl. golden routing parity, headless, exports, package, archive, dependency-security) | exit 0 |
| `npm run test:components` | 234 suites, 2,536 tests PASS |
| SDK Jest (`src/__tests__/Sdk`, `Karachi`) | 40 suites, 684 tests PASS |
| SDK tarball | `acbdd74aa9a5cc8ea7aeaad59043b0755dfc786938d90784f7df591688a0332b`, byte-identical to the build in R14 |
| Internal delivery `delivery-7831009` (89 entries) | archive `34b70225b3354c6ca7f9e0421900afbb1dd65b9b74389797b28f8578c10d1b98`; 13-step client acceptance PASS (consumer install, consumer tests, Android and iOS production Metro exports, no developer paths) |
| External delivery `delivery-7831009-external` (81 entries) | archive `1618516d0ec3782b2eeaf61961b4851a3a81e0828534f230aa7c52b6339f525e`; 13-step client acceptance PASS; no Karachi pack file |

The delivery id and archive hash name the commit they were built from, so they differ from `delivery-8078c4e` only because this commit also holds documentation. The SDK tarball is identical.

**Reproduce on another Mac** (Git does not install the toolchain: Node 24.14.0 per `.nvmrc`, and for native builds only Xcode, Android SDK, JDK 17, CocoaPods, must be installed first):

```
git clone --branch feat/muslim-ummah-offline-navigation-sdk https://github.com/ghilmanITM360/offline-map.git
cd offline-map && npm ci
npm run sdk:doctor            # toolchain, committed inputs, basemap hash
npm run sdk:doctor -- --build # + typecheck, package proof, both delivery builds
```

Everything needed is in Git; nothing is fetched from another Mac or from expiring CI artifacts. Not in Git by design: `.env`, signing keys, `android/local.properties`, build outputs, historical audit evidence (kept in `~/Documents/offline-map-audits/`, hashes recorded above). The basemap rights disposition (R10) is still an owner decision; the external delivery still contains it.

## R19. Continuation checkpoint (2026-11-11)

**Not run in this pass, by decision of capacity, not by failure:** Android emulator and iOS simulator journeys on a binary containing the three production-review fixes (R14: far-Live freeze, fold ratchet, Urdu screen search); the optional Expo entrypoint (R9, next-version work); a second-Mac run; the `sdk-v0.1.1` tag (owner authorisation needed). No native, physical-device or field acceptance is claimed. This Mac now has Xcode 26.2 with an iOS 26.2 simulator runtime and CocoaPods 1.16.2 (a `ffi` gem warning appears), so the iOS build that was blocked on 2026-11-03 is worth retrying first. Next session: build the internal delivery consumer from `delivery-<sha>`, then one platform at a time with a bounded timeout and retry budget; record results here under a new R-section, not a new file.

## R20. Native acceptance, arrival policy and release manifest (2026-11-11, PC 1 `Ghilmans-Laptop.local`)

Evidence stays outside Git: `~/Documents/offline-map-audits/sdk-0.1.1-native-final/` (archives with re-verified hashes, build logs, xcresult bundles, screenshots, harness copy, arrival JSONs). Machine-readable manifest: [repository-audit/release-manifest-0.1.1.json](repository-audit/release-manifest-0.1.1.json).

**Identities (three, not one).** Runtime source: last change under `packages/`, `examples/expo-consumer`, `src/data/ijtema` is `6128d3a`. Package build: `7831009`. Documentation/tooling head: `741091d`. The diff `7831009..741091d` touches only the audit document, `.nvmrc`, `package.json` (one script), `sdk:doctor` and the CI workflow, so the two archives are retained unrenamed (`delivery-7831009`: `34b70225…10d1b98`; `delivery-7831009-external`: `1618516d…f525e`) and are now copied to the durable folder above.

**Binaries tested** (both built from the unpacked internal archive, `npm ci --ignore-scripts`, prebuild; the delivered `examples/expo-consumer`, not monorepo aliases): iOS Release simulator build, Xcode 26.2, executable `7968ea77…971220`, JS bundle `bcc9c41a…056e9d`, `SdkLocationPrecision` autolinked (Podfile.lock); Android Release arm64, APK `d9213418…f57`, installed APK hash re-read from the device and equal.

**iOS (iPhone 17, iOS 26.2 simulator; harness `native-tests/ios-candidate3`, simulated Core Location, not field GPS).**
- test02 background/foreground, test03 light/dark, test04 Urdu RTL + large text + safe area, test05 venue switch + Roman Urdu, test07 unreachable/pending offers nothing: **PASS** (full run).
- test01 full journey (offline cold start, manual guide, Live, progress, reroute, arrival, Done, second journey): **FAILED 3 times early** (after the far fix the screen showed "GPS signal lost" and no "Route updated"), then **PASSED 5 consecutive runs**, including the unmodified delivered binary, a rebuilt binary with the shipped source, and the previously accepted `b74aa4a` binary. Bisect (disable the fold fix, restore unbounded `SpatialGrid.nearest`) was inconclusive: restoring the shipped source passed too. Headless reproduction in Node and under the Hermes VM (20,000 queries on the real Karachi graph) shows bounded and unbounded `nearest` agree. **Cause not found; classified INTERMITTENT, UNRESOLVED.** Do not read test01 as a clean pass.
- test06 block route + reroute + provisional arrival: **NOT PASSED**. First run failed at "no genuine reroute" (same symptom as test01); later runs failed earlier, because XCUITest typed `bk 12` for `block 12`. The same typing loss happens on the old `b74aa4a` binary, so that part is the simulator, not the SDK.
- Not covered: reduced-accuracy precision branch (cannot be set on the simulator), physical device.

**Android (API 36 arm64 Play-image emulator, airplane mode on, `ping` unreachable).** Cold start offline with local PMTiles map, block outlines, gates, rastas and markers (750 ms `am start -W`); category filter and search; manual start/destination and Route Preview (111 m); Manual Guide next/previous; explicit Live review then Start; 1 Hz mock fixes: no early arrival at the intermediate point, off-route fixes produce "Route updated from where you are", a walked route (about 3 m/s) reaches **arrival and Done**, then a second journey starts clean; Gate 18 is listed "No verified route yet"; no crash, no ANR (`logcat -b crash` empty, 0 ANR). **PASS for these.** Findings and limits: (1) the consumer defaults to a simulated location source; the device source must be switched in demo tools, otherwise Live reports "GPS signal lost" as designed; (2) a teleport to the destination does not arrive (implausible-jump guard, correct); (3) the emulator wedged once at Live start and was restarted, not reproduced on retry (emulator, not attributed); (4) NOT RUN: Urdu Arabic-keyboard and Roman Urdu typing, venue switch, outside-venue Live, large text, Gate 19, folded-route noise (these were covered by Jest and the iOS run).

**Arrival policy (bounded comparison, `--quick` walks, 344 Live walks per noise level, source reverted afterwards).** Premature arrivals with more than 40 m of route left at 12 m noise: current policy 30 (8.7 %), also require 25 m along the route 28, **two consecutive in-radius fixes 3 (0.9 %)**, both 3. At 0 and 5 m noise all four have none. All policies still arrived in 344 of 344 walks. Median route left at arrival at 12 m noise: 28 m now, 17.6 m with two fixes. Cost of the two-fix rule: about one second later at 1 Hz; it was not exercised on weak fixes that never come twice in a row. **Recommendation:** adopt two consecutive in-radius fixes. **Not implemented:** it changes behaviour the host and tests rely on and needs native retest; OWNER DECISION REQUIRED before field use. Results are in `arrival-policy/` in the evidence folder.

**Not done.** Second Mac (NOT VERIFIED; this was PC 1). Optional Expo entrypoint (next version: reusable APIs are `createNavigationController`, `createExpoLocationAdapter`, the config plugin and the Metro helper; no new peer requirement in 0.1.1). `sdk-v0.1.1` tag (owner). External archive still contains the Karachi basemap (rights open).

**Verdicts.** Engineering implementation: GO. Latest SDK native acceptance: **PARTIAL** (Android focused journey PASS; iOS 5 of 7 stable, test01 intermittent unresolved, test06 not passed). Client integration trial: GO with the stated limits. 100,000-user readiness: NOT VERIFIED. Physical venue pilot: NO-GO. Unrestricted production: NO-GO.

## R21. Arrival accuracy fix and native acceptance status (2026-11-11, PC 1)

**Arrival policy: FIXED at source and package level** (`f3d454d`, example test `6b65327`). Arrival now needs two consecutive valid in-radius Live fixes (increasing timestamps, current session). Duplicate, stale, out-of-order, weak, lost and pre-watcher cached fixes never count; an out-of-radius fix, GPS loss (`tick`), reroute, journey change or exit discards the pending arrival. Graph, coordinates, costs and goldens untouched. RED to GREEN: 7 new tests failed on the old controller, pass now; 2543/2543 jest, typecheck, lint, full `npm test`, package proof, 13/13 client acceptance for both archives.

**Before vs after** (344 Live walks per noise level, deterministic simulator, outputs in `arrival-policy/`): at 12 m noise premature arrival (more than 40 m of route left) 30 (8.7 %) to 3 (0.9 %); route left at arrival p50/p95/max 28/44/51.4 m to 17.6/30.4/44.8 m; 344/344 still arrive. At 0 and 5 m noise: zero premature both. Real arrival (clean walk) about 1.4 m / ~1 s later (14.4 to 13.0 m left at p50). Remaining 3 premature walks at 12 m noise are two consecutive noisy fixes; not eliminated.

**iOS (6b65327 Release simulator binary, executable `e57e83d4…400ff0`).** test01 root cause of the earlier intermittent failures classified **HARNESS**: the feeder thread died on an uncaught `simctl location` `TimeoutExpired` (3 of 3 failing runs had it, 0 of 5 passing runs). Patched with a retry wrapper. **No clean native pass on the new binary**: reruns failed under a thrashing host (load 270-410, swap about full, `spindump` active, repeated `SIMCTL_TIMEOUT`); the last test01 attempt ran 3325 s and failed. Environmental blocker, three bounded recovery attempts (simulator reboot, full shutdown/reboot, wait and single-test rerun). **test01: NOT PROVEN FIXED.** test06: typing loss is simulator/XCUITest (old binary identical); `typeVerified` added to the harness but **not run**; the original "no genuine reroute" failure remains unexplained. Not labelled an SDK defect (no reproduction).

**Android (6b65327 APK `8a204853…6e2`).** Built (arm64 release), **not installed or run**; no emulator could be started reliably on the blocked host. Android native acceptance for the arrival change: **BLOCKED / NOT RUN**. The R20 Android pass predates the change.

**Verdicts.** Arrival policy FIXED (source/package). Native acceptance of 6b65327: BLOCKED (host). Client integration trial: GO with limits only after the owner accepts that native reruns on the corrected build are pending; rerun test01, test06 and the Android journey on a quiet host first. Physical venue pilot: NO-GO. Unrestricted production: NO-GO. Owner decisions open: `sdk-v0.1.1` tag, publish, Karachi basemap rights in the external archive. Second Mac: NOT VERIFIED.

## R22. Native acceptance retry preflight (2026-11-11, PC 1 `Ghilmans-Laptop.local`)

PC 2 was not available; this is still PC 1. Repo at `88f7a81`: local = tracking = live remote, 0/0, clean tree, 1 worktree, 2 stashes. All five corrected identities re-verified by SHA-256 against the R21 values (SDK `39c7f7c7…a4a24`, internal `0fade7be…98`, external `8c68959c…9bce9b6`, APK `8a204853…6e2`, iOS executable `e57e83d4…400ff0`).

**Host preflight FAILED, no native test started.** Readings 07:46-07:49: load 42 then 135 then 167 (8 cores), swap 19.2/20 GB then 18.3/19.5 GB used, about 60 MB of free pages, Data volume 97 % full (14 GiB free). Top CPU: iCloud `bird`, `fileproviderd`, `fseventsd`, WindowServer, `mdworker` (unrelated to this work, not killed). Recovery attempts (2): shut down my idle iPhone 17 Pro simulator and re-measure after 90 s (load rose, not fell); wait/observe 60 s (no improvement). No other authorized machine available.

**Result: Android API 36 journey on the corrected APK: BLOCKED (not run). iOS test01 and test06 on the corrected binary: BLOCKED (not run).** Nothing is claimed PASS. Next: rerun on PC 2 or after iCloud/swap pressure clears, with a process-group watchdog (boot 3 min, test 10 min). Tag, publish and basemap-rights decisions unchanged (owner).
