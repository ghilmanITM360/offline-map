# B3c - Outside-street graph contract and extracted street search

Status: implemented locally on `feat/muslim-ummah-offline-navigation-sdk`. Bounded to one calculation seam; orchestrator, request coordinator, GPS and UI are untouched.

## Contract (`packages/offline-navigation/src/domain/street/`)

| File | Responsibility |
|---|---|
| `StreetGraph.ts` | `StreetRoutingGraph` (`getNode`, `edgesFrom`, `nearestNode`, `connectorFor`), `StreetNode`, `StreetEdge` (directed, `distanceM`, optional `geometry`/`name`), `StreetConnector` |
| `StreetRouting.ts` | `findStreetRouteToTargets(graph, origin, targets, sanityCapRatio)` - the multi-target virtual-sink A* formerly inside `selectStreetGraphOutsidePath` |
| `../geo/SpatialGrid.ts` | Moved from `src/utils/SpatialGrid.ts` (now a re-export), so the street search keeps the exact asin-form haversine its heuristic, dedup and sanity ratio always used |

Why not `VenueRoutingGraph`: street nodes are flat `{id, lat, lng}` records, and wrapping them as `VenueNode` would copy all 7,952 of them. Street edges also carry rendering geometry and names, and outside routing needs a nearest-node lookup and per-place connectors that the internal graph has no use for. The venue domain's haversine is the atan2 form, so reusing it would change heuristic values and tie behaviour. IDs are opaque, there is no global or default graph, and the domain does not import Ijtema data (the headless consumer's module-graph check proves this).

Targets carry `extraCostsM`, which is added left to right after the connector distance. The host therefore controls float summation order, and Ijtema sink weights stay bit-identical.

## Ijtema adapter (`src/data/ijtema/streetAdapter.ts`)

`createStreetRoutingGraph(graph, index?)` / `getIjtemaStreetRoutingGraph()`. It wraps the existing `getStreetNavigationGraph()` and `getStreetGraphSpatialIndex()` singletons lazily, so the street graph is still built only on the first outside route. It copies nothing: nodes, adjacency arrays, the builder's pre-reversed two-way edges and connectors are returned by identity. Lookups are own-property only.

Recomputed from source: 7,952 nodes and 11,987 edges, all `direction: 'both'` (0 one-way), which is 23,974 directed adjacency entries, plus 18 gate connectors. Gates 18/19 remain field-blocked, and no connector was added.

## Host-owned (unchanged)

`selectStreetGraphOutsidePath` stays the Ijtema wrapper: it filters gates without coordinates, adds `gatePenaltyM`, the caller's internal cost and `gate.number * TIE_BREAK_EPSILON_M`, passes `DISTANCE_SANITY_CAP_RATIO`, and maps `targetId` back to the `Gate`. It accepts an optional street graph, with the Ijtema adapter as the default. `EntryGateRoutingService`, gate eligibility (`isEligibleOutsideGate`), manual-gate precedence and `isWithinStreetGraphRadius` are all unchanged.

## Dependency map (outside routing)

| Operation | Graph dependency | Venue-specific | Flag | Network | Cache owner | Seam after B3c | Tests |
|---|---|---|---|---|---|---|---|
| `findStreetRouteToTargets` (domain) | explicit `StreetRoutingGraph` | none | none | none | none | is the seam | `test:sdk-headless`, `test:street-graph-contract` |
| `selectStreetGraphOutsidePath` | adapter (default) or injected | gates, penalty, tie-break | none | none | adapter singleton | optional graph param | `test:outside-street-routing-v2`, `test:street-gate-penalty-parity-v2`, `test:outside-street-gate-selection-cost-v2` |
| `isWithinStreetGraphRadius` | `getStreetNavigationGraph().metadata` | Ijtema extract radius | none | none | builder singleton | not yet | `test:outside-street-routing-v2` |
| `RoutingServiceV2.selectOutsidePath` | via wrapper | `IJTEMA_GATES`, internal costs | `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` (default on; off = beeline) | none | - | not yet | `test:outside-street-graph-integration-v2` |
| `RoutingServiceV2.resolveOfflineOsmOutsideCandidate` | via wrapper | gate lookup | none | none | - | not yet | `ProductionOutsideRouteSource.test.ts` |
| `HybridOutsideRouteOrchestrator` | none | none | `enableGoogleDiagnosticProxy` | only through the Google provider | none | already injected | `HybridOutsideRouteProviders.test.ts`, `test:core-provider-routing-contract-v2` |
| `GoogleProxyWalkingRouteProvider` | none | none | `EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC` + `..._ROUTING_PROXY_BASE_URL` | yes (`fetch`), only when both are set | none | - | `ProductionOutsideRouteSource.test.ts` |
| `OfflineOsmWalkingRouteProvider` / `DirectDirectionGuideProvider` | resolver / none | gate labels in host resolver | none | none | none | already injected | `HybridOutsideRouteProviders.test.ts` |

Default order is OSM walking route, then the labelled direct guide. Google is prepended only when the diagnostic is explicitly enabled. The street data is a bundled TS module, so there is no filesystem or network read at runtime.

## Parity evidence

- The before/after differential over real production functions (8,034 cases: multi-gate and single-gate selection, random and tied extra costs, OSM candidates for every gate, `calculateRoute` with the flag on and off and manual gates including GATE_18/19, `recommendOutsideEntryGate`, the production source with Google off and on and every fetch failing) is byte-identical to e79cd0b. Flag on vs. off output differs, which proves the flag takes effect in Node.
- `test:street-graph-contract` pins a route hash taken from the e79cd0b service.
- Internal parity (`test:venue-contract`, 91,506 pairs, golden hashes) is unchanged.

## Deferred (next seam)

- `isWithinStreetGraphRadius` and `RoutingServiceV2` outside paths still bind the Ijtema graph implicitly. Next: a coverage accessor on the contract and an injected street graph for `RoutingServiceV2`.
- `ProductionOutsideRouteSource` gate labels/instructions, orchestrator wiring, V1 consumers, and the RN controller/UI.
