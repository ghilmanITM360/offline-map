/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.2: the real Karachi (Ijtema) pack, built from tracked assets and data. Checks that the pack carries exactly the repository's
// graph, places and gate facts (nothing invented, Gates 18/19 still unconnected), that the build is reproducible and pinned, and that
// the SDK loader turns it back into a venue that routes identically to the host's own data.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBestVenuePath, parsePackManifest, parsePackVenueData, type PackManifest } from '@muslim-ummah/offline-navigation';
import { IJTEMA_GATES } from '../data/ijtema/gates';
import { IJTEMA_NAVIGATION_GRAPH_V2 } from '../data/ijtema/navigationGraph';
import { IJTEMA_VENUE_SOURCE } from '../data/ijtema/venueAdapter';
import { buildKarachiPack, KARACHI_PIN_FILE, KARACHI_PMTILES_SHA256 } from '../../scripts/sdk-pack/karachi';

const sha = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');
let out: string;
beforeEach(() => { out = mkdtempSync(join(tmpdir(), 'sdk-karachi-')); });
afterEach(() => { rmSync(out, { recursive: true, force: true }); });

const read = (dir: string, p: string): string => readFileSync(join(dir, p), 'utf8');
const resource = (m: PackManifest, kind: PackManifest['resources'][number]['kind']) => m.resources.find((r) => r.kind === kind)!;

describe('Karachi pack build', () => {
  it('ships the tracked PMTiles archive byte-for-byte and records its known digest', async () => {
    const { manifest } = await buildKarachiPack(join(out, 'a'));
    expect(KARACHI_PMTILES_SHA256).toBe('d5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0');
    expect(resource(manifest, 'map-archive')).toMatchObject({ bytes: 434589, sha256: KARACHI_PMTILES_SHA256 });
    expect(sha(readFileSync(join(out, 'a', resource(manifest, 'map-archive').path)))).toBe(KARACHI_PMTILES_SHA256);
  });

  it('is a complete, unsigned, versioned pack with OSM attribution and provenance', async () => {
    const { manifest, manifestText } = await buildKarachiPack(join(out, 'a'));
    expect(parsePackManifest(manifestText)).toMatchObject({ ok: true });
    expect(manifest).toMatchObject({ venueId: 'karachi-ijtema', packId: 'karachi-ijtema@1.0.0', packVersion: '1.0.0', schemaVersion: 1 });
    expect(manifest.keyId).toBeUndefined();
    expect(manifest.attributions.map((a) => a.name)).toContain('© OpenStreetMap contributors');
    expect(manifest.attributions.find((a) => a.name.includes('OpenStreetMap'))).toMatchObject({ license: expect.stringContaining('ODbL') });
    expect(manifest.provenance.source).toContain('OpenStreetMap');
    expect(manifest.fileCount).toBe(6);
    const provenance = JSON.parse(read(join(out, 'a'), resource(manifest, 'provenance').path));
    expect(provenance.basemap.archive.sha256).toBe(KARACHI_PMTILES_SHA256);
    expect(provenance.basemap.attribution).toBe('© OpenStreetMap contributors');
    expect(provenance.knownLimitations.join(' ')).toMatch(/GATE_18/);
  });

  it('is reproducible and matches the committed pin; changing the data would have to change the pin deliberately', async () => {
    const first = await buildKarachiPack(join(out, 'a'));
    const second = await buildKarachiPack(join(out, 'b'));
    expect(second.manifestText).toBe(first.manifestText);
    expect(existsSync(KARACHI_PIN_FILE)).toBe(true);
    const pin = JSON.parse(readFileSync(KARACHI_PIN_FILE, 'utf8'));
    expect(pin.manifestSha256).toBe(first.manifestSha256);
    expect(pin.resources).toEqual(first.manifest.resources.map((r) => ({ path: r.path, kind: r.kind, bytes: r.bytes, sha256: r.sha256 })));
  });
});

