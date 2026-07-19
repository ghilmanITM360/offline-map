# OSM Data Validation Report — Karachi Ijtema Outside Street Graph

Status: **Phase 0 complete. Real data pulled and analyzed. No production code changed.**

Builds on: `docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md` (approved). This report validates that spec's assumptions against a real OSM extract before Phase 1 implementation begins, per the approved gate: "Do not implement until OSM validation report is complete."

Date: 2026-07-18

---

## 1. Methodology

- Source: live Overpass API query (`https://overpass-api.de/api/interpreter`), not synthetic/estimated data.
- Query: all `highway=*` ways (excluding motorway/trunk classes) within `around:3000` of venue center **(24.971698, 67.006464)** — the centroid of the 17 known gate coordinates.
- Raw response: 3,753 way elements, 2.33 MB JSON, HTTP 200, no truncation, no retry needed.
- Deduplicated into a graph (vertices rounded to ~1e-6°, shared intersection points merged) and analyzed for node/edge count, connectivity, orphan nodes, tag coverage, and gate-snap distance for all 17 gates with known coordinates.
- Reviewed by four specialist passes against the real numbers: Routing Algorithm, Performance, Integration, QA.

Raw data, query, and analysis script are in the session scratchpad (not committed — this was a research pass, not a data pipeline deliverable).

---

## 2. Raw Results

| Metric | Value |
|---|---|
| Ways (raw) | 3,753 |
| Raw vertices | 22,382 |
| Deduplicated nodes | **14,376** |
| Deduplicated edges | **18,629** |
| Degree-0 nodes (bug check) | 0 |
| Degree-1 nodes (dead ends) | 1,115 (7.8%) |
| Connected components | 6 |
| Largest component | 14,181 nodes (98.64%) |
| Other components | 143 / 32 / 10 / 5 / 5 nodes |
| Ways with `tags.name` | 42 / 3,753 (1.12%) |
| `highway=construction` ways | 1 |

**Highway tag distribution:** residential 3,541, tertiary 90, service 50, primary 23, secondary 18, living_street 16, unclassified 11, track 2, tertiary_link 1, construction 1. No `footway`/`path`/`pedestrian`/`steps`/`cycleway` tags exist in this radius — pedestrian movement here is modeled entirely via the vehicle road network, which is normal for this part of Karachi (no separately-mapped foot infrastructure to lose).

**Gate snapping** (nearest OSM vertex, haversine, vs. existing `GATE_CONNECTOR_MAX_M = 320` convention from `src/data/ijtema/graphBuilder.ts:37`):

All 17 known gates (GATE_01–05, 07, 08, 13–22) snap into the largest component at **3.9m–27.5m** — every gate passes with 10x+ margin under the 320m threshold. Worst case: GATE_02 at 27.51m. Best case: GATE_05 at 3.93m. (Gates 06, 09–12 have no coordinate in the dataset and are out of scope, unchanged from before.)

---

## 3. Validation Criteria — Verdict

| Criterion | Verdict | Notes |
|---|---|---|
| Walking roads exist | **PASS** | Dense residential-grid vehicle network is the correct substrate for this area — no sidewalks exist to separately map |
| Gate snapping possible | **PASS** | 17/17, all ≤27.5m, 10x+ margin under 320m convention |
| Expected node count | **RECALIBRATED** | Real count (14,376) is ~4x the pre-data estimate (~3–3.5k). Not a defect — the prior number was a guess made before any real pull. Downstream size/perf estimates built on the old number must be redone (see §5). |
| Graph connectivity | **PASS** | 98.64% single component; no gate touches the other 5 |
| Orphan nodes | **PASS** | 0 degree-0 (no extraction bug); 1,115 degree-1 dead-ends is normal for a real residential grid |
| Disconnected roads | **PASS, with required action** | 5 clusters / 195 nodes (1.36%) don't block any gate, but must be explicitly excluded at pipeline build time, not left inert (silent-regression risk if a future gate ever snapped near one) |
| Road names availability | **FAIL against "names for turn-by-turn"** | 1.12% coverage. Does not block Phase 1 (pathfinding needs geometry, not names) — constrains turn-by-turn design instead (see §5) |

**Overall Phase 0 verdict: PASS WITH CONDITIONS.**

---

## 4. Specialist Findings

**Routing Algorithm Agent** — Heap-based A* (haversine heuristic) is still the right algorithm family at 14,376/18,629 scale; per-query cost (~18.6k edges × log V) is fine on-device. But three things move from "recommended" to **mandatory before Phase 1**:
1. Degree-2 pass-through node collapse (standard OSM graph simplification) — biggest single lever, do first.
2. Replace the 17x gate fan-out with one multi-source search seeded from all candidate gates — at 289 nodes this was cheap even unheaped; at 14k+ it's the single biggest scaling risk.
3. Replace linear-scan nearest-node lookup (`findNearestNode`/`nearestNodeFromSet`, currently O(n), runs every reroute tick) with a grid-bucket spatial index. No k-d tree needed at this scale/shape.

