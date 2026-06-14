# Coordinate System

## Format

All runtime coordinates are decimal-degree WGS84-like GPS coordinates.

The legacy v1 map stores converted decimal values in `src/constants/data.ts` for rollback and legacy tests. The authoritative production v2 map stores converted decimal values in focused files under `src/data/ijtema/*`.

## Field Names

- UI and app coordinates use `{ latitude, longitude }`.
- Legacy graph nodes use `{ lat, lng }`.
- V2 data and route coordinates use `{ latitude, longitude }`.
- Conversion between legacy shapes happens in `RoutingService`, `RoutePointService`, `SearchService`, `SnapToRoadService`, and the map screens. V2 routing should consume `src/data/ijtema/*` models directly and avoid duplicating coordinate literals into runtime files.

## Venue Bounds

Legacy `MAP_BOUNDS` is a rectangular bounding box:

- minLat: `24.9650`
- maxLat: `24.9715`
- minLng: `66.9985`
- maxLng: `67.0070`

Legacy `RoutingService.isInsideVenue` and `SnapToRoadService` use this rectangle. V2 map bounds in `src/data/ijtema/mapBounds.ts` are broad camera/download bounds and are not sufficient by themselves for the outside-user entry-gate rule.

V2 outside/inside routing policy is derived from the authoritative v2 blocks and route lines. Outside users route through a connected official gate; inside users may snap to the internal graph.

## DMS Conversion

| Point | DMS | Decimal |
| --- | --- | --- |
| B2 | 24 deg 58' 06.6" N, 66 deg 59' 59.7" E | `24.968500`, `66.999916667` |
| C1 | 24 deg 58' 03.3" N, 66 deg 59' 57.6" E | `24.967583333`, `66.999333333` |
| C2 | 24 deg 58' 03.3" N, 67 deg 00' 01.9" E | `24.967583333`, `67.000527778` |
| C3 | 24 deg 58' 09.5" N, 66 deg 59' 57.8" E | `24.969305556`, `66.999388889` |
| C4 | 24 deg 58' 09.5" N, 67 deg 00' 02.0" E | `24.969305556`, `67.000555556` |

## Validation

Run:

```bash
npm run test:map-data
npm run test:graph-validation
npm run test:routing
```

The legacy map-data test validates coordinate shape, broad Karachi bounds, venue bounds for blocks, polygon validity, graph references, DMS conversions, searchability, destination marker resolution, and all block-to-block routes.

For v2 data and routing, run:

```bash
npm run test:map-data-v2
npm run test:navigation-graph-v2
npm run test:entry-gate-routing
npm run test:route-smoke-v2
npm run test:production-v2-defaults
npm run test:offline-v2
npm run test:v1-v2-isolation
```
