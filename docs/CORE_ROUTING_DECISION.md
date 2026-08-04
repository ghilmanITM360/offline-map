# Core Routing Decision: Complete-Journey Gate Selection

Status: **Implemented.**

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
| Gate 13 | 24.963718 | 67.006862 |
| Gate 14 | 24.965516 | 67.007675 |

Both are now `status: 'provided'` (previously `'needs_verification'`) in
`src/data/ijtema/gates.ts`, distinct locations (~216m apart, vs. ~5m in the
originally supplied dataset), each confirmed to connect to the internal
graph (Gate 13 -> `R6-09`-adjacent node, Gate 14 -> its existing connector
node, both well within the 320m `GATE_CONNECTOR_MAX_M` threshold) and to the
bundled OSM street graph (regenerated after the coordinate change).

**Gate 12 was explicitly out of scope for this change** and was not added.
It has no record at all in `src/data/ijtema/gates.ts` (the file jumps
`gate(8, ...)` -> `gate(13, ...)`), and five existing tests assert it must
not exist (`test-map-data-v2`, `test-public-map-labels-v2`,
`test-gate-marker-rendering-v2`, `test-map-visual-emphasis-v2`,
`test-home-filter-chips-v2`). Adding it would require a new gate entity
(name/aliases/entry policy — none of which were specified) and touches more
tests than a coordinate update. The project owner confirmed skipping Gate 12
for this track; creating it is a separate, explicitly-scoped follow-up if
still wanted.

## Gate 13 / 14 penalty removal

The 120m `needs_verification` penalty
(`OutsideStreetRoutingService.NEEDS_VERIFICATION_GATE_PENALTY_M` /
`gatePenaltyM`) and the presentational "This gate needs verification before
navigation." warning (`V2PlaceAdapter`'s `gateVerificationWarning`) are both
purely `gate.status === 'needs_verification'`-driven, general mechanisms —
not hardcoded to Gate 13/14 by ID. Updating both gates' coordinates and
dropping their `needs_verification` status removes the penalty and warning
for them as a direct consequence; no gate today carries `needs_verification`.
The mechanism itself is still fully intact and tested (now via a synthetic
gate in `test-gate-verification-warning-v2.ts`, so it isn't coupled to real
Gate 13/14 data) — it will apply correctly again if a future gate's
coordinates need the same "not yet verified" treatment. No other gate's
penalty, the disconnected-gate check, or outside-entry eligibility were
touched.

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
cost is `O(candidate gates)` extra small internal-graph searches (17 gates
against the ~289-node venue graph, each `findBestPath`) run once per route
calculation, before the street search — see performance numbers below.

## Performance (host/Node measurements — not Android/Hermes)

Measured on this development host, 200 repetitions per case unless noted.
Graph sizes: internal venue graph 289 nodes, bundled OSM street graph 7,945
nodes, 17 routable/outside-eligible candidate gates.

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

## Cross-track interfaces needed from Codex

- `.env.example` still documents `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH=false`.
  The source-code fallback is now `true`. Recommend updating the example
  file's default to `true` (or adding a comment noting the source default)
  as part of Codex's consolidated provider-configuration work, to avoid a
  new local `.env` silently disagreeing with production behavior.
- No other cross-track interface changes were needed. This work stayed
  entirely inside `src/data/ijtema/gates.ts`, `src/data/ijtema/dataIssues.ts`,
  `src/data/ijtema/streetGraph.ts` (generated), `src/services/RoutingServiceV2.ts`,
  `src/services/OutsideStreetRoutingService.ts`,
  `src/services/MapFeatureFlagsService.ts`, and routing-specific test scripts.

## What was not verified

Per CLAUDE.md's runtime-status guidance: passing TypeScript/lint/the full
test-script suite does not establish Android/Hermes runtime correctness or
production readiness. No physical-device or emulator QA was performed for
this change — that remains a separate, still-pending gate.
