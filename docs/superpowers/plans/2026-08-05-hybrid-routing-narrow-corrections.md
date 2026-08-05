# Hybrid Routing Narrow Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply owner-approved hybrid-routing corrections without broad cleanup or integration-branch changes.

**Architecture:** `DirectionsViewModel` classifies v2 starts by resolved coordinate and sends every outside coordinate through `V2DirectionsService.calculateHybridPreview`; inside manual places keep synchronous internal routing. Existing provider/core boundary remains `prepareOutsideRoutingPlan` → ordered provider source → `finalizeOutsideRoutingPlan`. OSM stays synchronous with abort checks around each gate, direct-guide validation fails safely, and geometry validation keeps 100m/2m tolerances.

**Tech Stack:** React Native 0.81, React 19, TypeScript 5.9, Jest 29/RNTL 14, standalone `tsx` test scripts.

## Global Constraints

- Work only on `agent/codex-hybrid-corrections` in `/Users/ghilmankhan/workprojects/offline-map-codex-hybrid-corrections`.
- Do not push, merge, rebase, reset, squash, amend old commits, delete branches, or clean unrelated files.
- Preserve MVVM boundaries, manual gate override, map-first UI, inside-only routing, route retention, cancellation, and stale-request protection.
- Keep endpoint tolerances at 100m absolute and 2m competing-gate margin.
- Use focused commits and explicit path staging.

---

### Task 1: Coordinate-Based Outside Dispatch

**Files:**
- Modify: `src/viewmodels/DirectionsViewModel.ts`
- Test: `src/__tests__/DirectionsViewModelHybrid.test.tsx`

**Interfaces:**
- Consumes: resolved `originCoord`, `EntryGateRoutingService.isInsideIjtemaArea`, existing `V2DirectionsService.calculateHybridPreview`.
- Produces: one `forceOutside` decision based only on v2 origin coordinate; outside manual places pass coordinate as `currentLocation` and do not pass semantic `startPlace`.

- [ ] Add failing tests for GPS, manual, and remembered outside starts; manual inside routing; source-policy parity; Google→OSM and OSM→direct fallback for manual outside.
- [ ] Run focused Jest test and confirm manual outside case fails because hybrid preview is not called.
- [ ] Replace `startSource !== 'manual_place'` routing condition with coordinate-based outside classification and construct preview request from routing mode.
- [ ] Re-run focused Jest test, ViewModel hybrid tests, and rerouting tests.
- [ ] Verify diff, stage explicit paths, and commit `fix(routing): unify outside start policy`.

### Task 2: Honest Synchronous OSM Cancellation

**Files:**
- Modify: `src/services/outsideRouting/OfflineOsmWalkingRouteProvider.ts`
- Modify: `src/services/outsideRouting/ProductionOutsideRouteSource.ts`
- Test: `src/__tests__/HybridOutsideRouteProviders.test.ts`

**Interfaces:**
- Consumes: synchronous or promise-returning `OfflineOsmGateRouteResolver` and request `AbortSignal`.
- Produces: direct resolver await with cancellation checks before and after each gate; no OSM timer configuration or `timed-out` result.

- [ ] Replace fake-timer test with failing pre-gate and between-gate cancellation tests; retain successful synchronous route assertion.
- [ ] Run focused provider test and confirm timeout API/cancellation behavior mismatch.
- [ ] Remove OSM timeout constants, option, state, `Promise.race`, and production `osmTimeoutMs` plumbing.
- [ ] Re-run focused provider tests and typecheck.
- [ ] Verify diff, stage explicit paths, and commit `fix(routing): remove ineffective OSM timeout`.

### Task 3: Direct-Guide Validation Containment

**Files:**
- Modify: `src/services/outsideRouting/DirectDirectionGuideProvider.ts`
- Test: `src/__tests__/HybridOutsideRouteProviders.test.ts`

**Interfaces:**
- Consumes: `assertCompleteCandidateSet`.
- Produces: `{ status: 'failure', failure: { provider: 'direct-guide', code: 'unknown', retryable: false } }` when self-generated candidates fail validation.

