// B9.1 headless checks for the offline venue pack contract: strict manifest parsing, compatibility and
// integrity/trust verification. Pure domain only; hashing, file reads and signatures are injected fakes here.
import { strict as assert } from 'node:assert';
import {
  checkPackCompatibility, parsePackManifest, parsePackVenueData, verifyPack,
  type PackManifest, type PackResourceKind, type PackVerifyPorts,
} from '../../packages/offline-navigation/src/domain/pack';

const H = (c: string): string => c.repeat(64);
const KINDS: PackResourceKind[] = ['map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance'];
export const sampleManifest = (over: Partial<PackManifest> = {}): PackManifest => ({
  schemaVersion: 1,
  packId: 'karachi-ijtema@1.2.0',
  venueId: 'karachi-ijtema',
  packVersion: '1.2.0',
  sdkCompatibility: '>=0.1.0 <0.2.0',
  routingPolicyVersion: '1',
  createdAt: '2026-10-24T00:00:00Z',
  minimumPlatformCapabilities: ['pmtiles-local-read'],
  bounds: { west: 66.9, south: 24.8, east: 67.2, north: 25.0 },
  languages: ['en', 'ur'],
  totalBytes: KINDS.length * 100,
  fileCount: KINDS.length,
  resources: KINDS.map((kind, i) => ({ path: `data/${kind}.bin`, kind, bytes: 100, sha256: H(String(i + 1)) })),
  attributions: [{ name: 'OpenStreetMap contributors', license: 'ODbL-1.0' }],
  provenance: { source: 'surveyed', licence: 'owner' },
  ...over,
});
const text = (m: unknown): string => JSON.stringify(m);

