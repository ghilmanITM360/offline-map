# Venue pack tool

`tools/venue-pack/venue-pack.cjs` turns your venue's data into an offline pack the SDK accepts. It is **one file, plain Node 18+, no installs**, and it is the same
deterministic compiler (`compilePack`) the SDK's own tests use, so the manifest it writes is one `PackManager` will verify. It does not survey a venue: the graph and
the places must come from the venue's owner or a survey. It never signs, never deletes, and never writes into a folder that already exists.

## Input folder

```text
my-venue/
  pack.spec.json              what the pack is (see below)
  input/
    map/basemap.pmtiles       your offline basemap (PMTiles v3)
    data/routing-graph.json   nodes and directed edges
    data/place-directory.json the places people can choose, each tied to graph node(s)
    data/gate-metadata.json   venue-scoped JSON about gates/entrances ({"schemaVersion":1,"venueId":"…","gates":[]} is valid)
    data/localization.json    place names per language
    PROVENANCE.json           where the data came from (any venue-scoped JSON)
```

`examples/synthetic-venue/` is exactly this, filled with an invented six-point venue (it follows no real path and is free to copy). File names under `input/` are yours; the
spec lists each one with its kind.

**`routing-graph.json`**: `{ "schemaVersion": 1, "venueId", "dataVersion", "nodes": [{ "id", "lat", "lng" }], "edges": [{ "from", "to", "distanceM", "weightMultiplier"? }] }`.
Edges are **directed**: write both directions for a two-way path. `distanceM` is the walking length in metres (positive); `weightMultiplier` (positive) makes a segment cost
more or less (stairs, a crowded path).

**`place-directory.json`**: `{ "schemaVersion": 1, "venueId", "places": [{ "id", "kind", "nodeIds": ["…"] }] }`. A place with several nodes (a block with several doors) is reachable at
any of them.

**`localization.json`**: `{ "schemaVersion": 1, "venueId", "languages": ["en"], "entries": [{ "id": "<place id>", "names": { "en": "Main hall" } }] }`.

All five data files must carry the same `venueId` as the spec.

## `pack.spec.json`

