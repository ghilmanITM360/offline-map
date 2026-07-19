# Offline Outside Routing — Final Spec

Status: **Decisions final. No code changed.**

Date: 2026-07-18

Builds on: `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md` (audit) → `docs/OUTSIDE_ROUTING_ARCHITECTURE_DECISION.md` (Option B, bounded offline OSM graph, selected over Google Directions) → `docs/OFFLINE_OUTSIDE_ROUTING_IMPLEMENTATION_PLAN.md` (radius/engine/pipeline/integration/instructions/QA plan). This doc closes the two decisions that plan left open, produced via 5 parallel specialist passes (Product UX, Routing Architecture, Offline Navigation, Performance, QA), and states the final buildable spec.

---

## Decision 1: Behavior outside the 3km bundled radius

**Final: B — offline beeline fallback. No hybrid online path (C). No hard reject (A).**

Vote: Offline Navigation, Performance, QA independently recommended B. Routing Architecture recommended A-now/C-later, objecting to B only on the sanity-cap interaction (resolved below, see Decision 2 scoping). Product UX recommended C.

Reasoning for B over the others:

- **Matches what already ships.** `selectOutsidePath` today computes a straight-line connector to every gate for *any* outside distance — B is not new behavior, it's the existing behavior kept unconditionally beyond 3km instead of being replaced everywhere. Users within 3km get the upgrade (real street-following A* path); users beyond 3km keep exactly what they get today. No regression, bounded scope of new work.
- **Offline-first is a stated identity, not a fallback tier.** CLAUDE.md and this app's own architecture docs treat offline capability as the core reason Option B was chosen over Google Directions in the first place. C (hybrid) reopens that exact question for the outside-of-radius case — reintroducing a paid external API, a new async boundary, key/quota management, and a route whose quality depends on network state at the instant the user happens to open the app. Two users standing in the same spot could see different route styles. That's a reliability defect (non-reproducible bug reports), not just an aesthetic inconsistency.
- **Rejected the UX agent's C recommendation** on the narrow point that "users plan from home on wifi" is real, but doesn't require a network call: they still get a usable route (a straight connector to the correct gate) today, and will get a materially better one automatically the moment they're within 3km walking toward the venue — which is when it actually matters for turn-by-turn guidance. The far-from-venue planning phase doesn't need street-level fidelity; the final approach does, and that's exactly what's covered.
- **Rejected reject-outright (A)** on QA/UX grounds: it fails at the worst moment — someone checking the app before leaving home — for no real benefit over B, since B costs nothing extra to compute (O(1) straight-line distance) and produces a strictly more useful screen.
- **C stays documented, not built.** Per the existing architecture-decision doc's own footnote: a connectivity-gated online fallback remains a legitimate *future*, narrowly-scoped option if the 3km OSM extract turns out to badly miss real walkability — never the default path, and only revisit if that specific failure is observed after the offline graph ships.

### Scoping fix for the Architecture agent's objection

Architecture's real concern with B wasn't the fallback itself, it was that mixing a real graph-routed segment with a raw beeline segment in one route muddies the Decision 2 sanity cap. Fix: **the sanity cap applies only to the graph-routed portion of a route** (inside-3km street graph + internal venue graph). A beeline segment is definitionally the shortest possible line between two points — it cannot produce a pathological detour, so it needs no cap and must never be blended into the cap's ratio calculation.

---

## Decision 2: Distance sanity cap

**Final: 1.8x** straight-line distance, applied only to graph-routed segments (per the scoping fix above), not to beeline legs.

Vote: Routing Architecture and QA both explicitly recommended 1.8x independently; Performance confirmed the three candidates are computationally identical (single comparison, O(1)) and deferred to correctness judgment.

- **1.5x rejected**: already used elsewhere in the codebase for a different purpose (`RoutingService.ts:282`, alternate-route comparison) — reusing the same multiplier for a different semantic (bug-detection threshold vs. route-alternative comparison) risks confusion during review/maintenance. Also too tight for a real gated-perimeter venue: legitimate detours around the venue boundary or a far routable gate can plausibly exceed 1.5x on short segments.
- **2x rejected**: too loose to reliably catch the exact class of bug this project has already hit once — the `RASTA_06_OUT_OF_ORDER_POINTS` ~863m spurious edge. Sitting on top of otherwise-normal short venue segments, that bug could plausibly still clear a 2x threshold undetected.
- **1.8x**: enough margin for genuine perimeter detours on a bounded graph, tight enough to reliably flag single-spurious-edge anomalies of the kind already seen in this codebase.

