# Hybrid Provider Core Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine finalized Claude complete-journey routing core with Codex Google → offline OSM → direct-guide provider system in production map-first routing.

**Architecture:** `DirectionsViewModel` and v2 navigation request fresh core plans, delegate outside-only candidate generation to one hybrid orchestrator, and pass complete candidate sets back to `RoutingServiceV2.finalizeOutsideRoutingPlan`. Core remains sole gate selector and cost authority. One request coordinator owns cancellation/versioning; views only render state and invoke commands.

**Tech Stack:** Expo React Native 0.81, React 19, TypeScript, Zustand, RNTL 14, standalone `tsx` test scripts.

## Global Constraints

- Start from Claude HEAD `212575cc8de72e0465be1f2bb0a086c14911bd2d`; preserve 11 Codex commits in original order.
- Canonical outside candidate model supports candidate/gate/provider/request identity, distance, optional duration, geometry, steps, warnings, road-following, fallback history, and unreachable outcomes.
- Provider distance excludes connector cost, gate penalty, and internal route cost.
- Provider order is configured Google proxy, offline per-gate OSM, then direct guide.
- `RoutingServiceV2` alone owns eligibility, complete-journey comparison, manual override, and route composition.
- Manual gate options come from `getRoutableOfficialGates()`; Gate 12 remains distinct and routable.
- No mobile Google web-service credential; proxy URL optional.
- Preserve current valid route until replacement is current and finalized.
- Do not restore separate Directions/Navigation screens or perform unrelated cleanup.
- Do not push or merge.

---

### Task 1: Apply Codex Provider History

**Files:** Eleven existing Codex commits from `6a10426` through `62066a7`.

- [ ] Cherry-pick each commit individually in supplied order.
- [ ] Before each pick, verify no cherry-pick remains active.
- [ ] Resolve overlapping files field-by-field, preserving Claude core behavior and Codex provider/UI intent.
- [ ] Run `git diff --check`, typecheck, and focused affected tests after conflicts.

### Task 2: Consolidate Candidate Contract

**Files:**
- Modify: `src/models/outsideRouting.ts`
- Modify: `src/services/RoutingServiceV2.ts`
- Modify: provider modules consuming candidate types
- Test: `src/__tests__/outsideRoutingContract.test.ts`
- Test: `scripts/test-core-provider-routing-contract-v2.ts`

**Interfaces:** Canonical shared candidate/outcome types flow from providers into core; core plan retains connector, penalty, internal route, and eligibility.

- [ ] Write failing type/runtime tests for canonical identity, full gate outcomes, fallback history, and exact selected candidate.
- [ ] Run focused tests and verify expected failure.
- [ ] Move/extend types without unsafe casts or duplicate complete-cost policy.
- [ ] Run focused tests and typecheck.
- [ ] Commit `routing: consolidate outside provider candidate types`.

### Task 3: Wire Provider Orchestration Into Preview Service

**Files:**
- Modify: `src/services/V2DirectionsService.ts`
- Modify: `src/services/outsideRouting/OfflineOsmWalkingRouteProvider.ts`
- Modify: `src/services/outsideRouting/DirectDirectionGuideProvider.ts`
- Modify: `src/services/outsideRouting/HybridOutsideRouteOrchestrator.ts`
- Test: `src/__tests__/V2DirectionsServiceHybrid.test.ts`
- Test: provider contract/fallback suites

**Interfaces:** Prepare core plan → request every approved gate → orchestrate complete candidate set → finalize core plan → attach exact `selectedOutsideCandidateId` candidate.

- [ ] Add failing tests for Google, OSM, direct, incomplete sets, no double counting, exact identity, and gate mismatch.
- [ ] Verify failures.
- [ ] Implement provider adapters against Claude per-gate OSM resolver and canonical candidate contract.
- [ ] Implement runtime invariants for missing/mismatched/stale selected candidates.
- [ ] Run focused tests and typecheck.
- [ ] Commit `routing: wire hybrid providers into route planning`.

### Task 4: Connect Preview Request Lifecycle And Manual Gate Commands

**Files:**
- Modify: `src/viewmodels/DirectionsViewModel.ts`
- Modify: `src/services/outsideRouting/OutsideRouteRequestCoordinator.ts`
- Modify: `src/views/components/map/LocationSheet.tsx`
- Test: new focused Directions ViewModel integration tests
- Test: `src/__tests__/LocationSheet.test.tsx`

**Interfaces:** ViewModel owns request coordinator, current-route retention, retry, `manualGateId`, and `getRoutableOfficialGates()` options. Views receive callbacks/state only.

- [ ] Write failing tests for stale response, previous abort, current-route retention, retry, Gate 12 manual selection, and provider non-override.
- [ ] Verify failures.
- [ ] Implement async hybrid preview path and command state.
- [ ] Wire retry/manual callbacks to `LocationSheet` without provider logic in view.
- [ ] Run focused unit/component tests and typecheck.
- [ ] Commit `navigation: connect hybrid preview request lifecycle`.

### Task 5: Reuse Flow For Rerouting

**Files:**
- Modify: `src/viewmodels/NavigationViewModelV2.ts`
- Modify: service seam shared by preview/reroute if needed
- Test: focused reroute integration tests
- Test: `scripts/test-reroute-v2.ts`

**Interfaces:** Reroute uses same prepare/orchestrate/finalize service. Replacement commits only when current; failure retains active route.

- [ ] Write failing tests for current route retention, stale reroute, cancellation, and same complete-cost policy.
- [ ] Verify failures.
- [ ] Replace direct sync outside reroute path with shared async hybrid service while preserving inside-route behavior and cooldown.
- [ ] Run focused tests and typecheck.
- [ ] Commit `navigation: connect hybrid rerouting lifecycle`.

### Task 6: Complete Provider-Aware UI

**Files:**
- Modify: `src/views/components/navigation/NavigationChromeV2.tsx`
- Modify: `src/views/components/navigation/NavigationMapLayersV2.tsx`
- Modify: `src/views/components/navigation/OutsideRouteStatusCard.tsx`
- Modify: `src/views/screens/HomeScreen.tsx` only for callback delegation/render props
- Test: provider/direct-guide component suites

**Interfaces:** UI renders provider identity, honest direct warning, solid/dashed geometry, retry/manual actions, and no direct ETA/road steps.

- [ ] Add failing component assertions for English/Urdu copy, retry/manual actions, accessibility, dashed direct line, and hidden road semantics.
- [ ] Verify failures.
- [ ] Wire callbacks and presentation fields without routing-cost logic.
- [ ] Run component/focused source tests.
- [ ] Commit `ui: connect direct-guide routing actions`.

### Task 7: Reconcile Config, Docs, And Combined Validation

**Files:**
- Modify: `.env.example` only if necessary
- Modify: provider/core architecture docs
- Modify: test scripts only where combined contract invalidates old assertions

- [ ] Verify source default and `.env.example` outside street graph are ON and proxy URL contains no secret.
- [ ] Search fixed gate/candidate-count assumptions and update only stale integration assertions/docs.
- [ ] Run focused Gate 12, complete-cost, provider, coordinator, UI, preview, and reroute tests.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:components`.
- [ ] Dispatch final read-only reviewer and resolve Critical/Important findings.
- [ ] Commit `test: cover combined core and provider routing` and `docs: reconcile hybrid integration contract` as warranted.
- [ ] Remove temporary dependency symlink; verify clean final status.