describe('Karachi pack data is the repository data, not an invention', () => {
  it('rebuilds a venue whose graph, places and routes equal the host venue source', async () => {
    const { manifest } = await buildKarachiPack(join(out, 'a'));
    const dir = join(out, 'a');
    const loaded = parsePackVenueData(read(dir, resource(manifest, 'routing-graph').path), read(dir, resource(manifest, 'place-directory').path), 'karachi-ijtema');
    if (!loaded.ok) throw new Error(loaded.error.message);
    const venue = loaded.source;
    const host = IJTEMA_VENUE_SOURCE;
    expect(venue.venueId).toBe('karachi-ijtema');
    expect(venue.dataVersion).toBe(host.dataVersion);
    expect([...venue.graph.nodeIds()]).toEqual([...host.graph.nodeIds()]);
    for (const id of host.graph.nodeIds()) {
      expect(venue.graph.getNode(id)?.coordinate).toEqual(host.graph.getNode(id)?.coordinate);
      expect(venue.graph.edgesFrom(id).map((e) => [e.to, e.distanceM, e.weightMultiplier]))
        .toEqual(host.graph.edgesFrom(id).map((e) => [e.to, e.distanceM, e.weightMultiplier]));
    }
    expect([...venue.placeIds()]).toEqual([...host.placeIds()]);
    for (const id of host.placeIds()) expect(venue.getPlace(id)).toEqual(host.getPlace(id));

    const gates = host.placeIds().filter((id) => host.getPlace(id)?.kind === 'gate');
    const blocks = host.placeIds().filter((id) => host.getPlace(id)?.kind === 'block');
    let compared = 0;
    for (const g of gates) {
      for (const b of blocks.filter((_, i) => i % 5 === 0)) {
        const a = findBestVenuePath(venue.graph, venue.getPlace(g)!.nodeIds, venue.getPlace(b)!.nodeIds);
        const h = findBestVenuePath(host.graph, host.getPlace(g)!.nodeIds, host.getPlace(b)!.nodeIds);
        expect(a?.costM).toBe(h?.costM);
        expect(a?.nodes).toEqual(h?.nodes);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('keeps Gates 18 and 19 field-blocked: flagged unroutable from outside, and no edge touches either', async () => {
    const { manifest } = await buildKarachiPack(join(out, 'a'));
    const dir = join(out, 'a');
    const gatesDoc = JSON.parse(read(dir, resource(manifest, 'gate-metadata').path));
    expect(gatesDoc.venueId).toBe('karachi-ijtema');
    const byId = new Map<string, any>(gatesDoc.gates.map((g: any) => [g.id, g]));
    expect(byId.size).toBe(IJTEMA_GATES.length);
    for (const id of ['GATE_18', 'GATE_19']) {
      expect(byId.get(id)).toMatchObject({ canStartRouteFromOutside: false, connectorStatus: 'ground_truth_required' });
      expect(byId.get(id).userFacingBehavior.routeSelection).toBe('disabled');
    }
    for (const g of IJTEMA_GATES) {
      expect(byId.get(g.id)).toMatchObject({ canStartRouteFromOutside: g.canStartRouteFromOutside, connectorStatus: g.connectorStatus, status: g.status, routingStatus: g.routingStatus, lat: g.coordinate?.lat, lng: g.coordinate?.lng });
    }
    const graph = JSON.parse(read(dir, resource(manifest, 'routing-graph').path));
    const touching = graph.edges.filter((e: any) => /^GATE_(18|19)$/.test(e.from) || /^GATE_(18|19)$/.test(e.to));
    expect(touching).toEqual([]);
    const directed = Object.values(IJTEMA_NAVIGATION_GRAPH_V2.adjacency).reduce((n, l) => n + l.length, 0);
    expect(graph.edges).toHaveLength(directed); // the pack adds and drops no connectivity
    expect(graph.nodes).toHaveLength(Object.keys(IJTEMA_NAVIGATION_GRAPH_V2.nodes).length);
  });

  it('names every place in the three languages the host already ships, and nothing else', async () => {
    const { manifest } = await buildKarachiPack(join(out, 'a'));
    const dir = join(out, 'a');
    const loc = JSON.parse(read(dir, resource(manifest, 'localization').path));
    expect(manifest.languages).toEqual(['en', 'ur', 'ur-Latn']);
    expect(loc.languages).toEqual(manifest.languages);
    const places = JSON.parse(read(dir, resource(manifest, 'place-directory').path)).places.map((p: any) => p.id);
    expect(loc.entries.map((e: any) => e.id)).toEqual(places);
    const gate1 = loc.entries.find((e: any) => e.id === 'GATE_01');
    expect(gate1.names).toEqual({ en: 'Gate 01', ur: 'گیٹ 01', 'ur-Latn': 'Gate 01' });
  });
});
