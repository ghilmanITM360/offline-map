# Routing Graph

## Legacy V1 Graph

The legacy routing graph is declared in `src/constants/data.ts`.

- Nodes: `T*`, `S*`, `P*`, and `C*`.
- `P*` nodes are internal intersections.
- `S*` nodes are road ends and side/boundary points.
- `T*` nodes are terminal endpoints.
- `C1` to `C4` are off-graph Member Masjid gates that route through `nearestRoadNode`.

## Legacy V1 Algorithm

`RoutingService` uses A*.

- Heuristic: geolib straight-line distance between graph nodes.
- Edge weight: stored `distance_m` multiplied by optional edge penalties.
- Directionality: edges are treated as bidirectional.
- ETA: `ceil(totalDistance / (walkingSpeedMs * 60))`.
- Alternatives: primary A*, a penalty variant, then an alternative that penalizes the primary path edges.

## Legacy V1 Start And Destination Resolution

- Start inside a block: sort that block's `entry_nodes` by distance to the start coordinate.
- Start inside venue but outside a block: use nearest on-graph node.
- Start outside venue: Directions rejects live/manual starts; `SnapToRoadService.resolveRoutingNode` can snap to boundary nodes for rerouting fallback.
- Block destination: route to the block's `entry_nodes`.
- Gate/landmark destination: route to `nearestRoadNode`.
- Rasta destination: route to a preferred node selected by `SearchService.searchByCategory('rastas')`.

## Legacy V1 Navigation

`NavigationViewModel` projects GPS onto the active route, clamps progress so it does not jump backwards too far, advances steps near instruction coordinates, detects arrival within 20 m, and reroutes after repeated off-route evidence. Weak GPS accuracy above 50 m holds the route stable.

## V2 Graph

The v2 graph is built from the authoritative files under `src/data/ijtema/*`:

- B1-B42 blocks and C1/C2/C3/C4 entry points
- official numbered gates
- Rasta 01-11
- Shahr-e-Pindal North, South, and West visual routes
- P1-P12 central points

`RoutingServiceV2` uses the v2 graph for Directions preview and active v2 Navigation. Outside users must enter through a connected official numbered gate before routing through the internal graph. Inside users may snap to the internal graph.

## V2 Navigation

`V2NavigationAdapter` converts v2 previews into `V2ActiveRoute` objects with `sourceVersion: "v2"`, origin/destination metadata, route coordinates, friendly instructions, and developer labels. `NavigationScreen` enters the v2 branch only when `sourceVersion === "v2"` and `EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION` is enabled or unset. Explicit false values keep v2 routes out of the legacy runtime and leave v1 available only as rollback/dev behavior.

`NavigationViewModelV2` projects GPS onto the v2 route, keeps remaining distance monotonic under small jitter, stabilizes ETA while stationary, detects arrival near the destination, and reroutes only after threshold, consecutive evidence, and cooldown gates are satisfied. Reroute failures keep the previous route visible.

## Known Issues

- Historical audit note: `S4-S5`, `S2-P6`, and `P7-S17` were reconciled to direct measured graph distances because they are straight walkable graph links with no intermediate vertices.
- Instruction text is validated to avoid raw graph node IDs for normal routes; keep future templates on friendly block, gate, rasta, or Shahr-e-Pindal names.
- Walkability constraints are not modeled beyond the graph itself. There are no temporary closures, one-way paths, crowd-flow constraints, or blocked areas.
- Android visual runtime verification for the v2 active navigation path is pending.
