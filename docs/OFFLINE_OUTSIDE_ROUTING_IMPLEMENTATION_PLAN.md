# Offline Outside Routing — Implementation Plan

Status: **Planning only. No code changed.**

Date: 2026-07-18

Builds on: `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md` (architecture audit) and `docs/OUTSIDE_ROUTING_ARCHITECTURE_DECISION.md` (Option B — bounded offline OSM street graph — selected over Option A, Google Directions API). This doc plans **how** to build Option B: radius, routing engine, data pipeline, exact integration points, turn-by-turn design, and QA plan. Produced via 5 parallel specialist passes (GIS Engineer, Routing Algorithm Engineer, React Native Architect, Performance Engineer, QA Engineer) over the live codebase.

**Correction to prior docs**: the internal venue graph is **289 nodes / 323 edges**, not ~150 as earlier docs assumed (measured directly via `buildNavigationGraphV2()`). Breakdown: `block_entry` 168, `rasta_point` 72, `special_route_point` 20, `gate` 17, `central_point` 12; edges: `block_connector` 168, `rasta` 59, `intersection_connector` 53, `gate_connector` 13, `special_route` 17, `central_connector` 12, `perimeter_connector` 1. Avg node degree 2.24, max 8.

**New finding, not in prior docs**: the current outside-routing code path already has a serious, pre-existing performance problem, independent of whether a street graph is ever added — see §2 and §4 below.

---

## 1. OSM Extraction Radius: 3km

Rejecting 1km and 10km; 5km as documented fallback.

- **1km — too tight.** The 17 gates themselves already span lat 24.9647–24.9754, lng 66.9980–67.0149 — roughly 1.3km × 1.9km. A 1km radius from a central point barely clears the gate ring itself (~0.3–0.5km buffer beyond the outermost gates), leaving no room for realistic remote-parking-to-gate walks, which mass gatherings routinely require once vehicle access near gates is restricted on event day.
- **3km — recommended.** From a central reference point (~24.9693, 67.0038), buffer beyond the outermost gates is ~1.7–2.4km in every direction — matches documented pedestrian-catchment norms for large event venues (ideal ~800m, tolerated up to ~1.5–2km when vehicle access is constrained, exactly this scenario). Keeps the "bounded, not city-wide" premise that justifies Option B over Option A in the prior decision doc intact.
- **5km — fallback only.** Buffer ~4.35km beyond venue edge — beyond normal walking catchment for most attendees; mostly captures roads people *drive*, not walk, meaning much of the extra data wouldn't be exercised by real pedestrian routes. Revisit only if real parking-zone placement for this specific ground turns out to sit farther out than 3km — an operational fact this plan can't verify from the repo.
- **10km — rejected.** City-scale, contradicts the bounded-radius rationale, multiplies node count, bundle size, Dijkstra cost, and OSM data-quality risk for a distance no one walks to a foot-entry mass gathering.

### Sizing at 3km (explicit assumptions, no live OSM pull performed)

- Circle area: π·3² ≈ 28.3 km².
- Assumed post-simplification usable graph-node density for this mixed arterial/semi-developed Karachi area: 80–150 nodes/km² (raw unsimplified OSM vertex density would be 3–5x higher — simplification, collapsing collinear shape-points to true intersections/bends, is the single biggest lever on final count and must not be skipped).
- Near-planar street graph, avg node degree ~2.4–2.6 → edges ≈ nodes × 1.2–1.4.

| Metric | Estimate |
|---|---|
| Nodes | 2,260–4,240 (central: ~3,000–3,500) |
| Edges | 3,600–4,900 (central: ~4,000–4,500) |
| vs. current internal graph (289/323) | ~10–15x larger |

### Serialized size / APK impact

