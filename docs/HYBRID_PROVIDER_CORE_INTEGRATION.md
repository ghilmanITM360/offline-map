# Hybrid Provider/Core Integration

Status: source implemented and automated integration-tested. Native, device, deployed proxy, and real Google Routes behavior remain unverified.

This document complements `CORE_ROUTING_DECISION.md`; it does not redefine complete-journey cost or gate eligibility.

## Production Flow

```text
DirectionsViewModel / NavigationViewModelV2
  -> RoutingServiceV2.prepareOutsideRoutingPlan
  -> HybridOutsideRouteOrchestrator
       1. GoogleProxyWalkingRouteProvider (configured proxy only)
       2. OfflineOsmWalkingRouteProvider (per approved gate)
       3. DirectDirectionGuideProvider (per approved gate)
  -> RoutingServiceV2.finalizeOutsideRoutingPlan
  -> exact selectedOutsideCandidateId attachment
  -> map-first preview or active navigation
```

Provider layer supplies outside route distance, optional duration, geometry, steps, warnings, and provider/request identity for each approved gate. Core alone adds connector cost, gate penalty, and internal route cost, then chooses complete-journey winner. Manual gate selection narrows prepared plan before provider work; provider distance cannot override it.

## Canonical Contract

`src/models/outsideRouting.ts` owns one canonical `NormalizedOutsideCandidate` and complete per-gate `OutsideRouteCandidateSet` outcomes. Raw Google DTOs stop inside proxy client. Core plan retains core-only cost and eligibility data.

Production validation requires:

- every requested gate appears exactly once as routed or unreachable
- route candidate IDs are non-empty and unique
- candidate gate, provider, request ID, and request version match enclosing request
- routed geometry and distance are valid
- direct guide has no duration, road steps, or road-following claim
- finalized selected candidate exists and matches selected core gate and current request identity

## Provider Behavior

Google runs only when `EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL` is a valid configured base URL. Mobile sends walking-only requests and contains no Google Routes web-service credential. Backend remains undeployed; server security, quota, rate limiting, and real Google behavior remain blocked pending platform approval.

OSM adapter calls `RoutingServiceV2.resolveOfflineOsmOutsideCandidate(origin, gateId)` for every core-approved gate. It preserves road geometry, generated walking steps, graph coverage failure, and sanity warnings. Adapter never selects gate.

Direct guide is final fallback. It returns direct-distance geometry, `roadFollowing: false`, null duration, no road instructions, and visible English/Urdu warning. Preview and active navigation expose retry and official-gate selection. Direct geometry is dashed and never labelled as shortest, safest, or road-following.

## Request Lifecycle

`OutsideRouteRequestCoordinator` owns opaque request ID, monotonic version, abort signal, and current-result check. New request aborts old request. Preview and live reroute commit only current results. Failed replacement retains current valid route. Automatic reroute does not downgrade a valid road-following route to direct guide; explicit manual-gate action may start direct guidance when road providers fail.

## Configuration

```text
EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH=true
EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL=
```

Source default and clean-clone example enable bundled OSM street routing. Empty proxy URL safely skips Google and falls back to OSM. `.env` and credentials remain untracked.

## Verification Boundary

Automated evidence covers canonical contract, complete set validation, exact selected candidate, complete-journey cost boundary, Google client normalization/errors, fallback order, cancellation/stale rejection, Gate 12 manual flow, preview/reroute retention, direct UI semantics, and dashed geometry.

Still required: deployed secure proxy integration, real Google route test, Android/iOS native builds, physical-device route geometry/accessibility, GPS rerouting, background/resume, and crowd-network behavior.
