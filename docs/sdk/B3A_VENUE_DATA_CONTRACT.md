# B3a - Venue data contract and first Ijtema adapter

Status: implemented locally on `feat/muslim-ummah-offline-navigation-sdk`. Scope is deliberately small; see "Deferred to B3b".

## Contract (`packages/offline-navigation/src/domain/venue/`)

| File | Responsibility |
|---|---|
| `VenueDataSource.ts` | `VenueDataSource` (venue ID, data version, graph, places), `VenueRoutingGraph` (`nodeIds/getNode/edgesFrom`), `VenueNode`, `VenueEdge`, `VenuePlace`, `edgeCostM` |
| `VenueRouting.ts` | `findVenuePath(graph, start, goal)` on the shared `runAStar`; haversine heuristic identical to `distanceMeters` |
| `validateVenueGraph.ts` | Structural checks: reserved IDs, duplicates, invalid coordinates, NaN/negative/infinite weights, dangling edges |

IDs are opaque strings. The contract is accessor-based and read-only, so `__proto__`-style IDs never hit a prototype lookup, and nothing assumes 42 blocks, 18 gates, `GATE_xx` or `Bxx_Cn`. `Coordinate` `{lat,lng}` and `GraphNode`/`GraphEdge` already satisfy the shapes structurally, so no existing type was changed.

`validateVenueGraph` is a structural guard only. Authenticity/signing of a venue pack is B9, not provided here. `runAStar` itself still assumes finite non-negative weights and is unchanged.

## Ijtema adapter (`src/data/ijtema/venueAdapter.ts`)

`createIjtemaVenueSource(graph = IJTEMA_NAVIGATION_GRAPH_V2)` / `IJTEMA_VENUE_SOURCE`. It copies no records: `getNode`/`edgesFrom` return the original node objects and adjacency arrays (asserted by identity in tests). Places are derived from `IJTEMA_GATES` (node = gate ID) and `IJTEMA_BLOCKS` (`getBlockEntryNodeIds`), only where the node exists in the graph. Gates absent from the dataset are not invented.

## Integration (one seam)

`RoutingServiceV2` `heuristicCostM` and `internalGraphNeighbors` now read through `IJTEMA_VENUE_SOURCE.graph`. Public API, A* inputs, ordering and costs are unchanged; route parity is proved against the B2a golden (path hash `1882749b...`, cost hash `fff62e83...`, 91,506 ordered pairs, 90,300 routable / 1,206 unreachable). Provider order (OSM first) is untouched.

## Data inventory (computed from the repo at this commit)

| Item | Count / source |
|---|---|
| Blocks / Gates / Rastas / Special routes / Central points | 42 / 18 / 11 / 3 / 12 (`src/data/ijtema/*.ts`, `DATA_MANIFEST.json`) |
| Internal graph (`ijtema-v2`, version `2026-06-ijtema-v2-navigation-graph`) | 303 nodes (85 rasta, 20 special, 12 central, 18 gate, 168 block entry), 343 edges, all bidirectional = 686 directed; no `weightMultiplier` != 1 |
| Ordered pairs | 91,506; 90,300 routable; 1,206 unreachable |
| Street graph (outside routing, OSM) | 7,952 nodes / 11,987 edges (`streetGraph.ts`, `streetGraphBuilder.ts`) |
| Offline basemap | `assets/offline-map/ijtema-basemap.pmtiles` + `BASEMAP_PROVENANCE.json` |

Ownership classes:
1. **Canonical routing data** - `src/data/ijtema/{blocks,gates,rastas,specialRoutes,centralPoints,perimeterConnectors,graphBuilder}.ts` -> `IJTEMA_NAVIGATION_GRAPH_V2`.
2. **Presentation metadata** - names/aliases/`visual`, `gateMeta.ts`, `mapBounds.ts`, `entryPolicy.ts`.
3. **V1 legacy** - `src/constants/data.ts` (`IJTEMA_DATA`, `LANDMARK_PLACES`, `LANDMARK_NEAREST_NODE`, `BLOCK_ENTRY_MAP_STRICT`) read by `RoutingService`, `SearchService`, `PlaceDetailService`, `RoutePointService`, `InstructionService`, `SnapToRoadService`, `V2DirectionsService`, `HomeScreen`, `LocationSheet`, `navigationScene`, `useNavigationOverlayV1`, `OfflineMapPoc`. Untouched; duplicate coordinates/IDs vs. the V2 data remain (AUD-03, AUD-14).
4. **Outside-street data** - `streetGraph.ts` via `getStreetNavigationGraph()` in `OutsideStreetRoutingService`. Untouched.
5. **Derived** - the V2 graph is built at import time by `buildNavigationGraphV2()`; the street graph build is cached in `streetGraphBuilder`.

Readers of the V2 graph (before B3a): `RoutingServiceV2`, `EntryGateRoutingService`, `V2DirectionsService`, `V2NavigationAdapter`, `V2NavigationRuntimeService`, `V2PlaceAdapter`, `entryPolicy`, `v2Validation`, `streetGraphBuilder`. After B3a only the A* neighbor/heuristic access in `RoutingServiceV2` goes through the adapter.

## Deferred to B3b (exact next seam)

- Migrate the remaining direct `IJTEMA_NAVIGATION_GRAPH_V2` reads in `RoutingServiceV2` (path-geometry and instruction code, `friendlyNodeName`, candidate lookups) and `EntryGateRoutingService` to an injected `VenueDataSource`; make `RoutingServiceV2` accept a source with Ijtema as default.
- Street graph: `getStreetNavigationGraph()` needs its own read-only contract (OSM-first provider order stays).
- Rasta/special-route/block candidate resolution (`getConnectedCandidates`) via `VenuePlace` instead of `IJTEMA_RASTAS`/`IJTEMA_SPECIAL_ROUTES`.
- Gates 18/19 connector data is unchanged and still `ground_truth_required` - no links were added.
- V1 `constants/data.ts` removal, facilities, pack download/signing (B9), MapLibre extraction.

## Tests

- `npm run test:venue-contract` - Ijtema golden-hash parity through the contract, adapter identity/no-copy, prototype safety, synthetic venue, hazard validation, static venue-agnostic scan.
- `npm run test:sdk-headless` - the synthetic venue also runs in plain compiled Node with no tsx.
