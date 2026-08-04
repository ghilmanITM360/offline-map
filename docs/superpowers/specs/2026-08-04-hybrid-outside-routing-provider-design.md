# Hybrid Outside-Routing Provider Design

## Status

Owner-approved design for Codex provider track. Complete-journey gate policy remains owned by Claude core track. This document does not replace complete-routing policy.

## Goal

Provide outside-route candidates through priority order:

1. secure Google walking-route proxy
2. bundled offline OSM routing
3. clearly labelled direct-direction guide

Provider layer never chooses winning gate. Core combines provider distance with connector cost, gate penalty, and internal route cost.

## Constraints

- No Google Routes web-service credential in mobile app.
- Walking mode only.
- Provider output normalized before reaching viewmodels or UI.
- Every result identifies provider, road-following state, gate, geometry, instructions, warnings, fallback history, and request identity/version.
- Cancelled requests stop immediately. Timeouts may fall back.
- Stale results cannot replace newer routes.
- Direct guide is not road navigation and has no road instructions.
- Existing map-first UI remains; no Directions or Navigation screen restoration.
- Claude-owned routing files stay unchanged.

## Repository Discovery

No backend runtime, API route, serverless function, deployment config, backend secret store, or rate limiter exists. Mobile work may define proxy contract/client/mocks, but deployed Google routing is blocked pending backend-platform approval.

Historical `docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md` rejects online hybrid routing. Current owner decision supersedes that historical recommendation while preserving OSM fallback.

## Architecture

```text
core prepareOutsideRoutingPlan
  -> approved gate targets
  -> HybridOutsideRouteOrchestrator
       -> GoogleProxyWalkingRouteProvider
       -> OfflineOsmWalkingRouteProvider
       -> DirectDirectionGuideProvider
  -> normalized candidate set
  -> core finalizeOutsideRoutingPlan
  -> selected complete journey
```

Provider success must account for every requested gate as routed or authoritatively unreachable. Partial, indeterminate response fails provider attempt; otherwise a potentially optimal gate could be silently excluded.

## Normalized Contract

`OutsideWalkingRouteProvider.routeToGates()` accepts origin, approved gate targets, request ID/version, and `AbortSignal`. It returns either complete per-gate outcomes or safe failure.

Normalized routes contain:

- schema version
- request ID and version
- provider: `google`, `offline-osm`, or `direct-guide`
- gate ID
- distance and optional duration
- coordinates and normalized walking steps
- `roadFollowing`
- `distanceKind`: walking route or direct distance
- warnings and fallback history

Provider distance ends at gate route-target coordinate. Core owns connector cost and prevents double-counting.

## Fallback Taxonomy

Safe codes: cancelled, timed out, network unavailable, proxy unconfigured, proxy unavailable, rate limited, invalid request, malformed response, provider server error, outside coverage, graph unavailable, no route, unknown.

- `cancelled`: terminate; never fall back.
- Google safe failure: try OSM.
- OSM safe failure: produce direct-guide candidates.
- Direct guide always uses two-point geometry, direct distance, null duration, empty steps, and mandatory not-road warning.
- One provider attempt per request. No automatic retry loop.

## Concurrency

Request coordinator owns monotonic version and opaque request ID. New request aborts previous request. Same identity survives fallback chain. Commit only when identity remains current and signal is not aborted.

Reroute integration must retain current valid route until new complete journey exists. Provider failure must not clear active internal navigation. Automatic provider promotion is excluded pending owner policy.

## UI

Provider identity is text, not color-only. Direct guide displays English and Urdu warning together because current `settings.language` controls voice, not UI locale.

English:

> Road navigation is currently unavailable. This guide points directly toward the selected gate and may not follow walkable roads.

Urdu:

> سڑک کے مطابق نیویگیشن اس وقت دستیاب نہیں۔ یہ رہنمائی منتخب گیٹ کی سیدھی سمت دکھاتی ہے اور ضروری نہیں کہ پیدل چلنے کے قابل سڑکوں کے مطابق ہو۔

Direct guide exposes retry and manual-gate actions. Road-following outside polylines are solid; direct guide is dashed. Direct outside phase suppresses fake road names and turn instructions. Internal instructions resume after gate.

## Required Core Seam

Claude-owned core must add two narrow APIs during integration:

```ts
prepareOutsideRoutingPlan(input): CoreOutsideRoutingPlan | null
finalizeOutsideRoutingPlan({ plan, outsideCandidates, walkingSpeedMs }): RoutePreviewV2 | null
```

Plan exposes approved gate IDs and provider route targets, while retaining internal paths, penalties, connector costs, and eligibility inside core. OSM track must expose per-gate paths or a callback with equivalent semantics. Codex adapter does not call current one-winner OSM function as a competing gate selector.

## Verification Boundary

This track can prove types, validation, client normalization, fallback orchestration, cancellation, stale-response rejection, direct-guide semantics, component rendering, and config safety. It cannot prove deployed Google API behavior, proxy security controls, native rendering, device accessibility, or complete-journey integration until backend and core seams exist.
