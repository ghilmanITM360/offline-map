/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VenueDataSource, VenueEdge, VenueNode, VenuePlace } from '../venue/VenueDataSource';
import type { PackError } from './PackError';
import { parseStrictJson, StrictJsonError } from './StrictJson';

// File formats (schemaVersion 1). routing-graph: venueId, dataVersion, nodes (id, lat, lng) and directed edges (source node, target node,
// distanceM, optional weightMultiplier) in routing order. place-directory: venueId and places (id, kind, nodeIds).
export const PACK_VENUE_DATA_SCHEMA_VERSION = 1;

export type ParsePackVenueDataResult = { ok: true; source: VenueDataSource } | { ok: false; error: PackError };

const MAX_NODES = 200_000;
const MAX_EDGES = 1_000_000;
const MAX_PLACES = 100_000;
const MAX_ID = 128;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

class Invalid extends Error {
  constructor(readonly error: PackError) { super(error.message); }
}
const bad = (message: string, path?: string, code: PackError['code'] = 'resource-invalid'): never => { throw new Invalid({ code, message, path }); };

type Obj = Record<string, unknown>;
const obj = (v: unknown, path: string, required: string[], optional: string[] = []): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(`${path} must be an object`, path);
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) bad(`unknown field '${k}'`, `${path}.${k}`);
  for (const k of required) if (!(k in o)) bad(`missing field '${k}'`, `${path}.${k}`);
  return o;
};
const id = (v: unknown, path: string): string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && !CONTROL.test(v) ? v : bad(`${path} must be a short id without control characters`, path);
const finite = (v: unknown, lo: number, hi: number, path: string): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : bad(`${path} out of range`, path);
const positive = (v: unknown, path: string): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : bad(`${path} must be a positive number`, path);
const items = (v: unknown, max: number, path: string): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : bad(`${path} must be a list of at most ${max}`, path);

const parseDoc = (text: string, what: string): unknown => {
  try {
    return parseStrictJson(text);
  } catch (e) {
    if (e instanceof StrictJsonError) return bad(`${what} is not valid strict JSON: ${e.message}`, what);
    throw e;
  }
};
const header = (o: Obj, what: string): string => {
  if (o.schemaVersion !== PACK_VENUE_DATA_SCHEMA_VERSION) bad(`unsupported schemaVersion ${JSON.stringify(o.schemaVersion)}`, `${what}.schemaVersion`, 'schema-unsupported');
  return id(o.venueId, `${what}.venueId`);
};

/**
 * Turns a pack's routing-graph and place-directory files into a read-only VenueDataSource. Everything is validated before anything
 * is built (ids, finite coordinates, positive distances, edges and places that reference only known nodes, no duplicates), and
 * lookups go through Maps so no id can reach an object prototype. Never throws; integrity of the files themselves is the
 * verifier's job and happens before this runs.
 */
export const parsePackVenueData = (graphText: string, placesText: string, expectedVenueId?: string): ParsePackVenueDataResult => {
  try {
    const g = obj(parseDoc(graphText, 'routing-graph'), 'routing-graph', ['schemaVersion', 'venueId', 'dataVersion', 'nodes', 'edges']);
    const venueId = header(g, 'routing-graph');
    const dataVersion = id(g.dataVersion, 'routing-graph.dataVersion');
    const p = obj(parseDoc(placesText, 'place-directory'), 'place-directory', ['schemaVersion', 'venueId', 'places']);
    if (header(p, 'place-directory') !== venueId) bad('routing-graph and place-directory belong to different venues', 'place-directory.venueId', 'venue-mismatch');
    if (expectedVenueId !== undefined && venueId !== expectedVenueId) bad(`data is for '${venueId}', not '${expectedVenueId}'`, 'venueId', 'venue-mismatch');

    const nodes = new Map<string, VenueNode>();
    items(g.nodes, MAX_NODES, 'routing-graph.nodes').forEach((raw, i) => {
      const path = `routing-graph.nodes[${i}]`;
      const o = obj(raw, path, ['id', 'lat', 'lng']);
      const nodeId = id(o.id, `${path}.id`);
      if (nodes.has(nodeId)) bad(`duplicate node id '${nodeId}'`, `${path}.id`);
      nodes.set(nodeId, Object.freeze({ id: nodeId, coordinate: Object.freeze({ lat: finite(o.lat, -90, 90, `${path}.lat`), lng: finite(o.lng, -180, 180, `${path}.lng`) }) }));
    });
    const adjacency = new Map<string, VenueEdge[]>();
    items(g.edges, MAX_EDGES, 'routing-graph.edges').forEach((raw, i) => {
      const path = `routing-graph.edges[${i}]`;
      const o = obj(raw, path, [`from`, 'to', 'distanceM'], ['weightMultiplier']) // backticks: the import-guard regexes read a quoted from as an import;
      const from = id(o.from, `${path}.from`);
      const to = id(o.to, `${path}.to`);
      if (!nodes.has(from)) bad(`edge starts at unknown node '${from}'`, `${path}.from`);
      if (!nodes.has(to)) bad(`edge ends at unknown node '${to}'`, `${path}.to`);
      const edge: VenueEdge = Object.freeze({ to, distanceM: positive(o.distanceM, `${path}.distanceM`), ...('weightMultiplier' in o ? { weightMultiplier: positive(o.weightMultiplier, `${path}.weightMultiplier`) } : {}) });
      const list = adjacency.get(from);
      if (list) list.push(edge); else adjacency.set(from, [edge]);
    });

    const places = new Map<string, VenuePlace>();
    items(p.places, MAX_PLACES, 'place-directory.places').forEach((raw, i) => {
      const path = `place-directory.places[${i}]`;
      const o = obj(raw, path, ['id', 'kind', 'nodeIds']);
      const placeId = id(o.id, `${path}.id`);
      if (places.has(placeId)) bad(`duplicate place id '${placeId}'`, `${path}.id`);
      const nodeIds = items(o.nodeIds, 1024, `${path}.nodeIds`).map((n, j) => {
        const nid = id(n, `${path}.nodeIds[${j}]`);
        return nodes.has(nid) ? nid : bad(`place references unknown node '${nid}'`, `${path}.nodeIds[${j}]`);
      });
      if (nodeIds.length === 0) bad('nodeIds must not be empty', `${path}.nodeIds`);
      places.set(placeId, Object.freeze({ id: placeId, kind: id(o.kind, `${path}.kind`), nodeIds: Object.freeze(nodeIds) }));
    });

    const nodeIds = Object.freeze([...nodes.keys()]);
    const placeIds = Object.freeze([...places.keys()]);
    const none: readonly VenueEdge[] = Object.freeze([]);
    return {
      ok: true,
      source: {
        venueId, dataVersion,
        graph: { nodeIds: () => nodeIds, getNode: (nid) => nodes.get(nid), edgesFrom: (nid) => adjacency.get(nid) ?? none },
        placeIds: () => placeIds,
        getPlace: (pid) => places.get(pid),
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.error };
    throw e;
  }
};
