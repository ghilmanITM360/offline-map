# CURRENT HANDOFF — KARACHI IJTEMA

Updated: 2026-09-10T14:48:02+05:00

## Repository

Path: `/Users/ghilmanislam360/GhilmanProjects/offline-map-core-fix`
Remote: `https://github.com/ghilmanITM360/offline-map.git` (`ghilmanITM360/offline-map`)
Worktree: `offline-map-core-fix` at the path above.
Branch: `fix/core-functionality-finalization`
HEAD: the workflow integration commit containing this snapshot; resolve with `git rev-parse HEAD` and verify the branch before work.
Application/source HEAD: `8af7bc35d5e2a5636cb336d6cd44b0dddf43926b` (verified integration seed; this task changes only documentation).
Upstream: `origin/fix/core-functionality-finalization`.
Dirty: this snapshot is intended to be committed with only the two workflow files; recheck `git status --short --branch`.
PR: [#26](https://github.com/ghilmanITM360/offline-map/pull/26), OPEN/DRAFT, targeting `integration/ux-simplification-final`.

## Current Objective

Phase 0. Immediate task: Phase 0D-A — Map camera layout-readiness race. Workflow integration only in this session; camera investigation, regression tests, implementation, and runtime rechecks remain next.

## Completed

- Read the original workflow files from disk and integrated the permanent rules into the active core-fix worktree.
- Refreshed this handoff against current Git/PR metadata and the owner's supplied runtime evidence.
- Changed files: `CLAUDE.md`, `docs/CURRENT_HANDOFF.md` only. No application source changes.

## Current Evidence

### Tests

Latest trustworthy: PR #26 reports passing checks at the application/source HEAD above; not rerun during this documentation task.
HEAD tested: PR-author report for `8af7bc35d5e2a5636cb336d6cd44b0dddf43926b`; fresh verification NOT VERIFIED.
Typecheck: PR-author report PASS.
Lint: PR-author report PASS.
Components: PR-author report 55 suites / 610 tests PASS.
Routing: PR-author report all-gates, outside-street gate-cost, core-provider contract, and reroute PASS.
Other: PR-author report `npm test` PASS. `git diff --check` and `git diff --cached --check` PASS; reviewed both new-file diffs and confirmed documentation-only scope. Application tests were not run here.

### Runtime

Device: prior owner-reported Android runtime; exact device identity NOT VERIFIED here.
APK: prior runtime build provenance/checksum not supplied; no APK built in this task.
Evidence: RUNTIME VERIFIED per owner report, not reproduced in this session: Locations → Block 28 → Preview → Back passed functionally 5/5; four additional cold launches; SoftException reproduced effectively 100%; no fatal crash; Fabric appears in the native camera-command dispatch path.
Observed error: "Map size can't be 0. Most likely, layout has not yet occurred for the map view."
What is NOT runtime verified: exact camera caller/owner and measured dimensions when the failing command was sent; fixed-camera behavior, release-like cold-offline journey, and mid-navigation network loss.

## Open Defects / Blockers

P0: no new severity classification established by this documentation task.
P1: active Phase 0D-A camera defect (severity not independently classified): `animateToRegion` reaches native `newLatLngBounds` with a map-size SoftException. Reported timing is after `onMapReady` but before non-zero layout; exact caller, dimensions, and root-cause ownership still require proof.
P2: no other current defect classification established here.
FIELD-BLOCKED: PR #26 reports gates 03/17/18/19 fail closed pending field evidence; field status not independently checked.
ENVIRONMENT: no runtime tools exercised here; the PR's earlier emulator limitation is historical, not evidence of a current blocker.
OWNER/EXTERNAL: ROTATION UNKNOWN — OWNER ACTION REQUIRED for historically exposed Maps credentials, as reported in PR #26. Cloud restrictions/deployment not checked.

## Important Contracts

Use `CLAUDE.md` and `AGENTS.md` for permanent project rules. Phase 0D-A must retain `useCameraManager.ts` as sole camera owner: native map ready AND measured width/height > 0 before size-dependent camera commands; preserve the latest pending intent and execute it once. Prove timing first; if dimensions are already non-zero at failure, stop and reject the hypothesis.

## Remaining

1. Complete Phase 0D-A only: readiness regression, minimal fix, focused tests, and original runtime reproduction checks.
2. After a verified camera fix, return to Phase 0E-B: release-like Case 5 true cold-offline journey, then Case 4 mid-navigation network loss. Do not start either during Phase 0D-A.

## Exact Next Action

Phase 0D-A: prove map-ready versus layout-ready timing, add a RED regression test, apply the minimal camera-readiness fix, and runtime reverify the original reproduction.

## Git / PR

Commit status: this file and `CLAUDE.md` form one authorized workflow integration commit; resolve its hash from Git rather than embedding a self-referential hash.
Push status: verify `HEAD` equals `origin/fix/core-functionality-finalization` after the authorized push; this snapshot cannot certify a later network operation.
PR status: #26 is OPEN/DRAFT; a concise workflow note is authorized after push. Recheck live metadata for completion.
Merge status: no merge performed or authorized.

## Verdict

Workflow files integrated for short-prompt use. Phase 0D-A remains open; camera root cause and fix are NOT VERIFIED. Commit/push completion must be confirmed from Git and the final integration report.