- Per-node: ~120–160 bytes (id, `{lat,lng}`, type, optional street-name label). Per-edge: ~150–220 bytes (id, from, to, distanceM, bidirectional, pathType, optional street name).
- At central estimate (3,500 nodes / 4,500 edges): nodes ~490KB + edges ~830KB ≈ **~1.3MB raw**, likely **1.3–1.8MB as a TS source file** with keyed object literals (repo convention — human-reviewable, matches `gates.ts`/`blocks.ts` style). A compact tuple encoding (`[id, lat, lng, type]`) could cut this to ~500–800KB at a readability cost — flag as an open format decision, not a foregone conclusion.
- After gzip/APK compression (~70–80% typical reduction for this kind of repetitive keyed data): **~300–500KB actual APK delta** (or ~150–250KB with tuple encoding). For scale: `node_modules/react-native-maps` alone is 17MB unbuilt. **Not a meaningful app-size concern at 3km** — revisit only if radius is later pushed to 5–10km.

---

## 2. Routing Engine Decision: A* with haversine heuristic (not Dijkstra, not Bidirectional A*)

### Current state (confirmed by direct read, not assumption)

`calculateShortestPath` (`src/services/RoutingServiceV2.ts:276-340`) is **plain Dijkstra with an O(V) linear scan for extract-min** (`unvisited` as a `Set`, full scan every iteration, `RoutingServiceV2.ts:295-301`) — no binary heap. This is **O(V²) per single source→destination search**.

Worse, this single-pair search is called in **nested fan-out loops**, not once per route:
- `findBestPath` (`RoutingServiceV2.ts:342-356`) loops over every start-candidate × destination-candidate node (up to ~16 full Dijkstra runs for a 4×4 candidate set).
- `selectOutsidePath` (`RoutingServiceV2.ts:418-458`) — the exact code path for outside-venue routing — loops over **all 17 gates**, calling `findBestPath` separately per gate. A single outside→block route request can trigger **up to 17 × 4 = 68 full O(V²) Dijkstra executions**.
- A **near-duplicate second implementation** of this same O(V²) Dijkstra exists in `src/services/EntryGateRoutingService.ts:76-110` (`dijkstraCost`), used in its own gate×destination nested loop (`EntryGateRoutingService.ts:215-249`) — pre-existing tech debt, two independent files each reimplementing the same unoptimized algorithm.

**This is already a live performance problem today**, independent of the street graph: benchmarking the exact algorithm shape (ported verbatim, run on M1 Pro/V8 as an upper-bound reference, then scaled ~10x to approximate a mid-range Android/Hermes device — see §4 methodology) suggests today's 289-node graph likely already costs **~13ms per single Dijkstra call** on a mid-range device, and the 68-call outside-routing fan-out could already be costing **hundreds of ms to low seconds** on affected devices. This predates any street-graph work and should be fixed regardless of what else ships.

### Comparison for the new street graph (few-thousand nodes, single outside GPS origin → ≤17 fixed gate destinations)

**(a) Current Dijkstra, unmodified.** Zero build cost, but O(V²) scaling is catastrophic at street-graph scale: benchmark shows ~91.7x slower at n=3,000 vs n=289, and with the existing 17-gate fan-out unchanged, a single outside route request extrapolates to **~8 seconds on a fast desktop V8**, plausibly tens of seconds on a mid-range Android/Hermes device. Not viable without a rewrite regardless of algorithm choice.

**(b) A\* with haversine/geolib heuristic — recommended.** Precedent already exists in this exact codebase: legacy v1's `RoutingService.ts:323-394` (`aStar`) already uses `geolib`'s `getDistance` as an admissible heuristic — the concept has shipped before here (though its array-`.sort()` "priority queue" and `.find()`-based edge lookup must NOT be copied forward, only the heuristic-plus-edge-weight pattern). With a proper binary min-heap (new, self-contained, ~50-80 lines, zero new dependency) replacing both the naive queue and the O(V) scan, A* at a few thousand nodes with a haversine heuristic prunes aggressively toward the goal on a roughly-planar street grid, landing in low tens of ms per gate evaluation even on Hermes. Single-origin/few-destination is exactly A*'s sweet spot — Dijkstra's "shortest path to all nodes" property is wasted when only ≤17 destinations matter.