**Performance Agent** — Unsimplified, the graph breaks the "bounded, cheap, offline-first" premise the feature was approved on: ~550–750 KB bundled (flat-array encoding), 150–350ms parse+adjacency-build on a budget Android device (past the 16ms frame budget — needs deferral via `InteractionManager`/idle callback), ~2–4 MB resident memory. Degree-2 simplification is expected to bring size back down to roughly 250–400 KB, closer to the original 300–500 KB premise. Also flags that pure lazy-loading (defer until first use) is necessary but likely not sufficient at this scale — recommends considering corridor/tile-based loading (only the cell(s) between user and nearest gate) instead of the full 3km disc, as an open design question for the street-graph-builder step, not a blocker before it.

**Integration Agent** — Don't force a literal zero-distance shared node at gates; synthesize a short connector edge (3.9–27.5m) from the gate's canonical coordinate to its nearest OSM vertex, mirroring the existing `GATE_CONNECTOR_MAX_M` pattern exactly. Turn-by-turn should default to bearing/turn-angle + distance phrasing ("Turn right in 40m") and only append a street name for the ~1.1% of segments that have one — never require a name. The 5 disconnected clusters must be explicitly pruned at generation time. Connector distance must be kept out of the 1.8x sanity-cap ratio (cap applies to `path.costM` only, not `connectorDistanceM` or `gatePenaltyM`) — a gate with a 27m connector shouldn't spuriously trip the cap on a short destination leg. Also: verify the outside street graph's per-gate connectivity doesn't get confused with the internal graph's separate disconnected-gate messaging (GATE_03/17/18/19) — the two connectivity states must stay independently gated in `NavigationScreen`.

**QA Agent** — **PASS WITH CONDITIONS.** Conditions: (1) explicitly exclude the 5 disconnected clusters from the routable graph, (2) exclude the 1 `highway=construction` way by default (a road under construction may not be currently passable — safety issue, not just data hygiene), (3) re-check app size/memory/offline-storage budgets against the real 14,376/18,629 numbers before Phase 1 locks in perf targets, (4) turn-by-turn design must plan for distance/direction-based phrasing as the default, not street-name-based.

---

## 5. Impact on the Approved Final Spec

Compared to `docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md`, real data changes or firms up the following (decisions already made in that doc — offline beeline fallback beyond 3km, 1.8x sanity cap on graph-routed segments only — are unaffected and stay as approved):

- **Node/edge count**: 3,000–3,500 (estimate) → 14,376/18,629 (measured), expected to reduce to roughly 3,000–8,000 after mandatory degree-2 simplification (agents' estimates ranged 3k–8k; exact number only known once the simplification pass is actually built — treat as a measurement to take during Step 4, not a number to plan around yet).
- **Bundle size**: ~300–500 KB (estimate) → ~550–750 KB unsimplified, ~250–400 KB expected post-simplification.
- **Gate fan-out fix**: was "recommended," now **mandatory prerequisite** — must land before street-graph routing is wired in, not after.
- **Nearest-node spatial index**: new requirement, not explicitly called out in the prior spec — needed because live reroute nearest-node snapping was previously sized for 289 nodes.
- **Turn-by-turn instruction strategy**: previously open ("street names via `LocalizedLabel`" assumed availability) — now resolved concretely: bearing/turn-angle + distance as the default, name appended only when present (1.1% of segments).
- **Gate connector mechanism**: now specified precisely — synthesized short connector edge per gate (reusing `GATE_CONNECTOR_MAX_M` pattern), not a literal shared-node assumption.
- **New open question, not yet decided**: corridor/tile-based loading vs. full-3km-disc lazy load. Flagged by the Performance agent as worth deciding before the street-graph-builder step (Step 4 below); does not block Steps 1–3.

---

## 6. Conditions for Phase 1 (consolidated)

1. Degree-2 pass-through node simplification — mandatory, do first among data-pipeline work.
2. Multi-source gate search replacing the 17x fan-out — mandatory before street-graph routing goes live.
3. Grid-bucket spatial index for nearest-node lookup — mandatory before live reroute uses the street graph.
4. Explicitly exclude the 5 disconnected clusters (195 nodes) at pipeline build time.
5. Explicitly exclude `highway=construction` ways (and other lifecycle tags like `proposed`/`disused` if encountered) by default.
6. Gate connectors as synthesized edges, not literal joins; connector distance excluded from the 1.8x sanity-cap ratio.
7. Turn-by-turn instructions default to bearing/distance phrasing; street name appended only when available.
8. Corridor/tile loading vs. full-disc lazy load — decide during Step 4 (street graph builder), not blocking Steps 1–3.

---

## 7. Verdict

**PASS WITH CONDITIONS.** Real data confirms the core premise (walkable roads exist, all 17 gates snap cleanly, graph is one connected blob) but at ~4x the assumed scale, which upgrades three previously-optional optimizations to mandatory prerequisites and firms up two previously-open design questions (gate connector mechanism, turn-by-turn default phrasing). One design question (corridor/tile loading) remains open and is scheduled for the street-graph-builder step, not blocking algorithm work.

Phase 1 implementation may proceed in the approved order (MinHeap → A* → gate fan-out fix → street graph builder → OSM generated graph → RoutingServiceV2 integration → polyline split → turn-by-turn → runtime QA), with conditions 1–3 folded into steps 1–3, conditions 4–6 folded into steps 4–5, condition 7 folded into step 8.