export const packChecks = (check: (name: string, fn: () => void | Promise<void>) => Promise<void>): Promise<void> => (async () => {
  const code = (t: string) => { const r = parsePackManifest(t); return r.ok ? 'ok' : r.error.code; };

  await check('pack: a well-formed manifest parses and keeps its exact text', () => {
    const t = text(sampleManifest());
    const r = parsePackManifest(t);
    assert.ok(r.ok);
    assert.equal(r.manifest.venueId, 'karachi-ijtema');
    assert.equal(r.manifestText, t);
  });

  await check('pack: strict JSON - duplicate keys, __proto__, trailing commas, non-finite numbers and empty input are rejected as malformed', () => {
    assert.equal(code('{"a":1,"a":2}'), 'manifest-malformed');
    assert.equal(code(text(sampleManifest()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')), 'manifest-malformed');
    assert.equal(code('{"__proto__":{}}'), 'manifest-malformed');
    assert.equal(code(text(sampleManifest()).replace('}]', '},]')), 'manifest-malformed');
    assert.equal(code(text(sampleManifest()).replace('"bytes":100', '"bytes":1e999')), 'manifest-malformed');
    assert.equal(code('[]'), 'field-invalid'); // valid JSON, but not a manifest object
    assert.equal(code(''), 'manifest-malformed');
  });

  await check('pack: unsupported schema versions and unknown top-level fields are rejected, not guessed at', () => {
    assert.equal(code(text(sampleManifest({ schemaVersion: 2 as 1 }))), 'schema-unsupported');
    assert.equal(code(text({ ...sampleManifest(), surprise: true })), 'field-invalid');
  });

  await check('pack: field validation covers ids, versions, bounds, hashes, counts and required resource kinds', () => {
    assert.equal(code(text(sampleManifest({ venueId: 'Bad Venue' }))), 'field-invalid');
    assert.equal(code(text(sampleManifest({ packVersion: '1.2' }))), 'field-invalid');
    assert.equal(code(text(sampleManifest({ bounds: { west: 67.3, south: 24.8, east: 67.2, north: 25.0 } }))), 'field-invalid');
    assert.equal(code(text(sampleManifest({ languages: [] }))), 'field-invalid');
    assert.equal(code(text(sampleManifest({ fileCount: 5 }))), 'totals-mismatch');
    assert.equal(code(text(sampleManifest({ totalBytes: 1 }))), 'totals-mismatch');
    const m = sampleManifest();
    assert.equal(code(text({ ...m, resources: m.resources.map((r, i) => i === 0 ? { ...r, sha256: 'ABC' } : r) })), 'field-invalid');
    assert.equal(code(text({ ...m, resources: m.resources.map((r, i) => i === 0 ? { ...r, kind: 'executable' } : r) })), 'field-invalid');
    const noMap = m.resources.filter((r) => r.kind !== 'map-archive');
    assert.equal(code(text({ ...m, resources: noMap, fileCount: 5, totalBytes: 500 })), 'required-resource-missing');
  });

  await check('pack: resource paths must stay inside the pack (traversal, absolute, drive, backslash, NUL, dot segments, duplicates, case collisions)', () => {
    const base = sampleManifest();
    const withPath = (p: string) => text({ ...base, resources: base.resources.map((r, i) => i === 0 ? { ...r, path: p } : r) });
    for (const bad of ['../evil.bin', 'a/../../b', '/abs.bin', 'C:/x.bin', 'a\\b.bin', 'a\u0000b', './a.bin', 'a//b.bin', 'a/', '']) {
      assert.equal(code(withPath(bad)), 'resource-path-unsafe', JSON.stringify(bad));
    }
    const dup = text({ ...base, resources: base.resources.map((r, i) => i === 1 ? { ...r, path: base.resources[0].path } : r) });
    assert.equal(code(dup), 'resource-duplicate');
    const upper = text({ ...base, resources: base.resources.map((r, i) => i === 1 ? { ...r, path: base.resources[0].path.toUpperCase() } : r) });
    assert.equal(code(upper), 'resource-duplicate');
  });

  await check('pack: stricter path and text rules (device names, forbidden chars, scripts, invisible chars, folds, file-vs-directory, singleton kinds)', () => {
    const base = sampleManifest();
    const withPath = (p: string) => text({ ...base, resources: base.resources.map((r, i) => i === 0 ? { ...r, path: p } : r) });
    for (const bad of ['CON.txt', 'data/nul', 'a:b.bin', 'x<y.bin', 'data/run.js', 'data/m.WASM', 'u\u202e.bin', 'a\u200b.bin', 'trail.', 'caf\u0065\u0301.bin']) {
      assert.equal(code(withPath(bad)), 'resource-path-unsafe', JSON.stringify(bad));
    }
    const twoPaths = (p0: string, p1: string) => text({ ...base, resources: base.resources.map((r, i) => i === 0 ? { ...r, path: p0 } : i === 1 ? { ...r, path: p1 } : r) });
    assert.equal(code(twoPaths('data/\u017f.bin', 'data/s.bin')), 'resource-duplicate'); // long s folds to s
    assert.equal(code(twoPaths('data', 'data/x.bin')), 'resource-duplicate');
    assert.equal(code(twoPaths('Data/x.bin', 'data/x/y.bin')), 'ok');
    const dupKind = text({ ...base, resources: [...base.resources, { path: 'data/second-map.bin', kind: 'map-archive', bytes: 0, sha256: H('9') }], fileCount: 7 });
    assert.equal(code(dupKind), 'resource-duplicate');
  });

  await check('pack: lone surrogates, odd timestamps, free-text control characters, non-https attribution URLs and partial signing fields are rejected', () => {
    assert.equal(code(text(sampleManifest()).replace('karachi-ijtema@1.2.0', 'a\\ud800')), 'manifest-malformed');
    assert.equal(code(text(sampleManifest({ createdAt: '2026-13-45T99:99:99Z' }))), 'field-invalid');
    assert.equal(code(text(sampleManifest({ attributions: [{ name: 'x\ny', license: 'ODbL' }] }))), 'field-invalid');
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://example.com', 'https://']) {
      assert.equal(code(text(sampleManifest({ attributions: [{ name: 'OSM', license: 'ODbL', url }] }))), 'field-invalid', url);
    }
    assert.equal(code(text(sampleManifest({ attributions: [{ name: 'OSM', license: 'ODbL', url: 'https://www.openstreetmap.org/copyright' }] }))), 'ok');
    assert.equal(code(text({ ...sampleManifest(), keyId: 'k1' })), 'field-invalid');
    assert.equal(code(text(sampleManifest({ keyId: 'k1', signatureAlgorithm: 'rsa' as 'ed25519' }))), 'field-invalid');
    assert.equal(code(text(sampleManifest({ keyId: 'k1', signatureAlgorithm: 'ed25519' }))), 'ok');
  });

  await check('pack: a newer schema is reported as unsupported even when it adds fields; nested unknown fields are rejected', () => {
    assert.equal(code(text({ ...sampleManifest(), schemaVersion: 2, newField: 1 })), 'schema-unsupported');
    const m = sampleManifest();
    assert.equal(code(text({ ...m, bounds: { ...m.bounds, extra: 1 } })), 'field-invalid');
    assert.equal(code(text({ ...m, provenance: { source: 's' } })), 'field-invalid');
    assert.equal(code(text({ ...m, resources: m.resources.map((r, i) => i === 0 ? { ...r, extra: 1 } : r) })), 'field-invalid');
    assert.equal(code(text({ ...m, resources: m.resources.map((r, i) => i === 0 ? { path: r.path, kind: r.kind, bytes: r.bytes } : r) })), 'field-invalid');
  });

  await check('pack: compatibility gates SDK version, platform capabilities, venue and schema', () => {
    const m = (() => { const r = parsePackManifest(text(sampleManifest())); assert.ok(r.ok); return r.manifest; })();
    const ok = { sdkVersion: '0.1.5', platformCapabilities: ['pmtiles-local-read', 'extra'] };
    assert.deepEqual(checkPackCompatibility(m, ok), { ok: true });
    const fail = (o: Parameters<typeof checkPackCompatibility>[1]) => { const r = checkPackCompatibility(m, o); return r.ok ? 'ok' : r.error.code; };
    assert.equal(fail({ ...ok, sdkVersion: '0.2.0' }), 'sdk-incompatible');
    assert.equal(fail({ ...ok, sdkVersion: '0.0.9' }), 'sdk-incompatible');
    assert.equal(fail({ ...ok, sdkVersion: 'banana' }), 'sdk-incompatible');
    assert.equal(fail({ ...ok, platformCapabilities: [] }), 'capability-missing');
    assert.equal(fail({ ...ok, expectedVenueId: 'other-venue' }), 'venue-mismatch');
    assert.equal(fail({ ...ok, expectedVenueId: 'karachi-ijtema' }), 'ok');
    assert.equal(fail({ ...ok, sdkVersion: '0.1.0' }), 'ok'); // lower bound is inclusive
    assert.equal(fail({ ...ok, sdkVersion: '0.1.999' }), 'ok');
    const ranged = (range: string, v: string) => {
      const r = parsePackManifest(text(sampleManifest({ sdkCompatibility: range })));
      assert.ok(r.ok, range);
      const c = checkPackCompatibility(r.manifest, { ...ok, sdkVersion: v });
      return c.ok;
    };
    assert.deepEqual([ranged('>0.1.0 <=0.3.0', '0.1.0'), ranged('>0.1.0 <=0.3.0', '0.3.0'), ranged('>0.1.0 <=0.3.0', '0.3.1'), ranged('=0.1.5', '0.1.5'), ranged('=0.1.5', '0.1.6')],
      [false, true, false, true, false]);
    // Unbounded, one-sided, malformed and caret ranges would let a pack claim every future SDK.
    for (const range of ['^1.0.0', '>=0.1.0', '<0.2.0', '>=0.1.0  <0.2.0', '>= 0.1.0', '*', '>=0.1.0 <9999999999.0.0']) {
      assert.equal(parsePackManifest(text(sampleManifest({ sdkCompatibility: range }))).ok, false, range);
    }
  });

  // ---- Verification: integrity (SHA-256 / length), optional pinned manifest digest, optional signature ----
  const goodFiles = (m: PackManifest) => new Map(m.resources.map((r) => [r.path, { bytes: r.bytes, sha256: r.sha256 }]));
  const ports = (files: Map<string, { bytes: number; sha256: string }>, extra: Partial<PackVerifyPorts> = {}): PackVerifyPorts => ({
    reader: { stat: async (p) => files.get(p) ?? null },
    ...extra,
  });
  const verify = async (m: PackManifest, p: PackVerifyPorts, opts: Parameters<typeof verifyPack>[2] = {}) => {
    const parsed = parsePackManifest(text(m));
    assert.ok(parsed.ok);
    const r = await verifyPack(parsed.manifestText, p, opts);
    return r.ok ? 'ok' : r.error.code;
  };
  const trustOf = async (m: PackManifest, p: PackVerifyPorts, opts: Parameters<typeof verifyPack>[2] = {}) => {
    const r = await verifyPack(text(m), p, opts);
    return r.ok ? r.trust : r.error.code;
  };

  await check('pack: verification accepts exact files and rejects missing, truncated, extended and mis-hashed resources', async () => {
    const m = sampleManifest();
    assert.equal(await verify(m, ports(goodFiles(m))), 'ok');
    const missing = goodFiles(m); missing.delete(m.resources[2].path);
    assert.equal(await verify(m, ports(missing)), 'resource-missing');
    const truncated = goodFiles(m); truncated.set(m.resources[0].path, { bytes: 40, sha256: m.resources[0].sha256 });
    assert.equal(await verify(m, ports(truncated)), 'resource-size-mismatch');
    const corrupt = goodFiles(m); corrupt.set(m.resources[1].path, { bytes: 100, sha256: H('f') });
    assert.equal(await verify(m, ports(corrupt)), 'resource-hash-mismatch');
  });

  await check('pack: the result says how the manifest was authenticated (signed / pinned / none) and can enforce compatibility', async () => {
    const m = sampleManifest({ keyId: 'k1', signatureAlgorithm: 'ed25519' });
    const files = goodFiles(m);
    const t = text(m);
    const yes = { verify: async () => true };
    assert.equal(await trustOf(m, ports(files)), 'none');
    assert.equal(await trustOf(m, ports(files, { manifestSha256: async () => H('A') }), { pinnedManifestSha256: H('a') }), 'pinned'); // digest compare is case-insensitive
    assert.equal(await trustOf(m, ports(files, { signatureVerifier: yes }), { requireSignature: true, trustedKeyIds: ['k1'], signature: 's' }), 'signed');
    assert.equal(await verify(m, ports(files, { manifestSha256: async () => { throw new Error('x'); } }), { pinnedManifestSha256: H('a') }), 'digest-unverifiable');
    const ctx = { sdkVersion: '0.2.0', platformCapabilities: ['pmtiles-local-read'] };
    const noReads: PackVerifyPorts = { reader: { stat: async () => { throw new Error('read before compatibility'); } } };
    assert.equal(await verify(m, noReads, { compatibility: ctx }), 'sdk-incompatible');
    assert.equal(await verify(m, ports(files), { compatibility: { ...ctx, sdkVersion: '0.1.0' } }), 'ok');
    assert.ok(t.length > 0);
  });

  await check('pack: files not named by the manifest are rejected when the reader can list them', async () => {
    const m = sampleManifest();
    const files = goodFiles(m);
    const withList = (names: string[]): PackVerifyPorts => ({ reader: { stat: async (p) => files.get(p) ?? null, list: async () => names } });
    assert.equal(await verify(m, withList(m.resources.map((r) => r.path))), 'ok');
    assert.equal(await verify(m, withList([...m.resources.map((r) => r.path), 'data/extra.bin'])), 'resource-unexpected');
  });

  await check('pack: an unreadable file fails closed instead of passing', async () => {
    const m = sampleManifest();
    const p: PackVerifyPorts = { reader: { stat: async () => { throw new Error('io'); } } };
    assert.equal(await verify(m, p), 'resource-unreadable');
  });

  await check('pack: a pinned manifest digest (trusted out of band) must match the exact manifest text', async () => {
    const m = sampleManifest();
    const t = text(m);
    const p = ports(goodFiles(m), { manifestSha256: async (s) => s === t ? H('a') : H('0') });
    assert.equal(await verify(m, p, { pinnedManifestSha256: H('a') }), 'ok');
    assert.equal(await verify(m, p, { pinnedManifestSha256: H('b') }), 'manifest-digest-mismatch');
    assert.equal(await verify(m, ports(goodFiles(m)), { pinnedManifestSha256: H('a') }), 'digest-unverifiable');
  });

  await check('pack: signature policy fails closed - required but no verifier, unknown key, bad signature; never fabricated', async () => {
    const m = sampleManifest({ keyId: 'k1', signatureAlgorithm: 'ed25519' });
    const files = goodFiles(m);
    const sigOpts = { requireSignature: true, trustedKeyIds: ['k1'], signature: 'c2ln' };
    assert.equal(await verify(m, ports(files), sigOpts), 'signature-required');
    const verifier = { verify: async (a: { message: string; signature: string; keyId: string; algorithm: string }) => a.signature === 'c2ln' && a.keyId === 'k1' && a.algorithm === 'ed25519' && a.message === text(m) };
    assert.equal(await verify(m, ports(files, { signatureVerifier: verifier }), sigOpts), 'ok');
    assert.equal(await verify(m, ports(files, { signatureVerifier: verifier }), { ...sigOpts, signature: 'bad' }), 'signature-invalid');
    assert.equal(await verify(m, ports(files, { signatureVerifier: verifier }), { ...sigOpts, trustedKeyIds: ['other'] }), 'signature-untrusted-key');
    assert.equal(await verify(m, ports(files, { signatureVerifier: verifier }), { requireSignature: true, trustedKeyIds: ['k1'] }), 'signature-required');
    const thrower = { verify: async () => { throw new Error('boom'); } };
    assert.equal(await verify(m, ports(files, { signatureVerifier: thrower }), sigOpts), 'signature-invalid');
    const truthy = { verify: async () => 'false' as unknown as boolean };
    assert.equal(await verify(m, ports(files, { signatureVerifier: truthy }), sigOpts), 'signature-invalid');
    // Authentication happens before any file is read: a bad signature never lets a file read run.
    const noReads: PackVerifyPorts = { reader: { stat: async () => { throw new Error('file read before authentication'); } }, signatureVerifier: verifier };
    assert.equal(await verify(m, noReads, { ...sigOpts, signature: 'bad' }), 'signature-invalid');
    assert.equal(await verify(sampleManifest(), ports(goodFiles(sampleManifest())), { requireSignature: true, trustedKeyIds: ['k1'] }), 'signature-required');
    assert.equal(await verify(sampleManifest(), { ...ports(goodFiles(sampleManifest())), signatureVerifier: verifier }, { ...sigOpts }), 'signature-untrusted-key'); // unsigned manifest has no key
    // Without the requirement, an unsigned bundled pack still verifies on integrity alone.
    assert.equal(await verify(sampleManifest(), ports(goodFiles(sampleManifest()))), 'ok');
  });

  await check('pack: a venue is rebuilt from the graph and place files with validated, read-only data; bad references and prototype ids are refused', () => {
    const graph = JSON.stringify({ schemaVersion: 1, venueId: 'v', dataVersion: 'd', nodes: [{ id: 'a', lat: 1, lng: 1 }, { id: 'b', lat: 1.001, lng: 1 }], edges: [{ from: 'a', to: 'b', distanceM: 111 }] });
    const places = (nodeIds: string[]) => JSON.stringify({ schemaVersion: 1, venueId: 'v', places: [{ id: 'p', kind: 'room', nodeIds }] });
    const ok = parsePackVenueData(graph, places(['a']), 'v');
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.source.graph.edgesFrom('a'), [{ to: 'b', distanceM: 111 }]);
      assert.equal(ok.source.graph.getNode('constructor'), undefined);
    }
    assert.equal(parsePackVenueData(graph, places(['ghost'])).ok, false);
    assert.equal(parsePackVenueData(graph, places(['a']), 'other').ok, false);
  });
})();
