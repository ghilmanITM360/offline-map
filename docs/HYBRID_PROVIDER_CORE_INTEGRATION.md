# Hybrid Provider/Core Integration

Status: source implemented and automated integration-tested. Native, device, deployed proxy, and real Google Routes behavior remain unverified.

This document complements `CORE_ROUTING_DECISION.md`; it does not redefine complete-journey cost or gate eligibility.

Internal Ijtema routing and bundled OSM outside fallback remain offline.
When a secure routing proxy is configured and available, every outside start
coordinate may first request Google walking-route candidates. Google failure
falls back to bundled OSM. Failure of both road-routing providers falls back
to a clearly labelled direct-direction guide that is not road navigation.

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

Outside/inside dispatch depends on resolved coordinate, not selection source.
Live GPS, remembered location, and manually searched/selected places use the
same hybrid workflow when their coordinate is outside. A manual place inside
the Ijtema continues through the existing internal pedestrian route.

## Canonical Contract

`src/models/outsideRouting.ts` owns one canonical `NormalizedOutsideCandidate` and complete per-gate `OutsideRouteCandidateSet` outcomes. Raw Google DTOs stop inside proxy client. Core plan retains core-only cost and eligibility data.

Production validation requires:

- every requested gate appears exactly once as routed or unreachable
- route candidate IDs are non-empty and unique
- candidate gate, provider, request ID, and request version match enclosing request
- routed geometry and distance are valid
- geometry begins within 100m of request origin, ends within 100m of declared gate target, and is not closer to another requested gate target (2m comparison margin)
- direct guide has no duration, road steps, or road-following claim
- finalized selected candidate exists and matches selected core gate and current request identity

Gate 12 (`24.963676, 67.006339`) and Gate 13 (`24.963718, 67.006862`)
are less than 100m apart. For normal multi-gate plans, the competing-target
check still rejects a Gate 12 route ending at Gate 13 and the reverse, despite
both endpoints satisfying the absolute 100m tolerance. A manual plan contains
only the selected gate, so no competing target exists in that request. Mobile
validation then has only the absolute endpoint tolerance; secure proxy
validation against server-side canonical gate coordinates remains required.

## Provider Behavior

Google runs only when `EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL` is a valid configured base URL. Mobile sends walking-only requests and contains no Google Routes web-service credential. Backend remains undeployed; server security, quota, rate limiting, and real Google behavior remain blocked pending platform approval.

OSM adapter calls `RoutingServiceV2.resolveOfflineOsmOutsideCandidate(origin, gateId)` for every core-approved gate. It preserves road geometry, generated walking steps, graph coverage failure, and sanity warnings. Adapter never selects gate.

Bundled OSM graph calculation is synchronous in production. No per-gate
JavaScript timer is presented as an interrupt: a timer cannot preempt that
CPU work. Cancellation is checked before each gate calculation and after it
returns, so cancellation stops untouched gates and prevents a completed
provider result from committing. External request coordination also checks
cancellation before and after provider execution. An in-progress synchronous
gate calculation itself is not cancellable.

Direct guide is final fallback. It returns direct-distance geometry, `roadFollowing: false`, null duration, no road instructions, and visible English/Urdu warning. Preview and active navigation expose retry and official-gate selection. Direct geometry is dashed and never labelled as shortest, safest, or road-following.

## Request Lifecycle

`OutsideRouteRequestCoordinator` owns opaque request ID, monotonic version, abort signal, and current-result check. New request aborts old request. Preview and live reroute commit only current results. Failed replacement retains current valid route. Automatic reroute does not downgrade a valid road-following route to direct guide; explicit manual-gate action may start direct guidance when road providers fail.

Live navigation also holds a synchronous in-flight marker. Rapid GPS updates cannot start overlapping automatic reroutes; explicit retry or manual-gate action may deliberately supersede current provider work.

## Configuration

```text
EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH=true
EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL=
```

Source default and clean-clone example enable bundled OSM street routing. Empty proxy URL safely skips Google and falls back to OSM. `.env` and credentials remain untracked.

## Verification Boundary

Automated evidence covers canonical contract, complete set validation, exact selected candidate, complete-journey cost boundary, Google client normalization/errors, fallback order, cancellation/stale rejection, Gate 12 manual flow, preview/reroute retention, direct UI semantics, and dashed geometry.

Still required: deployed secure proxy integration, real Google route test, Android/iOS native builds, physical-device route geometry/accessibility, GPS rerouting, background/resume, and crowd-network behavior.

## Routing Test-Chain Policy

`npm test` includes the two critical formerly orphaned scripts. Remaining
scripts stay targeted until test-architecture cleanup; classification below
prevents their names from being mistaken for default coverage.

| Script | Classification | Default/CI policy |
| --- | --- | --- |
| `test:all-gates-v2` | unique necessary coverage | Default. Verifies all official gates, including Gate 12, against all blocks. Run on every CI test job. |
| `test:outside-street-gate-selection-cost-v2` | unique necessary coverage | Default. Protects connector, internal, penalty, reachability, and tie-break costs. Run on every CI test job. |
| `test:all-blocks-v2` | duplicate coverage | Outside default because `test:all-gates-v2` traverses the same 14×42 gate/block matrix and default block-entry/route-smoke tests cover resolved entries. Run after bulk block or connector edits; separate CI job is optional. |
| `test:all-roads-v2` | unique necessary coverage | Outside default to keep this correction narrow. Run after rasta or navigation-graph edits; CI should run it in a map-data routing job. |
| `test:all-points-v2` | expensive exhaustive/optional suite | Runs every central-point snap against all 42 blocks. Run after central-point/graph edits and in nightly or release-candidate CI. |
| `test:all-routing-combinations-v2` | expensive exhaustive/optional suite | Exercises 5,476 place pairs and emits large diagnostics. Run after routing-model/data changes and in nightly or release-candidate CI. |
| `test:nearest-gate-selection-v2` | stale or misleading test | Tests nearest-gate helper at gate coordinates, not current complete-journey routing policy. Run only when orientation/banner helper changes; rename or replace before adding to CI. |
| `test:block-entry-selection-v2` | expensive exhaustive/optional suite | Diagnostic 168-entry matrix currently treats 38 never-selected connected entries as `SKIPPED`. Run after block-entry changes and in nightly map-data CI, not as a release gate until skip policy is defined. |
| `test:parking-routing-v2` | stale or misleading test | Exits successfully when parking data is absent and performs no route calculation. Keep outside CI until parking exists and test asserts routing behavior. |

`test:button-actions-v2` invokes `test:home-buttons-v2`,
`test:directions-buttons-v2`, `test:directions-boundary-consistency-v2`,
`test:navigation-buttons-v2`, `test:critical-actions`, and `test:settings-ui`;
all six also appear separately in `npm test`. Removing that double execution
belongs to later test-architecture cleanup, not this correction.