| Field | Meaning |
| --- | --- |
| `packId` | `"<venueId>@<packVersion>"` exactly |
| `venueId`, `packVersion` | your venue id; `x.y.z` |
| `sdkCompatibility` | SDK versions the pack loads in, `">=0.1.0 <0.2.0"` for this SDK |
| `routingPolicyVersion` | your label for the routing rules the data was built for |
| `createdAt` | UTC time (`2026-11-03T00:00:00Z`) you give it; the tool never reads the clock, so the same input always gives the same bytes |
| `minimumPlatformCapabilities` | `["pmtiles-local-read"]` |
| `bounds` | `{ west, south, east, north }` of the map archive |
| `languages` | language codes your names cover |
| `resources` | every file with its `path` (relative to `input/`) and `kind`: `map-archive`, `routing-graph`, `place-directory`, `gate-metadata`, `localization`, `provenance` (one of each; optional `map-style`) |
| `attributions` | at least one `{ name, license, url? }` (the basemap's data licence, for example OpenStreetMap ODbL) |
| `provenance` | `{ source, licence, sourceRevision?, generatedBy? }` |

## Commands

```bash
# build + verify + checksum (the output folder must not exist yet)
node tools/venue-pack/venue-pack.cjs compile --spec my-venue/pack.spec.json --input my-venue/input --out ./build/my-venue [--strict]

# re-check a pack later (also on the machine that ships it); --pin compares the manifest digest your app pins
node tools/venue-pack/venue-pack.cjs verify ./build/my-venue/pack --pin <manifest sha-256>

# copy a verified pack into an Expo app and print the bundledPackTable.ts entry
node tools/venue-pack/venue-pack.cjs app-assets --pack ./build/my-venue/pack --app ./my-app
```

`compile` writes, inside the new `--out` folder: `pack/` (the files your app ships, with `pack.manifest.json`), `pack.pin.json` (the manifest digest and every file's size and
SHA-256) and `SHA256SUMS.txt` (check with `cd <out> && shasum -a 256 -c SHA256SUMS.txt`). It prints the **manifest SHA-256**: that digest is the pin you put in
`bundledPackTable.ts`; it is what authenticates a bundled pack, because no signing scheme exists yet.

## What it checks

Before any output exists: the spec's fields; that the input folder holds exactly the declared files (nothing undeclared or missing, no symbolic links); strict JSON; a graph with
unique node ids, finite in-range coordinates, positive distances and edges that end at known nodes; places that name known nodes; one `venueId` across all files.

Warnings (printed, build continues; `--strict` turns them into refusals): a place no route reaches from the first place; an edge shorter than the straight line between its nodes
(the router would then prefer longer routes); localization for an unknown place or an undeclared language. Gates the venue genuinely does not connect are the reason warnings are not errors.

Then the compiler: safe relative paths, no duplicate or case-colliding paths, a `packId` that matches, a compatible SDK range, required kinds, and a re-verification of the finished
folder with the SDK's own verifier.

## Errors you may see

Every error is `error: <code>: <message>` followed by a `hint:` and exit code 1 (2 for wrong usage).

| Code | Fix |
| --- | --- |
| `spec-invalid`, `spec-unreadable` | the named field is missing or has the wrong type; compare with `examples/synthetic-venue/pack.spec.json` |
| `resource-undeclared` / `resource-missing` | list the file under `resources`, or add/remove the file |
| `required-resource-missing` | one resource of each required kind |
| `venue-conflict`, `pack-id-mismatch` | use one `venueId` everywhere; `packId` = `venueId@packVersion` |
| `venue-data-invalid` | the message names the exact field, for example `routing-graph.edges[3].to: edge ends at unknown node 'x'` |
| `symlink-refused`, `resource-path-unsafe` | replace links with real files; use plain relative paths |
| `pin-mismatch`, any pack error from `verify` | the pack changed after it was built; rebuild it |
| `output-exists` / "already exists" | choose a new folder: the tool will not overwrite or delete anything |

## Using the pack in an app

`app-assets` copies the pack's files to `assets/packs/<packId>/` as Metro `.packfile` assets (never overwriting) and prints the table entry. The app copies each pack into private storage,
trusts it only while every byte hashes to the pinned manifest, and repairs a damaged copy from the packaged one at the next start ([INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §8,
[OFFLINE_PACK_SPEC.md](../OFFLINE_PACK_SPEC.md)). Remote or imported packs are refused until a signing scheme exists.

Data rights: the tool does not grant any. Your venue data and your basemap must be yours to redistribute; keep the basemap's attribution in `attributions`.

## Client data intake: `import` and `merge`

Survey data arrives in the client workbook (`Karachi_Ijtema_Client_Location_Data_Template.xlsx`: Ilaqas, Tents, Facilities, Access_Points, Gates_Changes, Blocks_Changes, Geometry_Files, Metadata), as UTF-8 CSV files named after those sheets, and as GeoJSON for polygons and paths. The chain is import, validate, **review**, merge, then the existing `compile` and `verify`. There is no second compiler.

```bash
# 1. read + validate (writes a fresh candidate folder: candidate.json, findings.json, SUMMARY.txt, candidate.sha256)
venue-pack import --workbook client.xlsx --base <current pack folder> --out <new candidate folder> [--geojson <folder of .geojson>]
# 2. a responsible person reads SUMMARY.txt and, for a NEEDS_REVIEW candidate, writes approval.json
#    {"candidateSha256": "...", "approvedBy": "...", "approvedOn": "YYYY-MM-DD", "acknowledge": ["DUPLICATE_NAME", ...]}
# 3. apply the approved candidate to a copy of the base pack's resources and write a spec for the existing compiler
venue-pack merge --candidate <candidate folder> --base <current pack folder> --pack-version 1.2.0 --approval approval.json --out <new folder>
# 4. the existing tools
venue-pack compile --spec <new folder>/pack.spec.json --input <new folder>/input --out <final folder>
venue-pack verify <final folder>/pack
```

Outcomes: `ACCEPT`, `ACCEPT_AS_PENDING` (valid, with places that have no location yet), `NEEDS_REVIEW` (a person must decide something: duplicate names, a placeholder name, a change to a verified coordinate, an ambiguous block, unconfirmed rights), `REJECT` (an error; nothing is carried forward and the command exits 1). Findings are errors, warnings or review items and name the sheet, row and field.

What it will not do: invent a coordinate (a blank is *pending*, never zero), treat a block corner as an entrance, assign a tent to a block unless the point is inside exactly one polygon, apply a proposed change to a verified gate or block (those are recorded as change requests and need a separate reviewed change), add a route (a verified access point or a walkable path is recorded but adds no graph edge), overwrite an existing folder, follow a link, or read a macro, external link or encrypted workbook. The header `Logitude` (the original workbook's spelling) is accepted as `longitude`. Identifiers are assigned once (`IL-0001`…) and are never derived from names or row numbers; a duplicate name stays a separate record flagged `DUPLICATE_NAME`, and a placeholder name keeps its id but is not offered in search. A candidate whose rights are not confirmed with a named authority is marked **internal-only**.
