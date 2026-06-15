# Map Data Maintenance

## Current Process

The original manual marking process is not stored as a separate checked-in source file.

The existing maps are manually hardcoded in TypeScript. The legacy v1 map lives in `src/constants/data.ts` for rollback and legacy tests; the authoritative production v2 Ijtema dataset lives in `src/data/ijtema/*`. There is no checked-in external source file or generator.

## How To Add A Legacy V1 Block Today

1. Add the block to `IJTEMA_DATA.blocks` in `src/constants/data.ts`.
2. Use decimal-degree coordinates.
3. Provide `center`, `corners`, `polygon`, `gates`, `entry_nodes`, `connectedRastas`, `neighboringBlocks`, and `aliases`.
4. Add or update `BLOCK_ENTRY_MAP_STRICT`.
5. Run `npm run test:map-data`, `npm run test:graph-validation`, and `npm run test:routing`.

## How To Maintain V2 Data Today

1. Update the focused source file under `src/data/ijtema/*` for the relevant data type.
2. Do not duplicate raw coordinates into screens, viewmodels, or runtime services.
3. Run `npm run test:map-data-v2`, `npm run test:navigation-graph-v2`, `npm run test:entry-gate-routing`, `npm run test:route-smoke-v2`, and the relevant v2 integration test.

## How To Add A Legacy V1 Gate Today

1. Add a node in `IJTEMA_DATA.nodes` with `type: "gate"`.
2. If the gate is off the walkable graph, set `nearestRoadNode`.
3. Add it to the related block's `gates`.
4. Add it to `LANDMARK_NEAREST_NODE` if it is searched/routed as a landmark or off-graph place.
5. Add aliases through node name/Urdu name or a `LANDMARK_PLACES` entry if needed.
6. Run validation and search tests.

## How To Add A V2 Gate Today

1. Update the gate entry in `src/data/ijtema/gates.ts`.
2. Use `routingStatus: "missing_coordinate"` and `canStartRouteFromOutside: false` for gates without verified coordinates.
3. Use the official entry/exit semantics from `src/data/ijtema/entryPolicy.ts`.
4. Verify the gate is connected before allowing active navigation. Disconnected gates must show: `This gate needs connector verification before navigation.`
5. Run `npm run test:map-data-v2`, `npm run test:entry-gate-routing`, `npm run test:directions-v2`, and `npm run test:navigation-v2`.

## How To Add A Legacy V1 Rasta Today

1. Add graph nodes if the rasta introduces new intersections or endpoints.
2. Add `IJTEMA_DATA.edges` entries with `from`, `to`, `distance_m`, `isRasta`, and `name`.
3. Let the edge normalization loop assign `type`, `rastaId`, and `weightMultiplier`.
4. Run route smoke and map-data tests.

## How To Maintain V2 Rastas Or Special Routes Today

1. Update `src/data/ijtema/rastas.ts` or `src/data/ijtema/specialRoutes.ts`.
2. Keep normal user labels friendly, such as `Rasta 09` or `Shahr-e-Pindal North`.
3. Keep raw graph IDs available only through developer labels and validation output.
4. Run `npm run test:map-data-v2`, `npm run test:navigation-graph-v2`, `npm run test:map-rendering-v2`, and any affected routing tests.

## Runtime Status

- Legacy v1 remains available only when v2 flags are explicitly false for rollback/dev testing.
- V2 Search, Home rendering, Directions, and active Navigation are the default production paths.
- V2 active Navigation requires all three flags to be enabled or unset: `EXPO_PUBLIC_USE_IJTEMA_V2_MAP`, `EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING`, and `EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION`.
- Explicit `false`, `0`, `no`, or `off` disables the related v2 path for emergency rollback.
- Local code/test verification passes, but Android visual QA is still pending.
- Do not claim production readiness until Android runtime QA is complete.

## Safer Future Process

Use a versioned map package:

- `map-source/ijtema.geojson`: editable source for blocks, gates, rastas, terminals, landmarks, and venue boundary.
- `scripts/generate-map-data.ts`: validates and generates bundled JSON/TypeScript.
- `src/data/ijtema/generated/*.json`: generated graph, polygons, labels, metadata, and checksum.
- `docs/map-editing.md`: non-developer guide for updating source data.
- `scripts/render-map-qa.ts`: exports a visual QA image of polygons, labels, graph, gates, and sample routes.

Required validation gates:

- coordinate bounds and reversed-lat/lng checks
- duplicate IDs
- edge references
- polygon validity
- venue-boundary containment
- all searchable places render and route
- all block-to-block routes are non-degenerate
- route instruction readability
- graph-only render coverage