**(c) Bidirectional A*.** Meaningfully higher implementation risk: needs a reverse-adjacency structure (today's graph has one directional `adjacency` map plus a `bidirectional: boolean` edge flag, not a true reverse index), a frontier-meeting termination rule, and correct interaction with `weightMultiplier` gate penalties from both directions. Its ~2x speedup over unidirectional A* mainly pays off at tens-of-thousands+ nodes with long paths; at low-thousands nodes and short outside-to-gate distances (a few km at most, gates ring one venue), the added correctness risk isn't earning its keep here.

### Recommendation: A* + binary heap, plus fixing the fan-out

1. Build a small binary min-heap (new file, e.g. `src/utils/MinHeap.ts`) — required regardless of Dijkstra vs A*, since it's the actual O(V²)→O((V+E) log V) fix. Do this first; it's the single highest-leverage change.
2. Add the haversine heuristic on top (geolib already a dependency) — small, low-risk addition once the heap exists.
3. **Separately**, restructure `selectOutsidePath`'s gate fan-out: instead of 17 independent full graph traversals, run a **single multi-source search** seeded with all candidate gates simultaneously (or search once from the destination outward), picking whichever gate is reached cheapest. This is a bigger structural change than the algorithm swap and should be scoped as its own step — it's the difference between "1 fast search" and "17 fast searches," which still adds up.
4. Do NOT bring Bidirectional A* into scope now; the complexity isn't justified at this graph size.

### Impact on `calculateRoute`'s synchronous contract

Confirmed synchronous today (`RoutingServiceV2.ts:487`, no `async`/`await` anywhere in the file), called synchronously from both `V2DirectionsService.ts:117` (preview) and — critically — `NavigationViewModelV2.ts:128` (`attemptReroute`, on the **live navigation** critical path, triggered by GPS updates while walking). A slow synchronous call here doesn't just delay a button tap, it freezes the live nav UI mid-walk.

**Honest reality check on the prior decision doc's "stays synchronous" claim**: true only *conditional on* the algorithmic fixes above landing first. Marking `calculateRoute` `async` without fixing the O(V²) algorithm and the 17x fan-out just relocates the multi-second block into a Promise body — `await` doesn't yield mid-function without explicit yield points. Once the heap + single-search fixes land, a full outside-route calculation over a few-thousand-node graph should land in low tens of ms even on Hermes, genuinely fitting inside a synchronous call. Recommendation: fix the algorithm, keep `calculateRoute` synchronous; treat any remaining async need as scoped narrowly to lazy-loading the street-graph data module itself (§3), not the routing call.

---

## 3. Data Pipeline Design

```
OSM data → Processing script → Validation → Generated graph → React Native bundle
```

**OSM data (source)**: Overpass API query, `around:3000,<venue_centroid_lat>,<venue_centroid_lng>` filtered to `highway=*` ways — practical for a single bounded-radius pull, avoids downloading/clip-processing Geofabrik's full-country Pakistan `.osm.pbf` for one small area. This is a **development-time, occasional pull** (initial build + periodic re-pulls if roads near the venue change year to year, plausible for an annual event ground) — not a build-time codegen step in the app's build process, consistent with CLAUDE.md's "no generated/checksum source, TS files are the source of truth" rule for `src/data/ijtema/*`. The street graph is, notably, the **first data source in this repo that originates from an external, non-hand-curated dataset** rather than hand-supplied venue coordinates — worth calling out explicitly since it's a precedent shift, not just "more data."

**Processing script** (lives in `scripts/`, output hand-reviewed then checked in):
1. Fetch raw ways within the 3km bound.
2. Filter to walkable `highway` tags (`footway, path, pedestrian, living_street, residential, service, tertiary, secondary, primary, track`; `steps` handled separately/flagged); exclude `motorway`/`trunk`/`*_link` unless a `sidewalk=*` tag exists.
3. Convert OSM way-vertex chains into the existing `GraphNode`/`GraphEdge` shape (see §4), reusing `graphBuilder.ts`'s own haversine `distanceMeters` (`graphBuilder.ts:71-83`) and its `addEdge`/`edgeKey` dedup logic (`graphBuilder.ts:94-106`) to avoid duplicate parallel edges.
4. **Simplify**: collapse collinear intermediate shape-points to true intersections + significant bends. Biggest lever on final node/edge count — skipping this is the most likely way the §1 estimate balloons.
5. **Snap gates as shared nodes**: for each routable gate in `gates.ts`, find the nearest extracted street node within a threshold (mirror the existing `GATE_CONNECTOR_MAX_M = 320` pattern, `graphBuilder.ts:37,494`) and insert a connector edge — the gate becomes a literal shared node between street graph and venue graph, required for zero-mismatch polyline stitching (decision doc items 9/57).
6. **Clip strictly to the radius**: Overpass `around` queries can return partial ways crossing the boundary; drop or truncate edges whose endpoint falls outside the circle.
7. **Preserve OSM tags needed downstream**: `junction=roundabout` and `name`/`name:ur` must be threaded through to graph edge metadata (needed for §5).

**Validation** (new entries following the existing `DataIssue` shape, `src/data/ijtema/dataIssues.ts:8-51`):
- Connectivity: BFS/DFS from every routable gate node; flag any disconnected island (common at Overpass extract boundaries).
- Orphan nodes: degree-0 nodes after simplification dropped or flagged, not silently kept.
- Duplicate/self-intersecting edges: reuse `addEdge` dedup keying; add explicit self-intersection check (real-world OSM data is less curated than hand-placed rasta points).
- Gate presence: assert every `routingStatus === 'routable'` gate gets a connector edge within threshold; failures become new `DATA_ISSUES` entries (e.g. `GATE_XX_NO_STREET_CONNECTOR`, same pattern as existing `GATE_13_14_NEAR_DUPLICATE`).
- Distance-outlier check: flag any single edge beyond ~500m as a likely ordering/data bug — this project already caught exactly this class of error by hand (`RASTA_06_OUT_OF_ORDER_POINTS`, an ~863m anomalous edge from a coordinate-order bug); a 10-15x larger, machine-extracted graph needs this automated, not manually discovered.
- Manual/visual QA against satellite imagery — per CLAUDE.md, script/test-suite passes alone don't establish runtime readiness; this is new third-party geometry layered on hand-verified venue data.

**Generated graph**:
- New parallel type structure, **not** merged into `IJTEMA_NAVIGATION_GRAPH_V2`'s node/edge namespace (see §4 for why) — new files `src/data/ijtema/streetGraph.ts` (raw curated data), `src/data/ijtema/streetGraphTypes.ts` (types), `src/data/ijtema/streetGraphBuilder.ts` (builder, e.g. `buildStreetNavigationGraph()`), mirroring the existing `rastas.ts` + `graphTypes.ts` + `graphBuilder.ts` three-way split. `perimeterConnectors.ts`'s "internal graph-only bridge, NOT exported from index.ts" precedent applies here too — likely not re-exported wholesale from `src/data/ijtema/index.ts`.

**React Native bundle**: plain static `import`, same as every other `src/data/ijtema/*` file — **but lazy-loaded**, not eager like `IJTEMA_NAVIGATION_GRAPH_V2` (see §4 for why: most users route entirely within the venue and shouldn't pay this cost at app cold-start). Concretely: a dynamic `import()` or a lazily-invoked builder function triggered the first time `EntryGateRoutingService`/outside-detection logic determines the user is outside the venue, not a top-level module constant.

---

## 4. Integration Points — Exact Files

### `src/services/RoutingServiceV2.ts` (525 lines)

- **`calculateRoute`** (line 487) — `static calculateRoute(options: CalculateRouteV2Options): RoutePreviewV2 | null`, confirmed fully synchronous, no Promise anywhere in file.
- **`selectOutsidePath`** (lines 418-458) — **primary insertion point**. Line 435, `Math.round(distanceMeters(startPoint, gate.coordinate))`, is exactly what gets replaced with a street-graph shortest-path call. The per-gate loop (lines 428-455) is where the new pathfinder result needs to slot in as the "approach cost," and where the fan-out fix (§2) applies.
- **`selectDefaultPath`** (lines 460-484) — does NOT handle `outside_coordinate` starts (guarded out at line 495-497 dispatch); no change needed here for outside-gate routing. Note `startConnectorDistanceM` for `inside_coordinate` starts (lines 472-474) is also straight-line — analogous future gap, explicitly out of scope for this plan.
- **`findBestPath`** (lines 342-356) / **`calculateShortestPath`** (lines 276-340) — hardcoded closures over the module-level `IJTEMA_NAVIGATION_GRAPH_V2` constant (lines 289, 307), not parametrized by graph. A street-graph pathfinder needs to be a **structurally parallel, separate function** (e.g. `calculateOutsideShortestPath` over a new street adjacency map), not a modification of this one — genericizing `calculateShortestPath` to accept a graph parameter is an option but not required; a second implementation is consistent with existing repo style (`EntryGateRoutingService.ts` already has its own duplicate).
- **`pathCoordinates`/`appendCoordinate`** (lines 400-416) — exact splice point for street-graph polyline points. `SelectedRoutePath` (interface, lines 70-77) needs a new optional field, e.g. `outsideLegCoordinates?: AppCoordinate[]`, and `pathCoordinates` needs to append those before the internal-graph nodes.
- **`RoutePreviewV2`/`SelectedRoutePath`** (lines 47-77) — `startConnectorDistanceM` (line 54/75) becomes the real graph-path distance. No existing concept of "segments" distinguishing outside vs. inside leg in the flat coordinate array — new field needed (e.g. `outsideLegCoordinateCount?: number`) so `NavigationScreen.tsx` can split the polyline.

### `src/services/EntryGateRoutingService.ts` (356 lines)

Owns inside/outside classification (`isInsideIjtemaArea`, lines 171-173, backed by polygon/buffer geometry with an explicit warning against using rectangular map bounds, lines 158-160) and **a second, independent gate-selection algorithm** (`findBestGateForOutsideUser`, lines 215-258, its own Dijkstra `dijkstraCost` at lines 76-110 — duplicate of `RoutingServiceV2`'s). Confirmed: `RoutingServiceV2.calculateRoute` branches around `EntryGateRoutingService`'s selection entirely for `outside_coordinate` starts and calls `selectOutsidePath` directly — meaning **there are already two competing, redundant, both-haversine-based "best gate" selectors** in the codebase today, pre-existing tech debt.

**Decision for this plan**: insert the street-graph call into `RoutingServiceV2.selectOutsidePath` directly (the function that actually executes and produces the consumed `RoutePreviewV2`), not into `EntryGateRoutingService`. De-duplicating the two gate-selection implementations is a legitimate, larger refactor — flag as a follow-up, not in scope here.

### `src/services/V2NavigationAdapter.ts` (232 lines)

`fromPreview` (lines 188-231) is confirmed **almost fully insulated** — it purely reads `startResolution.mode === 'outside'` (line 211) and `startResolution.gate.id` (line 212) off an already-computed `RoutePreviewV2`, with no direct beeline/gate-selection math of its own. **No change required** as long as the street-graph output is folded into `RoutePreviewV2.coordinates`/`startResolution` upstream by `RoutingServiceV2` before reaching this adapter. One possible small addition: if a new `outsideLegCoordinateCount` field is added to `RoutePreviewV2`, confirm `V2ActiveRoute`'s type (`src/models/types.ts`) includes it, since `fromPreview`'s object spread (line 215) passes it through automatically — a type-only addition, not logic. If turn-by-turn instructions are needed for the outside leg (§5), `edgeForHop`/`edges` construction (lines 197-207) — currently internal-graph-only — would need a small extension to also check a street-graph adjacency map.

### `src/views/screens/NavigationScreen.tsx` (1194 lines)

Two render blocks, v1 (~201-330) and v2 (~575-710); the v2 block (relevant one) at **lines 655-668** renders the entire `route.coordinates` as one continuous shadow+accent `<Polyline>` pair (`rgba(13,71,161,0.72)` shadow + `#1A73E8` accent), no leg-splitting today. **Exact change**: split `route.coordinates` at the new `outsideLegCoordinateCount` boundary, render two coordinate slices — outside leg in a visually distinct style (suggest dashed or a different hue, e.g. gray/amber, signaling "not the venue's mapped interior") and inside leg keeping current blue — each still needing the existing shadow+accent double-Polyline treatment.

An existing static banner at **lines 717-721** (`route.metadata.startedOutside && route.metadata.entryGateId`) already shows "Route starts from {origin.label}" — natural extension point for a progress-aware "Next: reach {gate} — {distance}m" persistent marker, either as an updated banner (condition on still being on the outside leg) or as a `<Marker>` state extension on the existing gate-pill markers block (lines 647-653).

### Feature flags

`src/services/MapFeatureFlagsService.ts` (26 lines) exposes exactly 3 flags today, all `readFlag(envVar, defaultValue=true)`. Since the street-graph pathfinder lives entirely inside `selectOutsidePath`, already gated end-to-end by `EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING`, it does **not** need to piggyback on that flag's semantics wholesale. Recommend one **new, narrowly-scoped, default-OFF** flag as an internal kill-switch — e.g. `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH`, `readFlag(process.env..., false)` (the helper already supports a `defaultValue` override, `MapFeatureFlagsService.ts:8`) — used inside `selectOutsidePath` to fall back to today's beeline if false/unset. Lets the team ship and validate the street graph independently of the broader v2 routing rollout, defaulted off until the dataset is verified.

### Graph type reuse (`src/data/ijtema/graphTypes.ts`, 83 lines)

`GraphNode`/`GraphEdge` interfaces (lines 19-38) are structurally generic enough to represent OSM street nodes/ways without modification. **But `GraphNodeType`/`GraphEdgePathType` are closed string-literal unions** (lines 8, 10-17) with no street/OSM variant. Recommend **not** extending these unions or merging into `IJTEMA_NAVIGATION_GRAPH_V2`'s single namespace — venue-graph node IDs are curated, template-literal-typed (`B1_C2`, `R7-01`, `GATE_20`), while OSM node IDs are foreign/numeric; merging risks ID collisions and dilutes hand-curated invariants. Keep the street graph as a **separate parallel graph object** (new `StreetNavigationGraph` type, `metadata.source: 'osm_street_graph'` distinct from `'ijtema_v2'`), joined only at shared gate nodes.

---

## 5. Turn-by-Turn Instruction Design

### Current state

`generateInstructions` (`RoutingServiceV2.ts:153-189`) does **no turn detection at all today** — every step is hardcoded `type: 'straight'` (lines 162, 173); text is template-based off `edge.pathType` (venue semantics like `gate_connector`/`block_connector`, not turn geometry). This is adequate for the internal graph, inadequate for street segments.

The actual bearing-based pattern already exists, but only in **legacy v1**: `src/services/InstructionService.ts:36-125`, using `geolib`'s `getRhumbLineBearing` between consecutive node pairs (lines 67-74), single threshold `|diff| < 30° → straight`, else left/right by sign (lines 83-95). This is the pattern to port and extend, not `generateInstructions`.

### Design

**New function**, not an in-place extension of `generateInstructions` — e.g. `generateStreetInstructions(path, destinationLabel)`, composed with the existing internal-graph instructions the way `prependOutsideApproachInstruction` (`RoutingServiceV2.ts:367-396`) already splices an approach instruction today (that function's current single "walk N meters" line gets replaced with a full multi-step turn-by-turn list for the outside leg).

**Angle-delta thresholds** (finer than v1's single 30° cutoff, standard turn-by-turn convention):

| `\|diff\|` | Direction | Type |
|---|---|---|
| 0-10° | — | `straight` |
| 10-45° | sign of diff | `slight_left` / `slight_right` |
| 45-120° | sign of diff | `left` / `right` |
| 120-179° | sign of diff | `sharp_left` / `sharp_right` |
| ~180° (±10-15°) | — | `u_turn` |

Requires widening the instruction type union — recommend extending `V2NavigationInstruction` (`src/models/types.ts:241-246`, already a v2-specific superset) rather than the shared `NavigationInstruction['type']` closed union (`'straight'|'left'|'right'|'arrival'`, `types.ts:237`) used by v1, avoiding forcing v1 consumers to handle cases they'll never receive. Threshold values should be sanity-checked against real intersection geometries in the actual 3km extract once pulled — dense urban grids may need tighter tolerances.

**Roundabouts**: OSM's `junction=roundabout` tag must be preserved end-to-end from source through the pipeline (§3) into an edge-level field (e.g. `GraphEdge.junctionType?: 'roundabout'`). Instruction generation needs to look ahead across all roundabout-ring edges in one pass (not per-edge like the current loop, `RoutingServiceV2.ts:166-176`) and collapse them into a single "At the roundabout, take the Nth exit onto {road}" instruction, computed by counting connecting side-streets between entry and chosen exit.

**Road names**: reuse the existing `GraphEdge.name: LocalizedLabel` field as-is (same shape already used for venue edges, `graphTypes.ts:35`), populated from OSM's `name`/`name:ur` tags during ingestion, with a fallback string (e.g. "Continue onto the next street") for the common case of unnamed minor OSM ways — a case the venue graph never has to handle since every venue edge is hand-named.

---

## 6. QA Plan

### Test categories (outside starting points), grounded in real gate data

17 gates in `src/data/ijtema/gates.ts`, spanning lat 24.9647–24.9754, lng 66.9980–67.0149 (west cluster near GATE_04/05/07/08, east cluster GATE_17-22). `GATE_03`, `GATE_17`, `GATE_18`, `GATE_19` are disconnected today.

1. **Primary arterial road adjacent to venue perimeter** — near a routable gate cluster (e.g. GATE_01/02 or GATE_20-22); highest-traffic real-world case.
2. **Residential/side street, ~300-500m from nearest gate** — tests threading through non-primary ways, not just snapping to the nearest arterial node.
3. **Boundary of the extraction radius** — must route successfully, not silently degrade at the edge.
4. **Just outside the extraction radius** — must fail gracefully. Two candidate behaviors: (a) fall back to today's beeline with an explicit "approximate route" UI flag, or (b) explicit "too far from venue" rejection. **No sanity-cap constant exists in the codebase today** (confirmed via grep) — this is an open product decision blocking full test specification, matching decision-doc item 10's flagged gap.
5. **Near a disconnected gate** (`GATE_03/17/18/19`) — must never silently route there; two sub-cases (not manually selected → skip to next routable gate; manually selected → show existing `"This gate is not ready for navigation..."` message, already asserted in `scripts/test-outside-location-routing-v2.ts:35`).
6. **Poor GPS accuracy near a boundary** — large accuracy radius straddling inside/outside (`EntryGateRoutingService.ts:68`, 35m buffer) or the extraction-radius edge; must not flap classification.
7. **Cross-venue routing** — start near a cluster where nearby gates are disconnected, forcing a longer real-street route to a routable gate on the far side, rather than a beeline through the venue interior.

Real test coordinates should come from an actual OSM extract of lat 24.964-24.975/lng 66.998-67.015 once the radius is pulled — no fabricated street names.

### Expected flow and assertions

```
GPS → street-graph node snap → road-following path →
  arrival at ROUTABLE gate → seamless splice into internal graph → destination block
```

- Snap: within a defined max distance (propose ≤50m, TBD alongside radius decision).
- Path: outside leg must have >2 nodes (today it's literally 2 — `[startCoordinate, ...internal nodes]`, no intermediate street nodes at all; this single assertion is the direct regression guard against silently reverting to beeline).
- Gate selection: minimizes (street-graph cost to gate) + (internal graph cost gate→destination), not straight-line distance — these can diverge once real topology is introduced.
- Distance sanity bound: total distance within ~1.5-2x straight-line distance (proposed starting bound, needs product sign-off) — catches pathological graph bugs (bad edge causing a 5km detour for a 200m walk).
- Polyline fidelity: rendered vertices match OSM way's actual shape points, not simplified/straightened.
- Splice: last outside-leg coordinate === first internal-leg coordinate exactly (zero mismatch via shared gate node), not just within the 2m dedup tolerance.

### Regression risk on existing suite

Highest risk, in order: `test:entry-gate-routing`, `test:outside-location-routing-v2` (hardcoded gate-choice assertions for two fixed coordinates may need updating once cost function changes), `test:outside-to-gate-total-cost-v2` (asserts specific distance numbers — needs rewrite, not just re-run, once `connectorDistanceM` stops being haversine), `test:gate20-not-overselected-v2`, `test:outside-to-all-blocks-v2`, `test:gate-verification-warning-v2` (must confirm GATE_13/14's `needs_verification`-but-connected distinction doesn't blur). Lower risk but still run per CLAUDE.md's minimum set: `test:route-smoke-v2`, `test:navigation-graph-v2`, `test:map-data-v2`, `test:v1-v2-isolation`, `test:production-v2-defaults`.

### New automated test scripts to create

1. `scripts/test-street-graph-data.ts` → `test:street-graph-data` — validates the bundled street-graph source in isolation (coordinate bounds, edge node references, no unintended orphan islands, every routable gate has a shared street-graph node).
2. `scripts/test-outside-street-routing-v2.ts` → `test:outside-street-routing-v2` — per-category assertions from the table above (>2 path nodes, sanity-bound distance, correct routable-gate selection, disconnected gates never selected).
3. `scripts/test-outside-radius-boundary-v2.ts` → `test:outside-radius-boundary-v2` — boundary/just-outside-radius behavior; **blocked on the radius/fallback-behavior product decision**, should be stubbed rather than guessed at.
4. Optional: `scripts/test-outside-gate-splice-v2.ts` — asserts exact-zero-distance coordinate join at the gate.

### Manual field-test procedure (real device, real streets — cannot be scripted)

1. Cold-start at each category location; confirm rendered route visually follows real streets, not through buildings/private land.
2. Walk the outside leg while tracking; confirm GPS marker stays snapped, turn instructions fire at correct real intersections.
3. Cross the inside/outside boundary at walking pace near a gate; confirm smooth outside→inside visual/instruction transition, no jump or duplicate arrival event.
4. Stand near each disconnected gate in person; confirm routing correctly redirects to the next routable gate, never dead-ends the user at a fence.
5. GPS degradation test in any known-poor-signal area near the venue; confirm no route flapping.
6. **Offline mode test**: airplane mode on before starting; confirm the full outside+inside route computes and renders with zero network dependency — this is the core value proposition of choosing Option B and needs explicit field verification, not just a config check.
7. Walk from just outside the chosen radius toward the venue to observe the real fallback transition.
8. Log results per existing `docs/ANDROID_DEVICE_QA_CHECKLIST.md`/`docs/V2_ANDROID_RUNTIME_QA_CHECKLIST.md` conventions — per CLAUDE.md, script-test passes alone don't establish runtime readiness.

---

## Summary / Build Order

1. Binary min-heap + A* heuristic + fan-out fix in `RoutingServiceV2`/`EntryGateRoutingService` (§2) — fixes a **pre-existing** perf issue, independent value even before the street graph lands.
2. Pull 3km OSM extract, build processing/validation pipeline, produce `src/data/ijtema/streetGraph*.ts` (§3).
3. Wire `selectOutsidePath` to call the new street-graph pathfinder behind a default-off `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` flag (§4), lazy-loaded, not eager.
4. Two-color polyline split + progress-aware gate banner in `NavigationScreen.tsx` (§4).
5. Turn-by-turn generation for street edges (§5).
6. Full QA pass — automated scripts + manual field test — before flipping the flag default (§6).

Two product decisions block full specification and should be resolved before/during step 2-3: **exact fallback behavior for points outside the extraction radius**, and **the distance sanity-cap multiple**.

*No code was modified for this plan. Awaiting approval before implementation begins.*
