# Core Routing Decision: Complete-Journey Gate Selection

> **Current integration context:** This document remains authoritative for
> eligibility and complete-journey cost. References below to beeline/default
> offline provider behavior describe the core track when it was written.
> Current production outside coordinates, regardless of GPS, remembered, or
> manual selection source, use `prepareOutsideRoutingPlan` → configured Google
> proxy → bundled OSM fallback → labelled direct-direction fallback →
> `finalizeOutsideRoutingPlan`. Internal venue routing remains offline.

Status: **Implemented.** Updated for Gate 12 and the core/provider
integration contract (see "Gate 12 / 13 / 14 coordinates" and "Core/provider
outside-routing contract" below) — both follow-ups to the original
implementation, same branch.

Branch: `agent/claude-routing-core`. Supersedes the gate-selection *policy*
assumptions in `docs/OUTSIDE_ROUTING_ARCHITECTURE_DECISION.md` and
`docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md` (both correctly built the
street-graph *geometry*, but assumed gate selection itself would stay
unchanged — "same gate-selection policy as today... now road-following" —
see the superseded-notice added to each). Does **not** change anything in
`docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md`'s radius (3km), sanity cap
(1.8x), or data-pipeline decisions — those remain authoritative as-is.

## The objective

Automatic gate selection for a user starting outside the venue minimizes the
**complete pedestrian journey**:

```
outside walking-route cost
+ gate connector cost
+ gate penalty (0 for an ordinary gate)
+ internal pedestrian-route cost (gate -> destination)
= complete journey cost
```

Not the nearest gate. Not the cheapest outside leg. Not the shortest street
connector alone. The gate that minimizes the sum of all four terms above,
for the user's *actual destination*.

This applies identically to:
- **Beeline routing** (straight-line outside leg, used beyond the bundled
  street-graph radius or when the street-graph flag is off) —
  `RoutingServiceV2.findBestOutsidePath` already ran one joint multi-source
  A* search folding connector cost + penalty + internal cost together before
  this change; it was already correct and needed no change here.
- **Offline OSM street routing** (real street-following outside leg, within
  the bundled 3km radius) — `OutsideStreetRoutingService.selectStreetGraphOutsidePath`
  previously picked a gate by street cost + penalty *alone*, computing the
  internal leg only after a gate was already chosen. This was the actual bug
  (see "Known counterexample" below) and is what this change fixes.
- **Initial routing and rerouting** — both call the exact same
  `RoutingServiceV2.calculateRoute` entry point (rerouting has no
  gate-selection logic of its own; `buildV2RerouteRequest` just builds a
  fresh `outside_coordinate` request and hands it to the same function). A
  parity test (`scripts/test-reroute-v2.ts`) asserts a direct
  `calculateRoute` call and the reroute flow agree on the selected gate,
  under both modes.

## Manual gate override

When the user explicitly selects a gate (search result, map tap, or
`RoutingStartV2.manualGateId`), automatic selection never runs — the
candidate list is narrowed to that one gate before any cost comparison
happens (`resolveStartCandidates`'s `'gate'` branch bypasses
`selectOutsidePath` entirely; `manualGateId` narrows `selectOutsidePathViaBeeline`
/ `selectOutsidePathViaStreetGraph`'s candidate list to one gate). Manual
selection is authoritative regardless of complete-journey cost. Regression
coverage: `scripts/test-outside-street-graph-integration-v2.ts` ("Manual
gate override must remain authoritative under street mode").

## Gate eligibility (unchanged by this work)

A gate is an automatic-selection candidate only if:
- it has a coordinate (`routingStatus !== 'missing_coordinate'`),
- `routingStatus === 'routable'` and `canStartRouteFromOutside === true`,
- it has at least one internal graph connection (`getConnectedCandidates`),
- for OSM street mode: it also has a valid internal route to the specific
  destination (`findBestPath` succeeds) — gates with no internal path to the
  requested destination are excluded from the street search entirely, not
  just deprioritized.

Gates without verified coordinates, or internally disconnected gates
(`GATE_03`, `GATE_17`, `GATE_18`, `GATE_19`), are never offered as automatic
or nearest-gate candidates. Disconnected gates keep their existing
"This gate needs connector verification before navigation." block on
*starting active navigation* through them — a separate mechanism from
everything in this document (see `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`,
unchanged).

The internal route from the selected gate to the destination is pedestrian-only,
over the venue's internal navigation graph (`IJTEMA_NAVIGATION_GRAPH_V2`) — unchanged.

## Gate 12 / 13 / 14 coordinates

Verified coordinates supplied by the project owner:

| Gate | Latitude | Longitude |
|---|---|---|
| Gate 12 | 24.963676 | 67.006339 |
| Gate 13 | 24.963718 | 67.006862 |
| Gate 14 | 24.965516 | 67.007675 |

Gate 13 and Gate 14 are `status: 'provided'` (previously
`'needs_verification'`) in `src/data/ijtema/gates.ts`, distinct locations
(~216m apart, vs. ~5m in the originally supplied dataset), each confirmed to
connect to the internal graph (Gate 13 -> `R6-09`-adjacent node, Gate 14 ->
its existing connector node, both well within the 320m
`GATE_CONNECTOR_MAX_M` threshold) and to the bundled OSM street graph
(regenerated after the coordinate change).

**Gate 12 status: an earlier revision of this document recorded Gate 12 as
explicitly out of scope, based on the project owner's initial guidance. The
project owner has since corrected that guidance — Gate 12 is a real,
confirmed gate — and it has been added as a normal, fully routable official
gate.** It previously had no record at all in `src/data/ijtema/gates.ts`
(the file jumped `gate(8, ...)` -> `gate(13, ...)`); it now sits between
them (`gate(12, ...)` before `gate(13, ...)`), using the same `gate()`
factory every other gate uses — no gate-ID-specific code was written for it.
Connectivity was verified from repository evidence, not assumed, before
adding the record:

- **Internal graph**: `buildNavigationGraphV2()` (live, derived from
  `IJTEMA_GATES` at module load) connects Gate 12 to walkable node `R6-09` at
  15m — well within the 320m `GATE_CONNECTOR_MAX_M` threshold.
- **Outside street graph**: regenerating via the existing deterministic
  generator (`scripts/generate-street-graph.ts`, a live OSM Overpass pull)
  connects Gate 12 to a street node at 15.15m. A baseline re-pull *without*
  Gate 12 first confirmed the OSM extract itself is stable — identical raw
  (12,979 nodes / 17,032 edges) and simplified (7,945 nodes / 11,978 edges)
  counts to the previously-committed graph, only the `generatedAt` timestamp
  differed — so the regenerated `streetGraph.ts` changed in exactly one
  place: Gate 12's new connector entry. All 17 pre-existing gate connectors
  are byte-identical (same node coordinate, same distance) to before.
- **Identity**: Gate 12 is 52.9m from Gate 13 and 245.0m from Gate 14 — not a
  near-duplicate of either; all three remain distinct, independently
  routable gates.

Gate 12 is therefore fully routable (`routingStatus: 'routable'`,
`canStartRouteFromOutside: true`), not left in a degraded state — the
"add the record but keep it non-routable" fallback the original follow-up
brief allowed for was not needed. The active gate count is now **18**
(previously 17); `src/data/ijtema/gateMeta.ts`'s `MAJOR_GATE_IDS` (map
label-declutter priority) was deliberately left untouched — that is a
product/UX call about which gates get priority at low zoom, not a
routing-correctness one, and out of scope here.

## Gate 13 / 14 penalty removal

The 120m `needs_verification` penalty
(`OutsideStreetRoutingService.NEEDS_VERIFICATION_GATE_PENALTY_M` /
`gatePenaltyM`) and the presentational "This gate needs verification before
navigation." warning (`V2PlaceAdapter`'s `gateVerificationWarning`) are both
purely `gate.status === 'needs_verification'`-driven, general mechanisms —
not hardcoded to Gate 13/14 by ID. Updating both gates' coordinates and
dropping their `needs_verification` status removes the penalty and warning
for them as a direct consequence. Gate 19 is now the sole current gate with
that status: it also has `connectorStatus: 'ground_truth_required'` and is
excluded from outside-entry eligibility until physical connectivity is
verified. The warning mechanism remains independently tested with a synthetic
gate so its routing-neutral behavior is not coupled to Gate 19's separate
connector block.

## Known OSM counterexample

Start `24.9762, 67.011`, destination Block 34, OSM street mode. Gate 20 sits
only ~115m from the start by street distance — by far the nearest gate
outside — but its internal route to B34 is ~1.4km. Before this fix,
`selectStreetGraphOutsidePath` picked Gate 20 anyway (destination-blind:
minimized street cost + penalty only). After this fix, the gate that
minimizes the *complete* journey wins instead (confirmed via an
independently-computed per-gate total, not by re-deriving the expectation
from the code under test — see `scripts/test-route-selection-total-cost-v2.ts`
and the synthetic proof of the same shape in
`scripts/test-outside-street-gate-selection-cost-v2.ts`).

## Algorithm: destination-aware weighted virtual sink

For OSM street mode (`OutsideStreetRoutingService.selectStreetGraphOutsidePath`,
called from `RoutingServiceV2.selectOutsidePathViaStreetGraph`):

1. Gather eligible official gates (see eligibility above).
2. For each candidate gate, compute its best internal pedestrian route to the
   destination *first*, via the existing `findBestPath`.
3. Exclude gates with no valid internal route.
4. Run **one** A* search over the bundled street graph, seeded from the
   user's nearest street node, with a synthetic virtual-sink node
   (`GATE_GOAL_SINK`) shared by all candidates. Each candidate gate's
   connector node gets one synthetic edge to that sink, weighted:

   ```
   gate.connector.distanceM + gatePenaltyM(gate) + internalPath.costM
   ```

   (plus a `gate.number * 1e-6` epsilon — see tie-breaking below.)
5. The sink is popped exactly once the true minimum is found (non-negative
   edge weights + an admissible heuristic — see below) — recovering the
   winning gate, its real street-following outside path, and its connector
   distance from the same search.
6. The winning gate's internal path is the one already computed in step 2,
   reused directly — not recomputed — so the outside and internal legs
   returned to the caller can never disagree about which gate they belong to.

This mirrors the technique the beeline path (`findBestOutsidePath`) already
used — one joint multi-source/multi-target search instead of "pick a gate,
then compute the rest" — extended to the street-graph case, which
additionally needed the internal cost pulled *forward* into the search
(beeline could seed gScore directly per gate; the street graph needed a
virtual sink because targets are graph nodes reached by real search, not
direct seeds).

**Admissibility**: preserved. The existing heuristic lower-bounds real
street-graph distance to the nearest candidate connector node, which is
`<=` that distance plus any non-negative addition (connector distance +
penalty + internal cost, all non-negative) — the same argument already
documented in the code for the penalty-only case, now covering the larger
constant.

**Determinism**: an exact tie in real cost previously resolved as an
unspecified heap-order artifact. A `gate.number * 1e-6` epsilon (far below
any real-world cost gap) is now folded into the same sink weight so ties
break toward the lower gate number, deterministically, every run.

**Correctness properties proven by synthetic tests**
(`scripts/test-outside-street-gate-selection-cost-v2.ts`, deliberately not
keyed to real Gate 13/14 data): connector cost is part of the decision,
internal cost is part of the decision (the synthetic shape of the B34
counterexample), the penalty applies exactly once, a street-unreachable gate
can never win, an internally-disconnected (pre-filtered) gate can never win,
equal-cost ties break deterministically by gate number.

**Complexity**: unchanged shape for the street search itself — still exactly
one A* run over the ~7,945-node/~11,978-edge bundled street graph. The new
cost is `O(candidate gates)` extra small internal-graph searches (18 gates,
14 of them currently routable/outside-eligible, against the ~290-node venue
graph, each `findBestPath`) run once per route calculation, before the
street search — see performance numbers below.

## Core/provider outside-routing contract

Codex's provider track (e.g. a Google Directions integration) needs to
compute the *outside* leg (user -> gate) with a provider core has no
business knowing about — while core keeps sole ownership of gate
eligibility, connector/penalty/internal cost, the complete-journey
comparison across candidates, manual override, and deterministic
tie-breaking, i.e. exactly the policy described above. `src/services/RoutingServiceV2.ts`
exposes this as a narrow two-phase API, reusing the same private
eligibility/`findBestPath`/`gatePenaltyM` helpers `calculateRoute`'s
street-graph path already uses (not a parallel implementation) — so a
provider-driven route and the default offline flow can never apply a
different policy.

**Phase 1 — `RoutingServiceV2.prepareOutsideRoutingPlan(input: { userCoordinate, destination, manualGateId?, walkingSpeedMs? }): CoreOutsideRoutingPlan | null`**

Resolves the destination and gate eligibility (same filter as
"Gate eligibility" above, narrowed to one gate when `manualGateId` is set),
excludes any gate with no valid internal route to the destination, and
returns one `CoreOutsideCandidateGate` per remaining eligible gate:

```ts
interface CoreOutsideCandidateGate {
  candidateId: string;        // == gateId — no invented ID scheme
  gateId: string;
  gateLabel: string;
  providerRouteTargetCoordinate: AppCoordinate; // the gate's own coordinate — see cost boundary below
  connectorCostM: number;     // 0 today — see cost boundary below
  penaltyM: number;           // gatePenaltyM(gate) — 0 for every current gate
  internalCostM: number;      // findBestPath(gate, destination).costM
}
```

`null` when the destination can't be resolved or no gate is eligible
(including a `manualGateId` that doesn't exist or isn't internally
connected — the same "unresolved" case `EntryGateRoutingService` already
returns for the default flow, here as a clean `null` instead of a rich
error object, so the caller's own UI layer decides how to present it).

**Phase 2 — `RoutingServiceV2.finalizeOutsideRoutingPlan(input: { plan: CoreOutsideRoutingPlan; outsideCandidates: OutsideRouteCandidateSet; walkingSpeedMs: number }): RoutePreviewV2 | null`**

```ts
interface NormalizedOutsideCandidate {
  candidateId: string;               // exact provider-route alternative identity
  gateId: string;
  provider: 'google' | 'offline-osm' | 'direct-guide';
  requestId: string;
  requestVersion: number;
  distanceM: number;                 // provider distance to providerRouteTargetCoordinate ONLY
  coordinates: AppCoordinate[];
  // duration, normalized steps, warnings, roadFollowing, fallback metadata
}
interface OutsideRouteCandidateSet {
  requestId: string;
  requestVersion: number;
  provider: NormalizedOutsideCandidate['provider'];
  outcomes: Array<
    | { status: 'routed'; gateId: string; routes: NormalizedOutsideCandidate[] }
    | { status: 'unreachable'; gateId: string; reason: 'no-route' }
  >;
}
```

For each routed provider alternative, combines `distanceM` with its plan
gate's `connectorCostM + penaltyM + internalCostM`, plus the same
`gate.number * 1e-6` tie-break epsilon used elsewhere (never reported —
`routeCostM`/`totalDistance` are `Math.round`ed, and the epsilon's
maximum magnitude, ~2.2e-5m for gate 22, can never change a rounded
integer-meter result). Picks the argmin, rebuilds the matching internal
route for that exact gate via `findBestPath` (so the outside and internal
legs can never disagree about which gate they belong to), and returns a
normal `RoutePreviewV2` — the same shape `calculateRoute` returns, with one
addition: `selectedOutsideCandidateId` echoes exact winning provider-route
`candidateId`, so a caller that supplied multiple alternatives for one gate
can attach exact geometry without re-deriving it from `startResolution`. The provider
layer never picks the winner — it supplies distances, core picks.

Production orchestration validates request identity and requires one routed
or unreachable outcome for every planned gate before finalization. Core
ignores unknown gates, gate-mismatched routes, and non-finite/negative
distances; an empty or fully-invalid set returns `null`, so caller retains
last valid route rather than crashing.

**Cost boundary (no double counting)**:

```
Provider owns:  outside route distance to providerRouteTargetCoordinate only
Core owns:      connector cost + gate penalty + internal destination cost
```

`providerRouteTargetCoordinate` is always the gate's own literal
coordinate, not a graph-discretized approach point — any provider can route
directly to an arbitrary lat/lng, so there is no snapping gap for core to
bridge. `connectorCostM` is therefore correctly `0` for every candidate
today; the field stays in the contract (rather than being omitted) because
the cost boundary requires it to exist as a real, core-owned line item, not
because a nonzero value is being withheld — inventing one with no surveyed
offset to back it would violate "do not invent graph connectivity." A
future provider integration that needs to route to a different point than
the gate's own coordinate is exactly what this field exists for.

**Narrow per-gate offline OSM candidate resolver — `RoutingServiceV2.resolveOfflineOsmOutsideCandidate(userCoordinate: AppCoordinate, gateId: string): OfflineOsmOutsideCandidate | null`**

Produces raw route data for exactly one gate using bundled street graph.
Production OSM adapter normalizes each result into a
`NormalizedOutsideCandidate`, builds an `OutsideRouteCandidateSet` (one call
per `plan.candidates` entry), and runs it through the *same*
`finalizeOutsideRoutingPlan`, regardless of whether distances came from a
network provider or this offline graph. Returns `null` outside the bundled
graph's 3km radius or when the gate has no street connector — never throws.
Its `outsideDistanceM` is the street graph's full user -> gate distance
(nearest street node + graph traversal + that graph's own internal
node-to-gate connector, e.g. ~15m for Gate 12) — intentionally *not* split
out as a separate `connectorCostM` (which stays `0` here too), since folding
it into `outsideDistanceM` is what avoids double-counting the street
graph's own connector.

**Manual gate, initial routing, and rerouting**: `manualGateId` on
`prepareOutsideRoutingPlan` narrows `plan.candidates` to exactly that one
gate before any cost comparison happens — the same authoritative-override
guarantee `resolveStartCandidates`'s `'gate'` branch already provides for
the default flow, so a provider layer can never override a manual choice by
supplying a cheaper-looking alternative candidate for a different gate (it
isn't in `plan.candidates`, so `finalizeOutsideRoutingPlan` ignores it).
Initial routing and rerouting need no separate code path: calling
`prepareOutsideRoutingPlan`/`finalizeOutsideRoutingPlan` again with a fresh
`userCoordinate` on each reroute tick applies the identical eligibility and
cost policy as the first call, the same way repeated `calculateRoute` calls
already do for the default flow. Retaining the current valid route when a
replacement fails is the caller's responsibility (both phases return `null`
cleanly on failure, never throw, specifically so a caller can detect that
and keep its last-known-good preview).

**Owner-approved manual gate options**: no new API was needed —
`getRoutableOfficialGates()` (`src/data/ijtema/entryPolicy.ts`, already
exported from `src/data/ijtema`'s barrel) already returns exactly the
routable, connected, outside-startable official gates a manual-selection UI
should offer; it is the same list `prepareOutsideRoutingPlan` filters from.

**Test coverage**: `scripts/test-core-provider-routing-contract-v2.ts` —
plan preparation returns eligible candidates (and excludes disconnected
gates / includes Gate 12), finalization selects by complete journey (not
raw outside distance — a deliberately inverted synthetic scenario using two
real gates), exact `selectedOutsideCandidateId` / matching outside+internal
gate, no double counting (exact-sum equality on `routeCostM` and
`startConnectorDistanceM`), manual override remains authoritative even when
a cheaper alternative candidate is supplied, stale/unknown/invalid
candidates rejected safely (`null` or partial-success, never a throw), and
initial/reroute parity cross-checked against `calculateRoute` itself using
the offline OSM resolver as the "provider" for two different coordinates.

## Performance (host/Node measurements — not Android/Hermes)

Measured on this development host, 200 repetitions per case unless noted, on
the branch's original (pre-Gate-12) implementation — the extra per-route
work Gate 12 adds is one more `O(candidate gates)` internal-graph search
(now 14 routable/outside-eligible gates instead of 13), well within the
existing measured range below; these numbers were not re-run after adding
Gate 12; the shape of the cost is unchanged. Graph sizes at measurement
time: internal venue graph 289 nodes, bundled OSM street graph 7,945 nodes,
17 routable/outside-eligible candidate gates (18 gates / 290 internal nodes
/ 14 routable-outside-eligible after Gate 12 was added).

| Case | Beeline (median / p95 / max) | Street mode (median / p95 / max) |
|---|---|---|
| Warm repeated, counterexample | 0.15ms / 0.36ms / 6.2ms | 5.48ms / 7.52ms / 11.0ms |
| Reroute-equivalent repeated | 0.14ms / 0.40ms / 5.3ms | 5.26ms / 7.54ms / 9.8ms |
| Cold, counterexample (NE) | 1.7ms | 13.4ms |
| Cold, North | 0.2ms | 10.7ms |
| Cold, South | 1.6ms | 8.5ms |
| Cold, East | 0.2ms | 13.3ms |
| Cold, West | 0.4ms | 8.1ms |

Street mode is roughly an order of magnitude slower than beeline per route
calculation (the extra street-graph A* run plus up to 17 small internal
pre-computations), but stays single-digit-to-low-double-digit milliseconds —
well within a synchronous call budget. No optimization was made beyond this
change; none appeared necessary from these numbers. **These are Node
measurements only — they do not establish Android or Hermes runtime
performance**, consistent with CLAUDE.md's guidance not to claim
device-level results from host benchmarks.

## Source default: OSM street routing is ON

`MapFeatureFlagsService.useOutsideStreetGraph()` now defaults to `true` when
`EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` is unset (approved product
policy). Explicit `false`/`0`/`no`/`off` remains a working rollback to
beeline-only outside routing. `.env.example` was intentionally **not**
edited — it is owned by a separate integration track (consolidated provider
configuration) and may still show this flag as `false` in its template,
which is now stale relative to the actual source-code fallback. See
"Cross-track interfaces" below.

Flipping this default changes real route geometry/distances for any outside
route that doesn't explicitly pin the flag (real street distance instead of
straight-line, per-gate non-uniformly so). Running the full 111-script
`npm test` suite after the flip surfaced five tests with implicitly
beeline-shaped expectations; each was either pinned to beeline mode
(where that was specifically what it tested — an exact historical gate pick,
a straight-line-only approach distance, or the single beeline approach
instruction) or generalized to derive its expectation from the actual
selected gate instead of a hardcoded one. None indicated an algorithm defect
— see the `config: enable offline street routing by default` commit message
for the itemized list.

## Superseded documents

- `docs/OUTSIDE_ROUTING_ARCHITECTURE_DECISION.md` — its recommended flow
  (step 5) assumed gate-selection *policy* would stay unchanged when street
  routing was added ("same gate-selection policy as today... now
  road-following"). That assumption is what turned out to be the bug this
  document fixes. The rest of that document (Option B vs. Google Directions
  evaluation, offline-first reasoning) is unaffected and remains historically
  accurate context for *why* an offline street graph was built at all.
- `docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md` — its radius (3km), sanity cap
  (1.8x), fallback table, and data pipeline decisions are unchanged and
  remain authoritative. Its UX-flow step 5 ("same gate-selection policy as
  today... now road-following once within 3km") is superseded by this
  document for the *selection algorithm* specifically.
- `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md` — its eligibility rules (which gates
  are offered at all) remain authoritative and unchanged. Its "nearest
  official gate" phrasing described the *eligibility* flow, not the
  cost-minimization objective; this document is now the reference for how
  the winning gate among eligible candidates is actually chosen.

## Combined integration status

- `.env.example` and source fallback both enable outside street routing.
- Provider integration calls `RoutingServiceV2.prepareOutsideRoutingPlan`
  once per routing/reroute request, computes normalized `distanceM` per candidate
  from your provider (never add connector/penalty/internal cost, never pick
  a winner), and call `RoutingServiceV2.finalizeOutsideRoutingPlan` with the
  results — see "Core/provider outside-routing contract" above for the exact
  signatures. Use `RoutingServiceV2.resolveOfflineOsmOutsideCandidate` for an
  offline fallback through the same `finalizeOutsideRoutingPlan` call. Use
  `getRoutableOfficialGates()` for manual-gate-selection UI options. Exact
  normalized contract and request lifecycle are documented in
  `docs/HYBRID_PROVIDER_CORE_INTEGRATION.md`.
- Core implementation stayed
  entirely inside `src/data/ijtema/gates.ts`, `src/data/ijtema/dataIssues.ts`,
  `src/data/ijtema/streetGraph.ts` (generated), `src/services/RoutingServiceV2.ts`,
  `src/services/OutsideStreetRoutingService.ts`,
  `src/services/MapFeatureFlagsService.ts`, and routing-specific test scripts.

## What was not verified

Per CLAUDE.md's runtime-status guidance: passing TypeScript/lint/the full
test-script suite does not establish Android/Hermes runtime correctness or
production readiness. No physical-device or emulator QA was performed for
this change — that remains a separate, still-pending gate.

The core/provider outside-routing contract (`prepareOutsideRoutingPlan` /
`finalizeOutsideRoutingPlan`) was tested with real venue data end-to-end,
including a parity cross-check against `calculateRoute`, but this core-track
report only used `resolveOfflineOsmOutsideCandidate` as its provider. Hybrid
mobile integration was added later and is documented in
`docs/HYBRID_PROVIDER_CORE_INTEGRATION.md`; deployed proxy and real Google
Routes behavior remain unverified.
