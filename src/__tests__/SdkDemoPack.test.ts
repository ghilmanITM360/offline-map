/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.3: the consumer's second bundled pack (a synthetic venue) is reproducible, pinned, isolated from Karachi, and loads back to the
// same venue the sample app used to hard-code.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePackVenueData } from '@muslim-ummah/offline-navigation';
import { demoVenue } from '../../examples/expo-consumer/demoVenue';
import { DEMO_PIN_FILE, buildDemoPack } from '../../scripts/sdk-pack/demo';
import { buildKarachiPack } from '../../scripts/sdk-pack/karachi';

// Real-filesystem tests (fsync, rename, directory trees) slow down badly when the whole suite runs in parallel; assertions are unchanged.
jest.setTimeout(60_000);

let out: string;
beforeEach(() => { out = mkdtempSync(join(tmpdir(), 'sdk-demo-pack-')); });
afterEach(() => { rmSync(out, { recursive: true, force: true }); });

it('is reproducible, matches its committed pin, and loads back to the demo venue', async () => {
  const first = await buildDemoPack(join(out, 'a'));
  expect((await buildDemoPack(join(out, 'b'))).manifestText).toBe(first.manifestText);
  expect(JSON.parse(readFileSync(DEMO_PIN_FILE, 'utf8')).manifestSha256).toBe(first.manifestSha256);
  const file = (kind: string) => readFileSync(join(out, 'a', first.manifest.resources.find((r) => r.kind === kind)!.path), 'utf8');
  const loaded = parsePackVenueData(file('routing-graph'), file('place-directory'), 'synthetic-demo-venue');
  if (!loaded.ok) throw new Error(loaded.error.message);
  expect([...loaded.source.graph.nodeIds()]).toEqual([...demoVenue.graph.nodeIds()]);
  for (const id of demoVenue.graph.nodeIds()) {
    expect(loaded.source.graph.getNode(id)?.coordinate).toEqual(demoVenue.graph.getNode(id)?.coordinate);
    expect(loaded.source.graph.edgesFrom(id).map((e) => [e.to, e.distanceM])).toEqual(demoVenue.graph.edgesFrom(id).map((e) => [e.to, e.distanceM]));
  }
  expect([...loaded.source.placeIds()]).toEqual([...demoVenue.placeIds()]);
});

it('shares no venue id, pack id or data digest with the Karachi pack, so the two can never be mistaken for each other', async () => {
  const demo = await buildDemoPack(join(out, 'demo'));
  const karachi = await buildKarachiPack(join(out, 'karachi'));
  expect(demo.manifest.venueId).not.toBe(karachi.manifest.venueId);
  expect(demo.manifest.packId).not.toBe(karachi.manifest.packId);
  const data = (m: typeof demo.manifest) => m.resources.filter((r) => r.kind !== 'map-archive').map((r) => r.sha256);
  expect(data(demo.manifest).filter((h) => data(karachi.manifest).includes(h))).toEqual([]);
  // The one thing they share on purpose is the basemap archive, byte for byte.
  expect(demo.manifest.resources.find((r) => r.kind === 'map-archive')?.sha256).toBe(karachi.manifest.resources.find((r) => r.kind === 'map-archive')?.sha256);
});
