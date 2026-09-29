# Data, GIS, and Field Requirements

## Source of truth

All venue/GIS data is hand-typed TypeScript under `src/data/ijtema/*` — there is no GeoJSON, checksum, or generated-source pipeline. Treat any doc or comment implying otherwise as aspirational, not current.

## Coordinate shapes

Two different shapes coexist by design (see `docs/ARCHITECTURE.md` for why v1/v2 stay separate):
- v1 (`src/constants/data.ts`): `{ lat, lng }`
- v2/UI boundary (`src/data/ijtema/*` and components): `{ latitude, longitude }`

Do not assume one shape when reading unfamiliar code — check which system the file belongs to first.

## Street graph

Built from OSM extract, simplified for routing use. Per the last recorded validation pass: raw OSM ~14,376 nodes / ~18,629 edges, reduced after excluding 5 disconnected clusters; all 17 named gates snap to the graph within ≤27.5m. Treat these as the last-measured figures, not a live-recomputed guarantee — re-run the graph validation script if venue data changes before citing exact numbers in a release artifact.

## Editing procedures

Adding or changing a block/gate/rasta requires editing the corresponding `src/data/ijtema/*.ts` file plus the matching v1 constant if rollback parity matters, and running the routing/gate test suite (`npm run test:all-gates-v2`, `npm run test:core-provider-routing-contract-v2`) before merging — see `AGENTS.md` for the full required-validation list.

## Not built (do not assume it exists)

A generated-source pipeline (GeoJSON input → generator script → checksummed output) has been proposed in past design docs but was never implemented. If you need this, it's new work, not a bug fix.

## Field verification status

Gate connector geometry for two gates has not been field-surveyed (#43, #44) and must not be assumed routable from map data alone. Location-capability runtime behavior across the full LOC-01..12 matrix has been emulator-verified only for LOC-01..05, 07 (partial), 12; LOC-06/08/09/10/11 (remainder of closed #45, tracked in #46) remain PHYSICAL DEVICE REQUIRED. Do not report GIS or location facts as confirmed beyond what's actually been surveyed or device-tested — see the evidence-level rule in `AGENTS.md`.
