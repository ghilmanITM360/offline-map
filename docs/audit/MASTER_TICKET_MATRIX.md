# Master Ticket Matrix

Purpose: a single table proving every known piece of project work is trackable —
mapped to an issue, a sub-issue, an explicit parent checklist, DONE evidence, a
field-data blocker, an owner decision, or explicitly deferred/future scope.
Built 2026-09-24 during a full ticket-reconciliation pass. Companion to
[`CURRENT_PROJECT_STATE.md`](../../CURRENT_PROJECT_STATE.md) and
[`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md).

**Coverage states used**: COVERED-BY-EXISTING-ISSUE · COVERED-BY-NEW-ISSUE ·
COVERED-BY-PARENT-CHECKLIST · ALREADY-DONE-WITH-EVIDENCE ·
FIELD-DATA-REQUIRED · OWNER-DECISION-REQUIRED · DEFERRED-FUTURE · NOT-COVERED

**Sub-issue structure this pass added** (native GitHub sub-issues, confirmed
available on this repo/plan — not previously used; #63 remains the top-level
rollup):

```
#63 (rollup)
├── #122 [EPIC] Offline-First          ├── #123, #124, #125
├── #126 [EPIC] UI/UX Forensic Audit   ├── #127, #128
├── #129 [EPIC] Performance Profiling  ├── #119, #130, #131, #132
├── #133 [EPIC][Owner] Admin Data Workflow (NEW-4)
├── #134 [EPIC][Future] Future SDK / Library Architecture
├── #135 [EPIC] Final Android APK Acceptance (current milestone)
├── #43, #44, #46, #47, #48, #49, #93, #95
├── #115, #116, #117, #118, #120
└── #136, #137
```

---

## Epic A — Repository / Release Convergence

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | Canonical branch verification | #63 | — | ALREADY-DONE-WITH-EVIDENCE | — | AUDIT | — | EV-001, EV-002 | Re-verified this pass |
| A-2 | `main`/canonical branch divergence audit | #115 | #63 | COVERED-BY-EXISTING-ISSUE | P1 | AUDIT | — | EV-004, EV-040 | 39 files, 1103/-559 lines diverged in `src/data/ijtema` area alone |
| A-3 | `main`-only unique work reconciliation (NEW-02/03/06) | #115 | #63 | COVERED-BY-EXISTING-ISSUE | P1 | engineering | — | EV-028, EV-029, EV-030 | NEW-06 genuinely unresolved; NEW-02/03 need diff-level confirmation |
| A-4 | PR reconciliation / stale PR cleanup | #50 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | cleanup | — | — | — |
| A-5 | Worktree/stash cleanup | #51 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | cleanup | — | — | Two read-only audit worktrees (`audit2`, `integration-audit`) remain from prior passes — harmless, undecided, not touched |
| A-6 | One authoritative branch (retire `main`) | #115 | #63 | COVERED-BY-EXISTING-ISSUE | — | — | NEW-06 resolution (#115) | — | Explicit: do not retire `main` until #115 resolves NEW-06 |
| A-7 | PR #121 (DATA-VALIDATION-002) merge | #118 | — | COVERED-BY-EXISTING-ISSUE | P1 | bug | Owner merge action | PR #121 CI green, mergeable | Blocked by this session's own merge-safety guard, not a repo check |

## Epic B — Navigation / Routing

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-1 | Gate 03 status | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-005, EV-038 | Routable, confirmed fixed vs. `main` |
| B-2 | Gate 17 topology (R7/R8) | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-005, EV-039 | Segment/junction model confirmed |
| B-3 | Gate 18 field blocker | #43 | #63 | FIELD-DATA-REQUIRED | P2 | gis | Physical survey | EV-006 | Milestone: Field Test Candidate |
| B-4 | Gate 19 field blocker | #44 | #63 | FIELD-DATA-REQUIRED | P2 | gis | Physical survey | EV-007 | Milestone: Field Test Candidate |
| B-5 | Gate count semantics | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-008 | 18 total / 16 routable / 2 field-blocked |
| B-6 | NEW-06 connector-cost ambiguity | #115 | #63 | COVERED-BY-EXISTING-ISSUE | P1 | engineering | — | EV-030 | Hardcoded `connectorCostM: 0`, needs runtime proof |
| B-7 | No early/false arrival | #95 | #63 | COVERED-BY-EXISTING-ISSUE | P2 | bug | #46 field data | — | Doc/behavior mismatch confirmed; scenario likely, not field-reproduced |
| B-8 | Reroute / off-route accumulation | #60 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| B-9 | Second trip after Done (no state bleed) | #111/#112, #113/#114 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | Arrival latch + reroute cooldown both fixed |
| B-10 | Route preview | #29 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| B-11 | Direct Start flow | #37, #39, #40 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | Directory-as-launch, duplicate search removed |
| B-12 | Alternate-route research | — | — | DEFERRED-FUTURE | — | — | — | — | Not requested this pass; no evidence of current need |
| B-13 | Nearest-node snapping continuity/hysteresis | #93 | #63 | COVERED-BY-EXISTING-ISSUE | P1 | bug | #46 field data (corridor spacing) | Root cause confirmed (1.0m-apart node pair) | Hysteresis margin deferred pending field data |
| B-14 | Outside-routing "Direct guide" fallback despite valid OSM route | #124 | #122 | COVERED-BY-NEW-ISSUE | P1 | bug | — | Reproduced 7/7, root cause narrowed | Surfaced from #45's comment thread, not previously tracked |

## Epic C — Location

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | LOC-01 services off | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | Emulator-verified PASS | Found+fixed real bug (#92) |
| C-2 | LOC-02 permission denied (can re-ask) | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | Emulator-verified PASS | — |
| C-3 | LOC-03 permanently denied | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | Emulator-verified PASS | — |
| C-4 | LOC-04 services on, no fix yet | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | Emulator-verified PASS | — |
| C-5 | LOC-05 stale fix | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | Emulator-verified PASS | — |
| C-6 | LOC-06 fresh precise fix | #46 | #63 | FIELD-DATA-REQUIRED | P1 | field | Physical device | Emulator-blocked (AVD mock-GPS tooling limit) | Logic unit-proven; runtime needs real device |
| C-7 | LOC-07 coarse-only permission | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE (partial) | — | — | — | Precondition confirmed, logic unit-proven | Live message not directly observed |
| C-8 | LOC-08 weak fix | #46 | #63 | FIELD-DATA-REQUIRED | P1 | field | Physical device | Same emulator-tooling limit | — |
| C-9 | LOC-09 GPS lost mid-session | #46 | #63 | FIELD-DATA-REQUIRED | P1 | field | Physical device | Emulator test-injection harness PASS (non-native-GPS tier) | — |
| C-10 | LOC-10 GPS recovery | #46 | #63 | FIELD-DATA-REQUIRED | P1 | field | Physical device | Not captured (screenshot timing), not a code failure | — |
| C-11 | LOC-11 background/resume | #46 | #63 | FIELD-DATA-REQUIRED | P1 | field | Physical device | Same emulator-tooling limit | Includes "multiple resume generations" refinement |
| C-12 | LOC-12 manual starting point | #45 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | Emulator-verified PASS | — |
| C-13 | Duplicate GPS observation handling | #46 | #63 | COVERED-BY-PARENT-CHECKLIST | — | — | — | — | Undocumented as a named scenario anywhere; folds into #46's session-level physical testing |
| C-14 | Remembered/manual preview origin | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `docs/PRODUCT_AND_USER_FLOWS.md:20` | One unified outside-coordinate pipeline regardless of source |
| C-15 | Start Navigation eligibility gating | #109 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| C-16 | Location UI/messages | #33, #34 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| C-17 | Reconciliation: #45 closed vs. stale doc framing | #45 | #63 | ALREADY-DONE-WITH-EVIDENCE | — | AUDIT | — | Comment posted this pass on #45 | Deliberate emulator/physical evidence-tier split, not a regression |

## Epic D — Mimbar / Origin

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | Mimbar field survey | #116 | #63 | FIELD-DATA-REQUIRED | — | field, gis | — | EV-011 (zero hits, full-history pickaxe) | No coordinate may be fabricated |
| D-2 | Mimbar entity/data model | #116 | #63 | FIELD-DATA-REQUIRED | — | — | D-1 | — | Same model as Gate 18/19 (stable ID, coords, connector, provenance, verification status) |
| D-3 | Mimbar implementation (routing when no manual origin) | not yet filed | #116 | FIELD-DATA-REQUIRED | — | — | D-1 | — | Deliberately not filed as an empty placeholder; recorded as prose dependency on #116 |
| D-4 | Never label Mimbar as detected Current Location | D-3 (future) | #116 | COVERED-BY-PARENT-CHECKLIST | — | — | D-1 | — | Design constraint to carry into D-3 when filed |
| D-5 | Change Starting Point / manual origin | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `docs/PRODUCT_AND_USER_FLOWS.md:22` | Manual gate selection persists across reroute |
| D-6 | Mimbar-route acceptance test | #135 | #135 | COVERED-BY-PARENT-CHECKLIST | — | — | D-3 | — | Conditional item in Final APK Acceptance checklist — included only if D-3 lands before freeze |

## Epic E — Directory / Primary UX Flow

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | Splash → setup → Directory | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `docs/PRODUCT_AND_USER_FLOWS.md:3-9` | — |
| E-2 | Normal launch → Directory | #37 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-3 | Destination search | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `docs/ARCHITECTURE.md:20` | — |
| E-4 | Category browse | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-5 | Automatic origin resolution | #89, #90, #91 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-6 | Directions | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-7 | Start | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-8 | Route Preview | #29 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-9 | Navigation | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-10 | Arrival | #95 | #63 | COVERED-BY-EXISTING-ISSUE | P2 | bug | #46 | — | Doc/behavior reconciliation, see B-7 |
| E-11 | Done → Directory | #40, #111/#112 (merged/closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-12 | Duplicate Home search removed | #39 (merged) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| E-13 | Unavailable-destination treatment | #96 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-047 | Muted/disabled tap-affordance, component-test-verified |

## Epic F — Offline First

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | Offline contract definition | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `AGENTS.md:7` | Internal routing fully offline; outside routing degrades, never dead-ends |
| F-2 | Required venue data availability | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | Bundled at build time |
| F-3 | Bundled-vs-first-run package decision | #133 | #63 | OWNER-DECISION-REQUIRED | — | owner-action | — | `docs/DATA_GIS_AND_FIELD_REQUIREMENTS.md:5` | Folded into Admin Data Workflow questionnaire |
| F-4 | Mandatory offline readiness | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| F-5 | Routing/search/reroute/arrival offline | #46 | #63 | COVERED-BY-EXISTING-ISSUE | P1 | field | — | — | Physical field walk covers full offline journey |
| F-6 | Mimbar/manual origin offline | D-3 | #116 | FIELD-DATA-REQUIRED | — | — | D-1 | — | — |
| F-7 | Airplane-mode full journey | #46 | #63 | COVERED-BY-EXISTING-ISSUE | P1 | field | — | — | Network-loss scenario in #46's scope |
| F-8 | Fresh install → prepare → internet off → navigate | #135 | #135 | COVERED-BY-PARENT-CHECKLIST | — | — | #46 | — | Final APK Acceptance checklist item |
| F-9 | Package/storage size | #132 | #129 | COVERED-BY-NEW-ISSUE | P3 | performance | — | — | — |
| F-10 | Offline map licensing/source policy | #125 | #122 | COVERED-BY-NEW-ISSUE | P3 | gis | — | Zero prior doc coverage (confirmed by full 9-doc read) | OSMF policy: bulk/offline prefetch from public tiles prohibited; self-hosted/offline-permitting source is fine |
| F-11 | Google walking-routes proxy currently not deployed | #123 | #122 | COVERED-BY-NEW-ISSUE | P2 | engineering | Backend platform approval (external) | `docs/RELEASE_SECURITY_PRIVACY.md:37` | Currently degrades production route quality — not purely future |

## Epic G — Data / GIS

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| G-1 | Source-of-truth audit | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-009 through EV-014 | — |
| G-2 | Canonical Place/data schema | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| G-3 | Stable IDs | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-010 | — |
| G-4 | Blocks / Gates / Rastas / SpecialRoutes / Facilities data model | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-009 | No Tent/Facility sub-entity type exists yet — not needed until real data requires it |
| G-5 | Tent future model | — | — | DEFERRED-FUTURE | — | — | — | — | No requirement to build ahead of real data |
| G-6 | Mimbar | #116 | #63 | FIELD-DATA-REQUIRED | — | — | — | — | See Epic D |
| G-7 | Parent/child relationships, coordinates, entry points, graph connectors | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| G-8 | Searchable/public flags | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| G-9 | Aliases | #118 | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-042 | Cross-entity duplicate-alias check added |
| G-10 | Urdu/English/localization | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `scripts/test-map-data-v2.ts` `assertLabel` | — |
| G-11 | Survey provenance / verification status | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `connectorStatus`/`routingStatus` model | Gate 18/19 use this model already |
| G-12 | Schema/data versioning | #117 | #63 | COVERED-BY-EXISTING-ISSUE | P2 | cleanup | #118 (done) | — | — |
| G-13 | 1000+ destination scalability | #119 | #129 | COVERED-BY-EXISTING-ISSUE | P2 | performance | — | EV-024, EV-025, EV-027 | Measurement only, no optimization yet |
| G-14 | Import architecture | #133 | #63 | OWNER-DECISION-REQUIRED | — | owner-action | — | — | Folded into Admin Data Workflow |
| G-15 | Excel/CSV authoring option | #133 | #63 | OWNER-DECISION-REQUIRED | — | owner-action | — | — | Folded into Admin Data Workflow |
| G-16 | Deterministic importer | #133 | #63 | OWNER-DECISION-REQUIRED | — | owner-action | G-14/G-15 decision | — | Not yet scoped — depends on owner decision |
| G-17 | Human-readable validation report | #118 | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | EV-042, EV-043 | `validateV2Dataset()` structured report |
| G-18 | Dataset replacement without core-code edits | #117 | #63 | COVERED-BY-EXISTING-ISSUE | P2 | cleanup | — | EV-042 (validator is dependency-injectable) | — |
| G-19 | Duplication cleanup (pointInPolygon×3, haversine×4, category-type drift, UI/data coupling) | #120 | #63 | COVERED-BY-EXISTING-ISSUE | P3 | cleanup | — | EV-018 through EV-022 | Low priority, deferred until after functional/runtime confidence per Epic K discipline |

## Epic H — Admin Data Workflow

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| H-1 | Who maintains data / source format / workbook structure / versioning / verification responsibility / draft-surveyed-verified-deprecated states / multiple entrances/connectors / tent numbering / aliases-localization workflow / import preview-diff / reject-all-vs-partial / GIS topology editing / visual admin editor | #133 | #63 | OWNER-DECISION-REQUIRED | — | owner-action | — | `docs/DATA_GIS_AND_FIELD_REQUIREMENTS.md:5,23-25` | Zero doc coverage confirmed; entire epic was previously "NEW-4," referenced but never filed until this pass |

## Epic I — UI/UX Forensic Audit

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| I-1 | Gate-label zoom-visibility deliberate review | #127 | #126 | COVERED-BY-NEW-ISSUE | P3 | — | — | `docs/ARCHITECTURE.md:38-40` | Side effect of redesign, never separately reviewed |
| I-2 | Gate-label clipping | — | — | ALREADY-DONE-WITH-EVIDENCE | — | — | — | `docs/ARCHITECTURE.md:22` | Resolved via `MapLabelOverlay` |
| I-3 | Loading/error/empty/disabled states, touch targets, readability, low-literacy/elderly, accessibility, back/recovery behavior | #128 | #126 | COVERED-BY-NEW-ISSUE | P2 | — | — | Zero prior doc coverage confirmed | One consolidated checklist issue, not per-screen, per anti-spam guidance |
| I-4 | Map control semantics/font-scale/reduced-motion | #65, #100, #102 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | Baseline #128 builds on |

## Epic J — Performance / Resource

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| J-1 | Search + graph-construction latency/memory benchmark | #119 | #129 | COVERED-BY-EXISTING-ISSUE | P2 | performance | — | EV-023 through EV-027 | Sizes 50-5000 |
| J-2 | Cold/warm/hot startup, TTID/TTFD | #130 | #129 | COVERED-BY-NEW-ISSUE | P2 | performance | — | EV-036 (official-doc) | Zero prior measurement |
| J-3 | Memory (idle/nav/repeated-trip), CPU, rendering/jank, long session, background/resume, crash/ANR | #131 | #129 | COVERED-BY-NEW-ISSUE | P2 | performance | — | Monkey-stress ad hoc evidence in #45's thread | Battery/thermal explicitly marked physical-device-only within this issue |
| J-4 | APK/installed/offline-dataset size | #132 | #129 | COVERED-BY-NEW-ISSUE | P3 | performance | — | — | Cross-referenced with F-9 |
| J-5 | #55 emulator-tier reliability items (search latency, route gen, map rendering, GPS loss/recovery, network loss) | #55 (closed, source-level) | #63 | COVERED-BY-EXISTING-ISSUE | — | — | — | `docs/PROJECT_STATUS.md:75-81` | Source-level pass clean; emulator-tier pass still needed per doc — folds into #131/#46 |

## Epic K — Cleanup

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| K-1 | Git/PR/worktree/stash cleanup | #50, #51 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | 2 read-only audit worktrees remain, harmless |
| K-2 | Asset inventory / unused images | #52 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | — |
| K-3 | MD consolidation / redundant docs | #53 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | 54→11 docs | — |
| K-4 | Dead code (`pointInPolygon`×3, `entryPolicy.ts` haversine dup, `SnapToRoadService.snapToRoad()`) | #120 | #63 | COVERED-BY-EXISTING-ISSUE | P3 | cleanup | — | EV-018, EV-019 | `snapToRoad()` finding added this pass via comment |
| K-5 | Unreachable screens (`NavigationScreen.tsx` v1-only reachability) | #120 | #63 | COVERED-BY-PARENT-CHECKLIST | — | — | — | `docs/ARCHITECTURE.md:18` | Added this pass via comment; do not remove without confirming v1 rollback path independence |
| K-6 | V1 rollback-only disposition | #117 | #63 | COVERED-BY-EXISTING-ISSUE | P2 | cleanup | #118 (done) | `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md:10` | V1 is a deliberate, permanent rollback path — not wholesale deprecated |
| K-7 | Unused dependencies / debug logs / TODO-FIXME-HACK review | #120 | #63 | COVERED-BY-PARENT-CHECKLIST | — | — | — | — | No new findings this pass beyond what's already listed |
| K-8 | Duplicate helpers / UI-data coupling | #120 | #63 | COVERED-BY-EXISTING-ISSUE | P3 | cleanup | — | EV-020, EV-021, EV-022 | — |
| K-9 | Recurring dependency-security re-review | #62 (closed) | #63 | DEFERRED-FUTURE | P3 | security | — | `docs/RELEASE_SECURITY_PRIVACY.md:41` | Trigger: 2026-12-31 or sooner if an Expo SDK migration is scheduled; tracked via #63 comment, not a new ticket yet |

## Epic L — Final Android APK Acceptance

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| L-1 | Clean build/checksum/fresh install/first run/offline setup/Directory/search/live GPS/manual origin/Mimbar origin/Directions/Start/nav/reroute/GPS loss-recovery/airplane mode/arrival/Done/second journey/restart/background-resume/long session/perf evidence/final acceptance report | #135 | #63 | COVERED-BY-NEW-ISSUE | P1 | release | #46, #93, #95, #124, #126, #129 | — | Distinct from historical, already-closed #57 |
| L-2 | Historical field-test APK + evidence pack | #57 (closed) | #63 | ALREADY-DONE-WITH-EVIDENCE | — | — | — | — | Earlier cycle — not reused as this milestone's evidence |

## Epic M — Future Deployment

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| M-1 | Production signing / Play App Signing | #48 | #63 | OWNER-DECISION-REQUIRED | P1 | owner-action | — | EV-045 | Reclassified: Future Deployment, not current-APK blocker |
| M-2 | Play Store / App Store publishing | — | — | DEFERRED-FUTURE | — | — | — | — | Not started, correctly out of scope |
| M-3 | Legal/store URLs | #47 | #63 | OWNER-DECISION-REQUIRED | P2 | owner-action | — | EV-045 | Reclassified: Future Deployment |
| M-4 | Production Cloud/API restriction hardening | #49 | #63 | OWNER-DECISION-REQUIRED | P1 | owner-action | — | EV-045 | Reclassified: Future Deployment; also has a live-risk component (historical exposed key, since removed) — see M-5 |
| M-5 | Historical exposed Maps API key — rotation/verification | #49 | #63 | OWNER-DECISION-REQUIRED | P1 | owner-action | — | Comment on #49 (commit `a7833f7` removed it; `0cf2c75` had it) | Currently-unverifiable from repo alone whether key was ever regenerated — real risk, not purely future |
| M-6 | iOS Maps API key placeholder / no config-plugin path | #137 | #63 | COVERED-BY-NEW-ISSUE | — | owner-action | — | `docs/RELEASE_SECURITY_PRIVACY.md:13-15` | Out of current Android-only milestone; hard blocker whenever iOS resumes |

## Epic N — Future SDK / Library

| ID | Requirement | Issue | Parent | Status | Priority | Type | Blocked by | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| N-1 | Full UI SDK vs. headless engine / ownership boundaries / host callbacks / theming / localization / dataset injection / offline-package ownership / RN-native-Android-iOS-other hosts / versioning | #134 | #63 | COVERED-BY-NEW-ISSUE | — | future-sdk | Current milestone completion | Zero prior doc coverage confirmed | Explicitly LAST PHASE — do not implement |

## Not-yet-actioned, deliberately not new issues (Phase 13 justification)

| Item | Why not a new issue |
|---|---|
| Duplicate GPS observation, multiple background-resume generations (Epic C) | Refinements of #46's existing physical-session scenarios, not independently schedulable work |
| Mimbar implementation, Mimbar-route acceptance test (Epic D) | Cannot be scoped before #116's field survey lands — filing now would be an empty placeholder; recorded as prose dependency on #116 |
| Data import implementation, 1000+ storage architecture decision (Epic G/H) | Cannot be scoped before #133's owner decision lands |
| `SnapToRoadService.snapToRoad()` dead method, `NavigationScreen.tsx` reachability audit (Epic K) | Too small to justify independent work; folded into #120 |
| Recurring dependency-security review (Epic K) | Date-gated future reminder, not active work; tracked via #63 comment |
| Alternate-route research (Epic B) | No evidence of current need; not requested this pass |
| Tent future model (Epic G) | No real data requires it yet |

**NOT-COVERED total: 0.** Every requirement above resolves to an existing issue, a new issue, a parent checklist item, done-with-evidence status, a field-data blocker, an owner decision, or an explicitly-justified deferral.
