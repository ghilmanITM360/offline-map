# Outside Routing Architecture Decision

Status: **Analysis only. No code changed.**

Date: 2026-07-18

Builds on: `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md`. That audit found outside→gate *policy* (gate filtering, cost function) already built in `RoutingServiceV2`/`EntryGateRoutingService`; the open gap is the outside→gate *road geometry* — today a straight line (`selectOutsidePath` in `src/services/RoutingServiceV2.ts:418-458` computes `distanceMeters(startPoint, gate.coordinate)` directly, no path). Confirmed again this pass: `pathCoordinates` (line 411) only ever emits the raw start coordinate plus internal graph nodes — the outside leg is two points, one straight segment, rendered in the same `#1A73E8` polyline as the inside route (`NavigationScreen.tsx:284-286`). This doc decides how to close that gap.

---

## Option A: Google Directions API (walking)

Call Directions API at route-calc time for the outside leg (user GPS → chosen gate), get back a road-following polyline + turn steps, stitch onto the existing internal-graph route at the gate node.

## Option B: Offline OSM road graph

Bundle an OSM extract for the area surrounding the venue (bounded radius, not city-wide), build a walkable street graph analogous to `navigationGraph.ts`/`graphBuilder.ts`, extend the existing Dijkstra engine (`findBestPath`) to route across it, with gates as graph nodes shared between the street graph and the venue graph.

---

## Evaluation

**1. Development effort**
- A: Medium-low. New network service (`GoogleDirectionsService`), key/quota handling, response parsing, error/timeout states. `RoutingServiceV2.calculateRoute` is synchronous today — this forces an async path with loading/error UI that doesn't currently exist.
- B: High. New data pipeline (OSM extract → filtered walkable-ways graph, akin to a bigger `graphBuilder.ts`), loader, on-device pathfinding scale validation (current Dijkstra is sized for ~150 venue nodes, not thousands of street-segment nodes), homegrown turn-instruction generation for street geometry (bearing-angle detection, extending the pattern `generateInstructions` already uses internally).

**2. App size impact**
- A: ~0 bundled size. Maybe a small polyline-decode dependency.
- B: Non-zero but bounded — extract is a fixed radius around one fixed venue, not a city. Filtered to walkable ways only, a few MB is realistic. Confirmed no `.pbf`/`.osm`/`.mbtiles` currently in repo — this is new bundled weight either way something gets built.

**3. Runtime performance**
- A: Network round-trip per request (100ms best case, multi-second under congestion). No caching layer exists today for external calls — every recalculation is a fresh hit.
- B: On-device Dijkstra, same engine already proven fast for the venue graph. Street-level node count will be materially larger than 150; needs a benchmark pass, but bounded-radius extract keeps it in the thousands, not tens-of-thousands — likely fine, unverified until built.

**4. Offline capability**
- A: **None.** Hard-fails with no connectivity. This is the wrong failure mode for exactly the scenario that matters most: a mass gathering, where cellular congestion from tens of thousands of concurrent phones is a known, common failure condition — the moment routing is needed most is the moment it's likeliest to fail.
- B: Full. Matches the app's existing offline-first identity end to end (CLAUDE.md: "Offline-first React Native app").

**5. Accuracy**
- A: High — Google's road/sidewalk data is continuously maintained, real-world walking directions out of the box.
- B: Bounded by OSM data quality for that specific area, and by the team's own QA. Not hypothetical — this session already fixed a real bundled-geometry bug (`RASTA_06_OUT_OF_ORDER_POINTS`, `dataIssues.ts:42-50`) in the *existing* hand-curated venue graph. An OSM street extract adds a second dataset needing the same verification discipline.

**6. Maintenance**
- A: Low data-maintenance (Google owns the map), but ongoing key rotation, quota monitoring, cost tracking.
- B: Team owns the extract long-term — re-pull if roads near the venue change (plausible for an annual event on a large ground with year-to-year site changes), track known issues the same way `dataIssues.ts` already does for venue data.

**7. Cost**
- A: Per-request billing, scales with concurrent users. At mass-gathering scale (attendance in the tens/hundreds of thousands), this is a real recurring cost with a spike profile matched to the single highest-traffic day of the year — worst-case cost timing.
- B: One-time engineering cost to build the pipeline. ~Zero marginal cost per user after that.

