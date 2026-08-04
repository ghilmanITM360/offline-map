# Hybrid Outside-Routing Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deployment-neutral hybrid outside-route provider contracts, safe proxy client, OSM adapter seam, direct guide, fallback orchestration, concurrency guard, and honest UI presentation without editing Claude-owned core routing.

**Architecture:** Provider implementations return complete normalized per-gate candidate sets. Orchestrator tries Google, OSM, then direct guide. Claude core later supplies approved gates and selects complete journey through documented prepare/finalize seam.

**Tech Stack:** TypeScript 5.9, React Native 0.81, React 19, Expo 54, Jest/RNTL 14, standalone `tsx` tests.

## Global Constraints

- Do not modify Claude-owned routing/data files or tests.
- No backend platform, Google web-service key, `.env`, push, or integration merge.
- Use failing tests before production code.
- Keep provider types out of core gate-selection policy.
- Direct guide must remain explicitly non-road-following.

---

### Task 1: Normalized provider contract

**Files:**
- Create: `src/models/outsideRouting.ts`
- Create: `src/services/outsideRouting/OutsideRouteValidation.ts`
- Test: `scripts/test-outside-provider-contract.ts`

**Interfaces:**
- Produces request token, gate target, normalized route/step/warning/failure, complete candidate-set types, validation helpers.

- [ ] Write failing tests for finite coordinates, unique gates, provider/road-following invariants, and complete per-gate outcomes.
- [ ] Run `node --import tsx scripts/test-outside-provider-contract.ts`; expect missing-module failure.
- [ ] Implement types and validators without provider-specific payload fields.
- [ ] Run focused test; expect pass.
- [ ] Commit `routing: define outside provider contract`.

### Task 2: Google proxy client and adapter

**Files:**
- Create: `src/services/outsideRouting/GoogleRoutesProxyContract.ts`
- Create: `src/services/outsideRouting/GoogleRoutesProxyClient.ts`
- Create: `src/services/outsideRouting/GoogleProxyWalkingRouteProvider.ts`
- Test: `src/services/outsideRouting/__tests__/GoogleRoutesProxyClient.test.ts`

**Interfaces:**
- Consumes normalized request.
- Produces safe provider attempt; raw proxy DTO remains private.

- [ ] Write failing Jest tests for walking-only request, validation, timeout, cancellation, unavailable proxy, 429, server error, malformed payload, and normalized success.
- [ ] Run focused Jest test; expect missing-module failure.
- [ ] Implement HTTPS/localhost URL validation, one bounded fetch, timeout abort composition, safe status mapping, response normalization.
- [ ] Run focused test; expect pass.
- [ ] Commit `routing: add Google proxy client contract`.

### Task 3: OSM adapter, direct guide, and fallback

**Files:**
- Create: `src/services/outsideRouting/OfflineOsmWalkingRouteProvider.ts`
- Create: `src/services/outsideRouting/DirectDirectionGuideProvider.ts`
- Create: `src/services/outsideRouting/HybridOutsideRouteOrchestrator.ts`
- Test: `scripts/test-hybrid-outside-provider.ts`

**Interfaces:**
- OSM adapter consumes core-owned per-gate resolver callback.
- Direct guide returns one two-point candidate per approved gate.
- Orchestrator returns first complete provider set with accumulated safe fallback history.

- [ ] Write failing tests for Google stop, Google failure to OSM, Google timeout to OSM, OSM failure to direct, cancellation stop, identity and fallback accuracy, no retry loop.
- [ ] Run focused script; expect missing-module failure.
- [ ] Implement minimal providers/orchestrator.
- [ ] Run focused test; expect pass.
- [ ] Commit `routing: add offline and direct fallbacks`.

### Task 4: Request generation and stale-response protection

**Files:**
- Create: `src/services/outsideRouting/OutsideRouteRequestCoordinator.ts`
- Test: `src/services/outsideRouting/__tests__/OutsideRouteRequestCoordinator.test.ts`

**Interfaces:**
- Produces stable opaque request ID, monotonic version, signal, current-result guard, and cancellation.

- [ ] Write failing tests proving new requests abort previous, cancellation blocks commit, and stale completion cannot commit.
- [ ] Run focused Jest test; expect missing-module failure.
- [ ] Implement coordinator without retries or coordinate-bearing IDs.
- [ ] Run focused test; expect pass.
- [ ] Commit `routing: guard outside route requests`.

### Task 5: Provider presentation and direct-guide UI

**Files:**
- Create: `src/services/OutsideRouteLocalizationService.ts`
- Create: `src/views/components/navigation/OutsideRouteStatusCard.tsx`
- Create: `src/__tests__/OutsideRouteStatusCard.test.tsx`

**Interfaces:**
- Consumes normalized selected outside route plus retry/manual-gate callbacks.
- Produces provider label, bilingual direct warning, accessible actions.

- [ ] Write failing RNTL tests for Google/OSM identity, direct bilingual alert, no road language, retry, gate action, and accessibility.
- [ ] Run focused component test; expect missing-module failure.
- [ ] Implement catalog and component using existing theme/Button conventions.
- [ ] Run focused component test; expect pass.
- [ ] Commit `ui: surface outside provider fallback states`.

### Task 6: Configuration and security contract

**Files:**
- Modify: `.env.example`
- Create: `docs/GOOGLE_ROUTES_PROXY_CONTRACT.md`
- Create: `scripts/test-hybrid-provider-config.ts`

**Interfaces:**
- Mobile config exposes optional proxy base URL only.
- Proxy spec defines server-only credential boundary and safe schema.

- [ ] Write failing config test for outside street flag ON, optional proxy URL placeholder, and absence of mobile Routes secret.
- [ ] Run focused script; expect failure.
- [ ] Update example and write deployment-neutral proxy contract.
- [ ] Run focused test; expect pass.
- [ ] Commit `config: document hybrid provider settings` and `docs: define secure Routes proxy contract` as separate commits if staged scopes differ.

### Task 7: Integration readiness and verification

**Files:**
- Modify only additive provider metadata consumers if core seam exists before track completion.
- Otherwise document exact blocked signatures; do not fake runtime integration.

- [ ] Run focused provider scripts and Jest tests.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test:components`, and `npm test`.
- [ ] Run `git diff --check` and secret-pattern scan over tracked diff.
- [ ] Dispatch read-only reviewer for credential leakage, location logging, type leaks, races, retries, copy, localization, and unrelated files.
- [ ] Fix findings through failing tests first.
- [ ] Verify Claude-owned files unchanged against baseline `f28e25e`.
- [ ] Remove local `node_modules` worktree symlink and report final clean status.