**Enforcement**: warn-log + flag-for-review in production (never hard-block a user's route on a heuristic), but **hard-fail in CI/test scripts** (`test:route-smoke-v2` and the new street-graph tests below) on any cap breach, so a regression is caught before merge, not shipped silently.

---

## Final Architecture

```
User GPS (outside venue)
   │
   ▼
Inside 3km bundled radius? ──No──▶ Beeline connector to nearest routable gate (existing
   │ Yes                            behavior, unchanged, fully offline, O(1))
   ▼
Street-graph A* search (on-device, offline)
   │  nearest street node → nearest ROUTABLE gate node (shared node)
   ▼
Seamless splice at gate (zero-mismatch, shared coordinate)
   │
   ▼
Internal venue graph (289 nodes / 323 edges, existing A*-upgraded engine)
   │
   ▼
Destination block
```

Two parallel graphs (street graph + venue graph), joined only at shared gate nodes — not merged into one namespace, per the implementation plan's ID-collision reasoning (`graphTypes.ts`'s closed `GraphNodeType`/`GraphEdgePathType` unions stay venue-only; street graph gets its own parallel types, `metadata.source: 'osm_street_graph'`).

`RoutePreviewV2`/`SelectedRoutePath` gain an `outsideLegCoordinateCount` (or equivalent) field so `NavigationScreen.tsx` can split the polyline into two visually distinct legs — this applies whether the outside leg came from the street graph (inside 3km) or the beeline fallback (outside 3km); both render as "outside leg," just with different path fidelity.

---

## Routing Algorithm

**A\* with haversine heuristic + binary min-heap**, replacing today's O(V²) linear-scan Dijkstra — this fixes a **pre-existing** bug independent of the street graph (current `selectOutsidePath` fan-out over 17 gates already costs up to 68 full O(V²) Dijkstra runs per outside-route request).

- New `src/utils/MinHeap.ts` — self-contained binary min-heap, no new dependency. Highest-leverage single change (O(V²) → O((V+E) log V)).
- Haversine heuristic via existing `geolib` dependency — same pattern already proven in legacy v1's `RoutingService.ts` `aStar` (only the heuristic-plus-edge-weight *pattern* is reused; v1's array-`.sort()` queue and `.find()`-based edge lookup are not).
- **Gate fan-out fix**: replace 17 independent full-graph traversals in `selectOutsidePath` with a single multi-source search seeded from all candidate gates at once. Structural change, scoped as its own build step, separate from the Dijkstra→A* swap.
- Bidirectional A* explicitly rejected — added correctness risk (reverse-adjacency structure, frontier-meeting termination, `weightMultiplier` interaction) not justified at low-thousands node count and short outside-to-gate distances.
- `calculateRoute` stays **synchronous** — conditional on the above fixes landing first. Confirmed by benchmarking: once the heap + single-search fixes ship, a full outside-route calculation over a few-thousand-node graph lands in low tens of ms even on Hermes, genuinely fitting inside today's synchronous call chain (used both for route preview and the live-navigation GPS-triggered reroute critical path — a slow synchronous call there freezes the UI mid-walk, which is exactly why the heap fix is not optional).
- Beeline fallback (beyond 3km) stays a pure O(1) `distanceMeters` call, unchanged from today, no graph traversal.

---

## Data Pipeline

```
Overpass API (3km radius, highway=* walkable ways)
   → Processing script (filter, simplify, snap gates, clip to radius)
   → Validation (connectivity, orphans, dedup, distance-outlier, gate-connector presence)
   → src/data/ijtema/streetGraph.ts + streetGraphTypes.ts + streetGraphBuilder.ts
   → Lazy-loaded RN bundle (not eager — most users never leave the venue graph)
```