**8. Integration with current `V2NavigationAdapter`**
- A: `V2NavigationAdapter.fromPreview` (`src/services/V2NavigationAdapter.ts:211-227`) reads `startResolution.mode === 'outside'` off an already-computed `RoutePreviewV2` — fine either way, since it consumes a finished preview. The friction is upstream: `RoutingServiceV2.calculateRoute` is synchronous and called straight from `DirectionsViewModel`; Option A forces that call chain to become async, touching more of the stack than the adapter itself.
- B: No shape change needed anywhere. `selectOutsidePath` already calls `findBestPath([gate.id], destinationNodeIds)` for the *inside* leg — extending it to also call `findBestPath` for the *outside* leg (user's nearest street node → gate node) is the same function, same engine, same synchronous contract. Cleanest integration of the two by a wide margin.

**9. Polyline merging complexity**
- A: Real complexity. Google's endpoint near the gate won't exactly equal the gate's stored coordinate (independent snapping), so the outside polyline and internal polyline need a stitch/snap step at the join, plus decoding Google's encoded polyline format into the app's `{lat,lng}` shape.
- B: Trivial. Gate is a literal shared node between the street graph and the venue graph (same coordinate, same node record) — the two path segments concatenate with zero mismatch, using the existing `pathCoordinates`/`appendCoordinate` dedup logic (`RoutingServiceV2.ts:400-416`) unchanged.

**10. Turn-by-turn instruction support**
- A: Rich, native-quality instructions with real street names, free from the API.
- B: Must generate instructions from graph edges — same bearing/turn-detection approach the internal graph likely already needs, extended to street segments. Requires street names tagged from OSM for the instruction text to read naturally; more homegrown, lower ceiling than Google's copy, but achievable — pattern already exists (`generateInstructions`, `prependOutsideApproachInstruction`).

---

## Recommendation

**Option B (bounded offline street graph), not Option A**, as the primary path.

Reasoning, in order of weight:
1. Offline capability is not a nice-to-have here — it's the app's stated identity (CLAUDE.md), and the one scenario where Option A fails hardest (mass-gathering cellular congestion) is the one scenario this app absolutely cannot fail in.
2. The outside area isn't general-purpose city routing — it's a small, fixed, bounded radius around one fixed venue. That's exactly the shape of problem an offline extract handles well and cheaply; the usual objection to Option B ("can't offline-route the whole world") doesn't apply here.
3. Integration and polyline-merge cost is dramatically lower for B — same Dijkstra engine, same synchronous contract, gate as literal shared node. A forces a new async boundary into a codebase that has none today for routing.
4. Cost profile of A is worst-case-shaped: heaviest billing on the single highest-traffic day, with no offline fallback if it fails then.

Where A still has a case: if the bounded-extract build turns out to badly miss real-world walkability (e.g., roads changed since the last OSM pull) and a fast patch is needed before the graph can be re-verified, A could serve as a narrow, connectivity-gated *fallback* for the outside leg only — never the primary path, and only if the app already has a "no connectivity" detection path (it does — `ConnectivityService` exists today per the earlier audit). Not recommending building this now; flagging it only as a documented option, not a phase.

---

## Recommended Flow (mapped to stated goal)

1. **Open app** — no change.
2. **Select Block B25** — no change (`SearchService`/`V2PlaceAdapter`, already works).
3. **See current location** — no change (`GPSManagerService`, already works).
4. **See highlighted walking route** — `selectOutsidePath` extended: instead of `distanceMeters(startPoint, gate.coordinate)` as the connector cost, run `findBestPath` from the user's nearest street-graph node to the gate node over the new bounded OSM graph; render that leg in a distinct color from the inside leg (audit already flagged single-color rendering as a separate, smaller gap — two-color split is cheap regardless of A/B choice).
5. **Reach nearest gate** — same gate-selection policy as today (`routingStatus === 'routable' && canStartRouteFromOutside`), now road-following instead of beeline.
6. **Continue inside Ijtema** — unchanged, internal graph already handles this.
7. **Receive arrival** — unchanged, arrival geofence already exists (`NavigationScreen.tsx`).

Net: steps 1, 2, 3, 6, 7 need **no change**. Step 5's *policy* needs no change. Only step 4's *geometry* is the actual build — which is the same conclusion the prior audit reached, now with an explicit choice of how to build it.

---

## What Would Need To Be Built (Option B, if approved)

1. Define bounded extraction radius around the venue perimeter.
2. Pull/filter OSM data to walkable ways within that radius.
3. Build a loader producing a graph shape compatible with the existing node/edge model (`navigationGraph.ts` pattern), with gates as shared nodes between this graph and the venue graph.
4. Bundle the resulting graph as a static TS/JSON source file, same "no generated/checksum source, this file is truth" convention CLAUDE.md already mandates for `src/data/ijtema/*`.
5. Extend `selectOutsidePath` to call `findBestPath` against the new graph instead of `distanceMeters`.
6. Benchmark Dijkstra at the new node count; only then confirm no engine change needed.
7. Extend instruction generation to street edges (turn detection + street-name text).
8. QA pass on the new dataset — same discipline as `dataIssues.ts` already applies to venue data.
9. Two-color polyline split + persistent gate marker during outside navigation (small, independent of A/B).
10. Distance sanity cap on the outside leg (independent gap noted in the prior audit — worth fixing regardless of which option ships).

---

*No code was modified for this decision. Recommendation: proceed with Option B, scoped to a bounded extract. Awaiting approval before implementation.*
