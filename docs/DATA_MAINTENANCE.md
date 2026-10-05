# Venue data maintenance (#133)

Repository-controlled, versioned, validated, reviewable. There is no admin backend, spreadsheet or
GIS tool: the project owns TypeScript data and one generator, and this is the only supported flow.

## What is canonical

| Data | Files | Kind |
|---|---|---|
| Gates, blocks, rastas, special routes, central points, perimeter connectors, bounds, entry policy, data issues (ids, names/aliases, coordinates, status) | `src/data/ijtema/{gates,gateMeta,blocks,rastas,specialRoutes,centralPoints,perimeterConnectors,mapBounds,entryPolicy,dataIssues}.ts` | **human-edited, canonical** |
| Outside street graph (OSM, columnar) | `src/data/ijtema/streetGraph.ts` | **generated** by `scripts/generate-street-graph.ts` (+ `pedestrianProfile.ts`), committed |
| Venue route graph, connector reports | `graphBuilder.ts`, `navigationGraph.ts` | **derived** at import time, never edited |
| Legacy v1 dataset | `src/constants/data.ts` | rollback only (#117), do not extend |
| Checksums + provenance | `src/data/ijtema/DATA_MANIFEST.json` | machine fields generated, `provenance` block human-edited |

Gate/survey facts come only from confirmed sources (`DATA_GIS_AND_FIELD_REQUIREMENTS.md`); never invent a
coordinate or connector (Gate 18/19, Mimbar stay blocked until surveyed).

## Procedure

1. **Edit source** in one branch: the human-edited file(s) above. For a street-graph refresh run
   `node --import tsx scripts/generate-street-graph.ts` (live Overpass: the result is not byte-identical to
   an earlier run; the committed file is the immutable artifact).
2. **Validate:** `npm run data:check`. It runs the v2 structural validator (unique ids/aliases, finite
   in-bounds coordinates, names, orphan segment/junction refs, disconnected destinations) plus supported
   categories, undocumented near-duplicate points, special-route references, street-graph structure (dangling
   edges, index ranges, metadata counts, connectors), street + venue graph reachability for verified gates and
   every block, and manifest drift.
3. **Regenerate the manifest:** `npm run data:manifest`. Then edit `provenance` by hand (`dataVersion`,
   `updatedOn`, `editor`, `note` — who changed what and why).
4. **Test:** `npm test` (includes `test:venue-data-maintenance`, `test:map-data-v2`, `test:street-graph-v2`,
   routing suites) and `npm run typecheck`.
5. **Inspect the diff:** data files, `DATA_MANIFEST.json` hashes and counts must move together; a data
   change without a manifest change fails `data:check`.
6. **Commit and push** to a branch; **open a PR**. The reviewer checks the data diff against the survey source
   and the provenance note. CI (`npm test`) repeats the check; rollback is `git revert` of the merge.

`data:check` is deterministic: hashes are CRLF-normalised and the manifest build is a pure function of the
committed files. Only the live Overpass fetch is non-deterministic, which is why the artifact is committed and
hash-pinned rather than regenerated in CI.

## Provenance of the current baseline

`baseline-2026-10-05`: checksums of the data as merged on canonical, no data content changed. Street graph:
OSM via Overpass, generated 2026-09-17T21:21:01Z, profile `2026-08-15-v2` (details and licence in
`DATA_GIS_AND_FIELD_REQUIREMENTS.md`).

## Not covered

Non-developer authoring (Excel/GeoJSON import), event/year versioning and a visual editor are not built; the
owner questionnaire in #133 is superseded by this repo-controlled flow unless the owner asks for more.