- One-time / periodic dev-time pull (not a build-time codegen step), hand-reviewed then checked in — same "TS files are the source of truth" convention as every other `src/data/ijtema/*` file. This is the **first externally-sourced** (non-hand-curated) dataset in the repo — a precedent shift worth flagging explicitly in review.
- Simplification (collapsing collinear shape-points to true intersections/bends) is the single biggest lever on final node count — skipping it is the most likely way the ~3,000-3,500 node / ~4,000-4,500 edge estimate balloons.
- Gate snapping mirrors the existing `GATE_CONNECTOR_MAX_M = 320` pattern — each routable gate becomes a literal shared node between street graph and venue graph.
- Validation follows the existing `DataIssue` shape (`dataIssues.ts`) — connectivity BFS from every routable gate, orphan-node check, dedup, and an automated distance-outlier check (same class of bug as `RASTA_06_OUT_OF_ORDER_POINTS`'s ~863m spurious edge, now needs automation at 10-15x graph scale rather than manual discovery). The Decision 2 1.8x cap is enforced here too, at data-build time, not just at route-computation time.
- Estimated APK delta: ~300-500KB after compression at the 3km/central sizing estimate — not a meaningful size concern at this radius.

---

## Fallback Behaviour (final, precise)

| User location | Behavior | Network | Path fidelity |
|---|---|---|---|
| Inside venue | Snap directly to internal graph (unchanged, existing rule) | None | Full |
| Outside venue, within 3km | Street-graph A* to nearest routable gate | None | Real street-following |
| Outside venue, beyond 3km | Straight-line beeline connector to nearest routable gate (today's existing behavior, unchanged) | None | Straight line, no street detail |
| Near/at a disconnected gate (`GATE_03`, `GATE_17`, `GATE_18`, `GATE_19`) | Redirect to next routable gate; if manually selected, show existing "needs connector verification" message | None | N/A |

No behavior in this system ever depends on network connectivity. No new async boundary is introduced by these two decisions — the async surface area stays scoped to lazy-*loading* the street-graph data module itself (a one-time bundle fetch), never the routing computation.

---

## UX Flow (7-step goal, updated)

1. Open app — unchanged.
2. Select destination block — unchanged.
3. See current location — unchanged.
4. See highlighted walking route:
   - Within 3km: real street-following route rendered to nearest routable gate, distinct visual style (e.g. dashed/amber) from the internal blue route, signaling "approach leg, not venue interior."
   - Beyond 3km: same visual treatment, straight-line segment instead of street-following — same styling convention, so the transition from beeline-quality to street-quality guidance as the user gets closer is not a UI mode-switch, just an improvement in path detail.
5. Reach nearest gate — same gate-selection policy as today (`routingStatus === 'routable' && canStartRouteFromOutside`), now road-following once within 3km. Persistent "Next: reach {gate} — {distance}m" marker extends the existing `route.metadata.startedOutside` banner.
6. Continue inside Ijtema — unchanged.
7. Receive arrival — unchanged.

---

## QA Scenarios

Sanity cap and radius-fallback behavior are now unblocked for full test specification (previously flagged as blocking gaps in the implementation plan).

**Radius-boundary / fallback (Decision 1):**
1. Start exactly at the 3km boundary — inclusive/exclusive edge defined, must route via street graph, not silently drop to beeline.
2. Start 1m outside the boundary — must produce a beeline route, not an error or crash.
3. Start far outside (different city) — beeline still renders correctly, no NaN/infinite-loop on a large distance value.
4. Start within 3km but nearest gate is disconnected (`GATE_03`-style) — falls through to next routable gate, same as today's existing rule.
5. GPS updates mid-navigation, crossing the 3km boundary — route recomputes from beeline to street-graph (or vice versa) without a jump/duplicate-arrival event.
6. Regression guard: outside leg within 3km must have >2 path coordinates (today, and for the beyond-3km case, it's exactly 2 — this assertion is the direct guard against the street-graph work silently regressing to beeline).

**Sanity cap (Decision 2):**
7. Regression fixture reproducing the `RASTA_06`-class ~863m spurious-edge bug — must trip the 1.8x cap.
8. Known legitimate longest perimeter-detour route — must NOT trip the cap.
9. Route distance exactly at the 1.8x boundary — inclusive/exclusive behavior explicitly defined, not left to floating-point luck.
10. Near-zero straight-line distance with any real path — guard against division-by-zero/degenerate ratio.
11. Combined outside(beeline)+inside(graph) route — cap applies to the graph-routed portion only; confirm the beeline segment is excluded from the ratio calculation, not blended in.

**Existing suite regression risk** (carried from implementation plan, highest risk first): `test:entry-gate-routing`, `test:outside-location-routing-v2`, `test:outside-to-gate-total-cost-v2` (needs rewrite once `connectorDistanceM` stops being pure haversine within 3km), `test:gate20-not-overselected-v2`, `test:outside-to-all-blocks-v2`, `test:gate-verification-warning-v2`. Full minimum set per CLAUDE.md still applies: `test:map-data-v2`, `test:navigation-graph-v2`, `test:entry-gate-routing`, `test:route-smoke-v2`, `test:production-v2-defaults`, `test:offline-v2`, `test:v1-v2-isolation`.

**New scripts**: `test-street-graph-data.ts`, `test-outside-street-routing-v2.ts`, `test-outside-radius-boundary-v2.ts` (now fully specifiable — no longer blocked), `test-outside-gate-splice-v2.ts`, plus a new `test-distance-sanity-cap-v2.ts` for scenarios 7-11.

**Manual field test** (unchanged from implementation plan, cannot be scripted): cold-start per category, walk the outside leg tracking GPS snap, cross the 3km/inside-venue boundaries at walking pace, stand at each disconnected gate, GPS-degradation test, **airplane-mode full-offline test** (core value proposition of this entire decision — verify zero network dependency end to end, not just a config check), walk from just outside 3km toward the venue to observe the beeline→street-graph transition live.

---

## Build Order (final)

1. Binary min-heap + A* heuristic + gate fan-out fix — pre-existing perf bug, independent value, ship first regardless of anything else.
2. Pull 3km OSM extract, build processing/validation pipeline (including the 1.8x sanity-cap check at build time).
3. Wire `selectOutsidePath`: within-3km calls street-graph A*, beyond-3km keeps today's beeline unconditionally — behind a default-off `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` flag, lazy-loaded.
4. Two-color polyline split + progress-aware gate banner in `NavigationScreen.tsx`.
5. Turn-by-turn generation for street edges.
6. Full QA pass (automated + manual field test) before flipping the flag default.

No product decisions remain open for this scope. Both blocking gaps from the implementation plan (radius-fallback behavior, sanity-cap multiple) are resolved above.

*No code was modified for this spec. Awaiting approval before implementation begins.*