- [ ] Add failing test forcing candidate-set validation to throw and asserting resolved safe failure with matching provider identity.
- [ ] Run focused test and confirm rejected promise.
- [ ] Wrap final validation in safe failure handling while retaining abort/request identity behavior.
- [ ] Re-run focused test and valid direct fallback test.
- [ ] Verify diff, stage explicit paths, and commit `fix(routing): contain direct-guide validation`.

### Task 4: Real Gate 12/13 Identity Coverage

**Files:**
- Modify: `src/__tests__/outsideRoutingContract.test.ts`
- Modify: `docs/HYBRID_PROVIDER_CORE_INTEGRATION.md`
- Modify: `docs/GOOGLE_ROUTES_PROXY_CONTRACT.md`

**Interfaces:**
- Consumes: real Gate 12/13/14 coordinates and existing `assertCompleteCandidateSet` 100m/2m policy.
- Produces: bidirectional mismatch rejection, correct endpoint acceptance, distinct candidate IDs, and explicit single-manual-gate limitation.

- [ ] Add real-coordinate tests for correct/mismatched Gate 12/13 endpoints and single-gate absolute-tolerance behavior.
- [ ] Run focused contract test; confirm any assertion gaps before production changes.
- [ ] Add documentation explaining competing-gate check and single-gate server-canonical dependency without changing tolerances.
- [ ] Re-run focused contract test.
- [ ] Verify diff, stage explicit paths, and commit `test(routing): verify Gate 12 and 13 identity`.

### Task 5: Default Test Chain Reconciliation

**Files:**
- Modify: `package.json`
- Modify: `docs/HYBRID_PROVIDER_CORE_INTEGRATION.md`

**Interfaces:**
- Produces: default `npm test` includes `test:all-gates-v2` and `test:outside-street-gate-selection-cost-v2`; written classification for remaining seven scripts and duplicated button children.

- [ ] Add both mandatory scripts to default chain and run each directly.
- [ ] Inspect/run remaining scripts to classify unique, duplicate, exhaustive optional, or stale/misleading coverage.
- [ ] Document why each stays outside default and recommended CI cadence; record duplicated button execution as deferred cleanup.
- [ ] Verify chain text executes mandatory scripts and run default suite later in full validation.
- [ ] Verify diff, stage explicit paths, and commit `test: add critical routing scripts to default suite`.

### Task 6: Current Hybrid Documentation Context

**Files:**
- Modify: `docs/FINAL_DEVICE_ACCEPTANCE_REPORT.md`
- Modify: `docs/PRODUCTION_RUNTIME_QA_PLAN.md`
- Modify: `docs/HYBRID_PROVIDER_CORE_INTEGRATION.md`
- Modify: `docs/CORE_ROUTING_DECISION.md`
- Modify: `docs/GOOGLE_ROUTES_PROXY_CONTRACT.md`

**Interfaces:**
- Produces: historical evidence remains dated; current architecture states internal/OSM fallback offline, configured proxy-first Google, OSM fallback, labelled direct guide.

- [ ] Add supersession/context notices to historical reports and qualify current-tense offline-only claims.
- [ ] Document synchronous OSM cancellation boundaries and absence of production per-gate timeout.
- [ ] Check five required documents for remaining blanket current-tense offline-only claims.
- [ ] Verify diff, stage explicit paths, and commit `docs: reconcile hybrid and offline routing claims`.

### Task 7: Full Verification and Review

**Files:** all changed files.

**Interfaces:**
- Produces: evidence-backed final report and clean correction worktree.

- [ ] Run focused manual outside, Gate 12/13, OSM, direct guide, complete-cost, all-gates, ViewModel, and rerouting tests.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:components -- --runInBand`.
- [ ] Run `git diff --check`, inspect commit/file scopes, and review final diff for MVVM or product-policy regressions.
- [ ] Report exact counts, warnings, commits, remaining risks, deferred cleanup, and final status without claiming native/device/backend/Google verification.
