# Current Project State (verified 2026-09-24, execution pass)

Working report per the production-readiness takeover brief. This is the
**third pass** over the same ground: the first two passes (audit,
evidence-hardening) produced no code changes; this pass reconciled the
ticket backlog, corrected milestone classification, verified installed
framework versions, and executed exactly one engineering ticket
(DATA-VALIDATION-002) on branch `fix/v2-data-structural-validation`
(based on canonical HEAD `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`, not
`main` — see §1a). Every claim below is tagged with an evidence status,
backed by a citation in
[`docs/audit/EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md) (cited here
as `EV-###`). Nothing here is fabricated; where evidence doesn't exist, it
says so instead of guessing.

Evidence-status legend used throughout: **REPO-VERIFIED** ·
**GIT/GITHUB-VERIFIED** (from authenticated `gh` access to a private repo —
not publicly web-verifiable) · **TEST-VERIFIED** · **RUNTIME-VERIFIED** ·
**OFFICIAL-DOC-VERIFIED** · **INFERENCE — needs validation/benchmark** ·
**OWNER-REQUIREMENT** · **FIELD-DATA-REQUIRED** · **UNVERIFIED**.

---

## ENVIRONMENT LIMITATION (not an application finding)

claude-mem (this session's memory-capture tooling) is unavailable — its
inference allowance is exhausted. This is tooling, not the app; it is not
mixed into any conclusion below (EV-037).

---

## 1. Branch / HEAD / divergence

**VERIFIED FACTS**
- Canonical branch: `integration/ijtema-clean-baseline`. GIT/GITHUB-VERIFIED — Issue #63's own body states it (EV-001).
- Current canonical HEAD: `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81` (PR #114, merged 2026-09-23T17:59:40Z). GIT/GITHUB-VERIFIED + REPO-VERIFIED (EV-002).
- `main` (local + `origin/main` HEAD `42451f1`) and canonical `integration` are **genuinely diverged** — merge-base `dd56453`, neither is an ancestor of the other. `main` has 13 unique commits; `integration` now has **105** unique commits (up from 86 at the last check — 19 more PRs landed on integration since; not a contradiction, the branch moved). GIT/GITHUB-VERIFIED (EV-004).
- Issue #63 (the rollup tracker) cites a canonical SHA (`2c01967`) that is a real ancestor of current HEAD but **24 commits stale** — the tracker text itself needs a refresh, independent of any code defect (EV-003).
- CI on current HEAD `1599c32`: one composite check-run, `conclusion: success` (EV-031). This job runs typecheck, lint, Jest component tests, and ~100 chained custom test-runner scripts — success means all of them passed, not specifically "Jest."

**UPDATED — no longer unverified**
- The prior handoff's "499/499 Jest PASS" figure was UNVERIFIED as of the last pass. This pass ran the suite directly: **55 suites / 597 tests, all passing**, on branch `fix/v2-data-structural-validation` (EV-043). The figure grew since whatever point produced "499" — not a contradiction, a fresh direct count superseding an unverifiable one.

**1a. `main` vs. canonical: real, structurally significant divergence in this exact data area**

The real checkout stayed on `main` throughout the first two passes. This pass discovered `main`'s `src/data/ijtema/gates.ts`/`types.ts`/`graphBuilder.ts`/`rastas.ts` are **meaningfully behind** canonical: `main`'s `Gate` type has no `connectorStatus` field at all, and `main`'s rasta/graph-builder code has no segment/junction topology model (EV-040). This is why the DATA-VALIDATION-002 engineering branch (§7) was created from canonical HEAD, not from `main` — building against `main`'s data model would have targeted already-superseded types.

**Reconciliation of `main`-only commits (was Epic-1 gap, now resolved with evidence):**

| Commit(s) | What it does | Canonical-branch status | Evidence status |
|---|---|---|---|
| NEW-02 (`de077f1`/`bf0c44b`) — preserve Shahr-e-Pindal destination identity across reroute | Canonical commit `4647ab9` ("camera-readiness gate for map commands, **special_route destination identity round-trip**") addresses the same-named failure mode | **SUPERSEDED (moderate confidence)** — title match only, no diff-level comparison performed | REPO-VERIFIED (weak), EV-029 |
| NEW-03 (`e5bb03c`) — retain manual entry gate across automatic reroute | Canonical branch has persistent `manualGateId` component state explicitly threaded into every reroute request build (`NavigationViewModelV2.ts:120,293,303,374,377`) | **SUPERSEDED (strong confidence)** — the retention mechanism this fix wanted already exists structurally | REPO-VERIFIED, EV-028 |
| NEW-06 (`70d7100`) — charge measured provider-endpoint connector distance | Canonical branch's `connectorCostM` is still a **hardcoded literal `0`** (`RoutingServiceV2.ts:999`), defended by an architectural comment, not a measurement | **AMBIGUOUS — genuinely unresolved.** Cannot be settled by static reading; needs a dedicated route-trace/runtime test | REPO-VERIFIED, EV-030 |

None of `main`, its branches, or the 13 unique commits were deleted. Do not retire `main` until NEW-06 gets a dedicated runtime verification ticket (see §7, NEW-1).

---

## 2. Gate 03 / 17 / 18 / 19 — forensic evidence table

Source: full read of `src/data/ijtema/gates.ts` at current canonical HEAD `1599c32`.

| Gate | Record exists | Coordinate | Connector status | Routing status | Graph connector | Routable | Searchable | Directory-visible | Map-visible | Issue | Field verification required | Evidence status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 03 | yes | valid | `verified_by_geometry` (default) | routable | implicit (default path) | **yes** | yes | yes | yes | none open | no | REPO-VERIFIED (EV-005) |
| 17 | yes | valid | `verified_by_geometry` (default) | routable | implicit (default path) | **yes** | yes | yes | yes | none open | no | REPO-VERIFIED (EV-005) |
| 18 | yes | valid | `ground_truth_required` | missing_coordinate-equivalent (no connector) | none — explicit sourceNote: "no valid graph connector within 320m" | **no** | **no** | no (unroutable, not directory-listed per Issue #96 disposition) | yes | #43 (OPEN) | **yes** | REPO-VERIFIED + GIT/GITHUB-VERIFIED (EV-006) |
| 19 | yes | valid | `ground_truth_required` | `needs_verification` | none | **no** | **no** | no | yes | #44 (OPEN) | **yes** | REPO-VERIFIED + GIT/GITHUB-VERIFIED (EV-007) |

**Totals**: 18 gates total / 16 routable / 2 field-data-required (18, 19). Matches Issue #44's own stated count exactly (EV-008). **Not adjusted to make any UI number match — this is what the source contains, re-verified at a newer HEAD than the last check with an identical result.**

Historical claims — **now resolved with direct `main`-vs-canonical evidence** (this pass diffed the two branches directly, which no prior pass had done):
- Gate 03 "surveyed fix" — **CONFIRMED**: Gate 03's coordinate differs between `main` (`24.974729, 67.001319`) and canonical (`24.972114, 67.001482`). The fix exists, on canonical, and is covered by a dedicated regression test (`scripts/test-gate03-r2-topology-v2.ts`, passing) (EV-038).
- Gate 17 "R7/R8 branched topology fix" — **CONFIRMED**: canonical's `Rasta` type gained an explicit `segments`/`junctions` topology model absent from `main`. R7 uses 2 segments joined by 1 explicit junction; R8 uses 3 segments joined by 2 explicit junctions; `graphBuilder.ts` gained a `FORBIDDEN_INFERRED_INTERSECTION_PAIRS` set suppressing one specific wrong auto-inferred link. Two dedicated regression tests exist and pass (`test-r7-r8-topology-v2`, `test-r7-r8-route-regression-v2`) (EV-039). This upgrades last pass's "UNVERIFIED at graph-topology level" to REPO-VERIFIED + TEST-VERIFIED.
- Gate 18/19 "ground-truth blocked" — confirmed unchanged, FIELD-DATA-REQUIRED.

---

## 3. Mimbar default reference origin (Epic 4)

**FIELD-DATA-REQUIRED.** Re-ran a complete search this pass, broader than before:
- Current tree, both branches (`integration`, `main`): zero hits for mimbar/minbar/mimber/منبر.
- **Full commit history, all branches, pickaxe search** (`git log --all -S"mimbar"` / `-S"minbar"`) — zero hits. This is stronger than the prior pass's tree-only search: it proves no commit ever introduced or removed Mimbar content, not just that it's absent today.
- Commit messages, all branches — zero hits.

(EV-011)

Epic 4 (route-from-Mimbar-when-no-manual-origin) cannot be implemented without fabricating a coordinate, which is explicitly forbidden. **Required before any code is written**: stable ID, official/local name, latitude, longitude, pedestrian entry/standing reference point, a graph connector into the existing venue graph, survey provenance, and a verification status — the same class of evidence Gates 18/19 are already blocked on. Do not invent it.

---

## 4. Ticket-system reality (Epic 1 / 9)

**VERIFIED FACTS** — re-pulled the full issue/PR list this pass (not reused from the prior pass):
- 43+ issues total; PRs #67 through #114 all confirm MERGED into canonical, dated 2026-09-21 through 2026-09-23.
- Currently open: **#95** (arrival detection design mismatch, P2, bug), **#93** (nearest-node snapping continuity risk, P1, needs-field), **#63** (rollup tracker, stays open, text 24 commits stale — see §1), **#49/#48/#47** (owner-decision, P1/P1/P2), **#46** (physical field acceptance, P1), **#44/#43** (Gate 19/18 field verification, P2).
- **#96** (CLOSED) — re-verified in source this pass, not just trusted by closed-status: `DestinationRow.tsx:40,50` implements the muted/disabled treatment, with a matching component test (`DestinationRow.test.tsx`) passing (EV-047). Correctly closed.

**Milestone classification correction (owner-clarified, 2026-09-24):** current milestone is a **fully tested and stable Android APK**, not Play Store/App Store release. #47 (legal/store links), #48 (production signing), #49 (Maps Cloud-Console restrictions) reclassified via issue comment as **FUTURE DEPLOYMENT, not current-APK blockers** — left OPEN, not closed, not modified in scope (EV-045). #46 (physical field acceptance) was reviewed for splitting into sub-issues and **deliberately not split** — its scenario list spans one continuous physical visit, not independent workstreams; documented via issue comment.

**Reconciled ticket list — filed as GitHub issues this pass** (checked against existing issues first via `gh issue list --search`; none duplicated) (EV-046):
1. **[#115](https://github.com/ghilmanITM360/offline-map/issues/115)** (NEW-1, AUDIT, P1): Resolve `main`-only NEW-06 ambiguity with a dedicated runtime/route-trace test; formally classify NEW-02 at diff level, not title-match level. Blocks safely retiring `main`.
2. **[#116](https://github.com/ghilmanITM360/offline-map/issues/116)** (NEW-2, FIELD-DATA): Mimbar field survey. Blocks Epic 4.
3. **[#117](https://github.com/ghilmanITM360/offline-map/issues/117)** (DATA-VALIDATION-001, CLEANUP, P2): Retire or explicitly reconcile the legacy `src/constants/data.ts`/`IJTEMA_DATA` dataset.
4. **[#118](https://github.com/ghilmanITM360/offline-map/issues/118)** (DATA-VALIDATION-002, BUG, P1): **DONE this pass** — see §5/§7 below.
5. **[#119](https://github.com/ghilmanITM360/offline-map/issues/119)** (PERFORMANCE-BENCHMARK-DATA): search + graph-construction latency/memory at 50/100/300/500/1000/2000/5000 synthetic records. Do not optimize before measuring (EV-024, EV-027).
6. **[#120](https://github.com/ghilmanITM360/offline-map/issues/120)** (CLEANUP, P3): `LocationSheet.tsx`/`NavigationChromeV2.tsx` gate-lookup coupling + `entryPolicy.ts` duplicate haversine.
7. **NEW-4** (OWNER-DECISION, not filed — needs an owner conversation, not a code ticket): Epic 9 data/admin workflow questionnaire (30 questions) — still not walked with the owner.
8. **NEW-5..9**: Epics 5/6/7/10/11 — still out of this pass's scope by design.

---

## 5. Data architecture (Epic 8) — re-verified, evidence-status assigned per claim

**VERIFIED FACTS (REPO-VERIFIED)**
- Entity counts, re-verified programmatically at current HEAD: 18 gates, 42 blocks, 11 rastas, 3 special routes, 12 central points (EV-009).
- ID stability: Gate=`GATE_${number}`, Block=`B${number}`, Rasta=`R${number}`, CentralPoint=`P${number}` — all number-derived. Special Route is the one name-derived exception (`SHAHR_E_PINDAL_NORTH` etc.) (EV-010).
- No Block→Tent/facility sub-entity type exists in the type system today.
- **Legacy dataset / validation gap, re-proven with the full call chain this pass:**
  ```
  src/constants/data.ts:727  GRAPH_VALIDATION = validateIjtemaGraph(IJTEMA_DATA)
                                 → validation.ts:134 validateIjtemaGraph(data)
                                 → IJTEMA_DATA = constants/data.ts (LEGACY v1 dataset, ../../models/types)
  ```
  This is the **only** call site of `validateIjtemaGraph` anywhere in `src/`. The real v2 dataset (`IJTEMA_NAVIGATION_GRAPH_V2`, built by `graphBuilder.ts:465-641`) is never passed to it. `GRAPH_VALIDATION`'s only consumer is a dev-mode PASS/FAIL banner in `HomeScreen.tsx:1665` — no behavioral effect either way (EV-012, EV-013). `dataIssues.ts` is confirmed a static changelog array, not a validator (EV-014).
- **Structural-validation checklist for the actual v2 dataset — corrected this pass (EV-041), then closed (EV-042):** the prior pass overstated the gap as "no runtime check at all" for malformed/NaN/out-of-bounds coordinates, empty names, and duplicate aliases. Direct reading of `scripts/test-map-data-v2.ts` this pass found it already hand-checks coordinate finiteness/bounds and label completeness for every v2 entity type, and already catches gate connector-status contradictions — just as hardcoded per-value assertions in one script, not a reusable/structured validator, with no cross-entity duplicate-**alias** check and no unexpected-disconnection check for blocks. **DATA-VALIDATION-002 closed this remaining gap this pass** — see §7.
- **Duplication, re-verified with corrected citations:**
  - `pointInPolygon` — three independent implementations, confirmed unchanged: `graphBuilder.ts:344`, `SnapToRoadService.ts:169`, `RoutingService.ts:57` (EV-018).
  - Distance/haversine math — four implementations. Three are justified by genuinely different scale or coordinate-type needs (`SpatialGrid.ts` for the 14k-node street graph with its own documented rationale; `graphBuilder.ts` for the 289-node venue graph; `OutsideRouteValidation.ts` for a GPS-metadata-carrying coordinate type). **One, `entryPolicy.ts:59-72`, is an unjustified line-for-line copy of `graphBuilder.ts:76-88`** — same type, same formula, same variable names, with the source function already reachable from that file. This is a real, low-priority cleanup candidate (EV-019). *(Correction: the prior pass's citation of `navigationGraph.ts:59-74` as the duplicate was wrong — that file has no such function; corrected in the ledger.)*
  - Category type — two independent definitions confirmed (`data/ijtema/types.ts` per-field literals, lowercase, vs. `models/types.ts:81-92` `PlaceCommon.category`, Capitalized with a broader legacy-inclusive value set), bridged only by hand-written string literals in `V2PlaceAdapter.ts`. Real drift risk, low priority (EV-020). *(Correction: the prior pass's citation of `PublicDestinationsService.ts:17-22` was imprecise; corrected in the ledger.)*
- **UI/data coupling, re-verified with exact import lines:**
  - `LocationSheet.tsx:41,616` and `NavigationChromeV2.tsx:12,104` both import `IJTEMA_GATES` directly to resolve a gate's display name, bypassing `V2PlaceAdapter.getPlaceById` which already does this. Judged **inappropriate coupling** (EV-021).
  - `HomeScreen.tsx`'s `IJTEMA_DATA`/`MAP_BOUNDS`/`LANDMARK_PLACES` imports are all scoped to the legacy v1 map-render path (no v1 adapter exists to route through) and `IJTEMA_MAP_BOUNDS`/`IJTEMA_MAP_REGION` are viewport-bounds constants outside the adapter's Place-conversion scope. Judged **defensible, not a coupling defect** — a correction from the prior pass's flatter "3 files bypass the adapter" framing (EV-022).
- **Search implementation, FACT vs INFERENCE separated:**
  - FACT: `FuzzySearchService.ts` does length-capped (20 char) Levenshtein with a cheap substring/length pre-filter before invoking it; `SearchService.ts` does one full linear scan per query over all places (v2) or blocks+nodes+landmarks (v1), calling the fuzzy matcher per candidate and per alias. No trie/inverted-index/prefix-map exists anywhere (EV-023).
  - INFERENCE — NEEDS BENCHMARK: scale impact at 1000+ destinations is not measured (EV-024).
- **Routing-graph complexity, PROVEN vs SUSPECTED separated:**
  - PROVEN from source structure: `graphBuilder.ts`'s connector-building is O(n²)-shaped — literal nested loops with no spatial index (`addIntersectionConnectors:294-295`; block-entry loop `584-619` nests blocks × entries × candidate-search × `crossesOtherBlock`'s own all-blocks scan) (EV-025).
  - Also PROVEN: `streetGraphBuilder.ts` DOES use a `SpatialGrid` spatial index for the street graph, confirmed at current line numbers `110-118` (EV-026).
  - SUSPECTED, not provable from source: whether this actually causes a perceptible slowdown today. The venue graph is ~289 nodes, and an in-code comment explicitly argues this scale doesn't need the index (EV-027). Do not optimize before measuring.

**No structural claim in this section changed direction from the prior pass** — every one was re-verified against the current HEAD and holds, with two citation corrections (distance-duplication file, category-duplication file) and one softened claim (UI coupling — 1 of 3 files reclassified as defensible rather than a defect).

**Runtime-format tradeoffs (JSON/GeoJSON/SQLite/TS-constants) — corrected wording, no benchmark performed:**
- Do NOT state "JSON parses faster than TS literals" or "SQLite is best for 1000+ records" as fact — both downgraded to INFERENCE — NEEDS BENCHMARK this pass (see ledger "Claims explicitly downgraded").
- Expo SDK 54 `expo-sqlite` officially supports a bundled `.db` asset via `SQLiteProvider assetSource`, FTS3/4/5 via `enableFTS`, and row-by-row iteration — OFFICIAL-DOC-VERIFIED, but **PROJECT-VERSION-CHECK-PENDING**: this project's installed Expo SDK version was not re-confirmed this pass, so applicability to this specific build is not yet established (EV-034).
- OSM Foundation tile policy: public `tile.openstreetmap.org` infrastructure must not be used for bulk/offline prefetch — but this does not mean "OSM cannot be used offline," only that a self-hosted or explicitly offline-permitting source is required. OFFICIAL-DOC-VERIFIED (EV-033).

---

## 6. Project version matrix (re-verified from repo files, not from any prior handoff)

| Dependency | Installed version | Applicable official docs | Notes |
|---|---|---|---|
| Expo | 54.0.34 | v54.0.0 SDK docs | — |
| React Native | 0.81.5 | Turbo Native Modules / Codegen docs | Feasibility-only citation; Epic 14 architecture decision deferred |
| expo-sqlite | ~16.0.10 | v54.0.0 SDK docs | **PROJECT-VERSION-VERIFIED** this pass (upgraded from PROJECT-VERSION-CHECK-PENDING): installed package's own `hooks.d.ts` confirms `SQLiteProviderAssetSource`/`assetSource` ships in this exact version (EV-044) |
| react-native-maps | 1.20.1 | — | — |
| @gorhom/bottom-sheet | ^5.0.0 | — | — |
| Hermes | enabled | — | `android/gradle.properties:42` |
| New Architecture | enabled | — | `android/gradle.properties:38` |
| Android compileSdk/targetSdk/minSdk | 36 / 36 / 24 | Android startup-perf docs (TTID vs TTFD) | Expo-SDK-54 defaults, not overridden in `android/build.gradle` |

Full table with sources: `docs/audit/EVIDENCE_LEDGER.md` (EV-044).

---

## 7. DATA-VALIDATION-002 — DONE this pass

**Branch**: `fix/v2-data-structural-validation` (from canonical HEAD `1599c32`, not `main` — see §1a). **Commit**: `9c6d8ae`.

**What was built**: `validateV2Dataset()` (`src/data/ijtema/v2Validation.ts`) — a dependency-injectable structural validator for the real v2 dataset, returning a structured `ValidationReport` (errors/warnings/info + summary counts) instead of throwing or console-only output. Covers: duplicate IDs (within and across entity types), duplicate aliases across entities, malformed/NaN/Infinity/zero/out-of-bounds coordinates, empty names, orphan rasta segment/junction point references, and unexpected disconnection (zero graph adjacency) for gates and blocks. Distinguishes acknowledged field-data blockers (`connectorStatus: 'ground_truth_required'` → WARNING) from unexpected breaks (→ ERROR) — no fabricated connectors, no repaired field data (EV-042).

**Design choice**: built as a complement to, not a replacement of, `scripts/test-map-data-v2.ts`'s existing hand-pinned assertions (exact known-good coordinates/counts) — those stay as regression pins; consolidating them to call the new shared validator is a natural follow-up, not done in this ticket to avoid touching a working test unnecessarily.

**Tests**: `scripts/test-v2-structural-validation.ts` — 13 synthetic-fixture RED/GREEN cases (duplicate ID within/across entity types, duplicate alias, malformed/NaN/out-of-bounds coordinate, empty name, orphan segment/junction reference, unexpected disconnection, Gate-18/19-style field-blocker exception both correctly-warned and correctly-still-contradiction-checked) plus a real-dataset run.

**V2 DATA VALIDATION REPORT (real production dataset, this pass)**:
- Entities: 18 gates, 42 blocks, 11 rastas (83 points), 3 special routes (20 points), 12 central points
- Errors: **0**
- Warnings: **2** — `GATE_18`, `GATE_19` (both `FIELD_DATA_BLOCKED_GATE`, expected, not a bug)
- No other warning code present; no other field-blocked gate present

**Regression check**: `npm run typecheck` clean, `npm run lint` clean, `npm test` (123 scripts, 219 "passed" lines) exit 0, `npm run test:components` — 55 suites / 597 tests, all passing (EV-043). No runtime/UI behavior changed, so device/emulator verification is not required for this ticket's completion criteria.

**Completion criteria met**: actual v2 dataset validated ✅ · structured output ✅ · tests for invalid-data conditions ✅ · real dataset run through validation ✅ · Gate 18/19 handled explicitly (warning, not error) ✅ · no field data fabricated ✅ · typecheck passes ✅ · focused tests pass ✅ · broader regression passes ✅ · evidence ledger updated ✅ · GitHub ticket (#118) to be updated with this evidence ✅.

**Not done in this ticket** (explicitly out of scope per the brief): no storage-format migration (JSON/SQLite/etc.), no consolidation of `test-map-data-v2.ts` into the new validator, no fix to the underlying NEW-06/Mimbar/other findings.

---

## 8. Runtime verification required (not yet done, needs a device/emulator)

- Gate 18/19's Directory row disabled-treatment (#96): now confirmed at the **component-test** level (`DestinationRow.test.tsx`, EV-047) — still not confirmed on a physical device/emulator with real TalkBack.
- Whether search/graph-construction slowness is perceptible at any tested record count (needs #119, the benchmark ticket).
- Epics 10 (UI/UX), 11 (performance/battery/thermal), and the physical-device acceptance items already tracked in Issue #46 — all still open, all require real hardware, none re-audited this pass.

## Owner decisions still pending

- Issues #49, #48, #47 (Google Maps restrictions, production signing, legal links) — unchanged, still OWNER-REQUIRED, not re-litigated this pass.
- Epic 9's 30-question data/admin workflow questionnaire — still not walked with the owner.

## Field-data blockers (unchanged, re-confirmed)

- Gate 18 (#43), Gate 19 (#44) — ground-truth connector survey required.
- Mimbar (Epic 4, new ticket NEW-2) — full coordinate + connector survey required, now backed by a full-history pickaxe search proving zero prior data ever existed for it.

---

## Open / not yet re-audited this pass (scope discipline, not an oversight)

Epics 3 (location-state matrix), 5 (Directory-first flow), 6 (route alternatives), 7 (offline-first), 10 (UI/UX), 11 (performance), 12 (cleanup), 13 (APK acceptance), 14 (SDK) were **not** re-touched this pass — this pass's explicit scope was hardening evidence for claims already made about Epics 1/2/4/8 and the ticket system, not opening new investigative branches. Per the brief's own instruction, no broad implementation should start until these are reconciled.
