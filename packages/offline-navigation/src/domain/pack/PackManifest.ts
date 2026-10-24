/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidSdkRange, parseSemver } from './PackCompatibility';
import type { PackError } from './PackError';
import { parseStrictJson, StrictJsonError } from './StrictJson';

export const PACK_SCHEMA_VERSION = 1;

export const PACK_RESOURCE_KINDS = [
  'map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance', 'map-style',
] as const;
export type PackResourceKind = typeof PACK_RESOURCE_KINDS[number];
/** A pack without all of these cannot be navigated; `map-style` is optional. */
export const REQUIRED_PACK_RESOURCE_KINDS: readonly PackResourceKind[] = PACK_RESOURCE_KINDS.filter((k) => k !== 'map-style');

export interface PackResource {
  /** Relative, `/`-separated path inside the pack. */
  path: string;
  kind: PackResourceKind;
  bytes: number;
  /** Lowercase hex SHA-256 of the file content. */
  sha256: string;
}

export interface PackManifest {
  schemaVersion: 1;
  packId: string;
  /** Namespace for every route/graph/place id in this pack; ids from different venues never mix. */
  venueId: string;
  packVersion: string;
  sdkCompatibility: string;
  routingPolicyVersion: string;
  createdAt: string;
  minimumPlatformCapabilities: string[];
  bounds: { west: number; south: number; east: number; north: number };
  languages: string[];
  totalBytes: number;
  fileCount: number;
  resources: PackResource[];
  attributions: Array<{ name: string; license: string; url?: string }>;
  provenance: { source: string; licence: string; sourceRevision?: string; generatedBy?: string };
  /** Present only for signed packs; the detached signature covers the exact manifest text. */
  keyId?: string;
  signatureAlgorithm?: 'ed25519';
}

export type ParsePackManifestResult =
  | { ok: true; manifest: PackManifest; /** The exact text that was parsed; this is what a signature covers. */ manifestText: string }
  | { ok: false; error: PackError };

type Obj = Record<string, unknown>;
class Invalid extends Error {
  constructor(readonly error: PackError) { super(error.message); }
}
const bad = (message: string, path?: string, code: PackError['code'] = 'field-invalid'): never => { throw new Invalid({ code, message, path }); };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string, required: string[], optional: string[] = []): Obj => {
  if (!isObj(v)) return bad(`${path} must be an object`, path);
  for (const k of Object.keys(v)) if (!required.includes(k) && !optional.includes(k)) bad(`unknown field '${k}'`, `${path}.${k}`);
  for (const k of required) if (!(k in v)) bad(`missing field '${k}'`, `${path}.${k}`);
  return v;
};
const pattern = (v: unknown, re: RegExp, path: string): string => (typeof v === 'string' && re.test(v) ? v : bad(`${path} is invalid`, path));
const nonEmpty = (v: unknown, path: string, max = 256): string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim() && !INVISIBLE.test(v)
    ? v : bad(`${path} must be a non-empty trimmed string without control characters`, path);
const uint = (v: unknown, path: string): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : bad(`${path} must be a non-negative integer`, path);
const httpsUrl = (v: unknown, path: string): string => {
  const u = nonEmpty(v, path, 2048);
  return /^https:\/\/[^\s/?#]+/.test(u) ? u : bad(`${path} must be an https URL`, path);
};
const list = (v: unknown, path: string, min: number, max: number): unknown[] =>
  Array.isArray(v) && v.length >= min && v.length <= max ? v : bad(`${path} must be a list of ${min}..${max} items`, path);

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PACK_ID = /^[a-z0-9][a-z0-9._@-]{0,127}$/;
const TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_RESOURCES = 10_000;
/** Bound the unauthenticated parse; 10,000 resources fit comfortably below this. */
const MAX_MANIFEST_CHARS = 4 * 1024 * 1024;

const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;
const FORBIDDEN_NAME_CHARS = /[<>:"|?*]/;
/** C0/C1 controls, bidi overrides/isolates, zero-width and invisible format characters, BOM. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
/** Scripts and native code never belong in a data pack, whatever `kind` claims. */
const EXECUTABLE_EXTENSION = /\.(?:js|mjs|cjs|jsx|ts|tsx|wasm|exe|dll|so|dylib|bat|cmd|ps1|sh|app|apk|ipa|jar|html?)$/i;
const utf8Length = (s: string): number => {
  let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0) as number; n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
};
/** Case folding that also unifies `ſ`/`s` and `ς`/`σ`, which APFS and NTFS treat as the same name. */
const fold = (p: string): string => p.toUpperCase().toLowerCase();

/** Why a pack-relative path is not safe to join onto a directory, or null when it is. */
export const unsafePackPathReason = (p: string): string | null => {
  if (p.length === 0 || utf8Length(p) > 1024) return 'empty or too long';
  if (p !== p.normalize('NFC')) return 'not NFC-normalized';
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return 'absolute or drive path';
  if (p.includes('\\')) return 'backslash separator';
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') return 'empty, dot or parent segment';
    if (utf8Length(seg) > 255 || INVISIBLE.test(seg)) return 'control, invisible or oversized segment';
    if (FORBIDDEN_NAME_CHARS.test(seg)) return 'character forbidden on some filesystems';
    if (/[. ]$/.test(seg)) return 'trailing dot or space';
    if (WINDOWS_DEVICE.test(seg)) return 'reserved device name';
  }
  if (EXECUTABLE_EXTENSION.test(p)) return 'executable or script extension';
  return null;
};

const parseResources = (raw: unknown): PackResource[] => {
  const seen = new Set<string>();
  const resources = list(raw, 'resources', 1, MAX_RESOURCES).map((r, i) => {
    const path = `resources[${i}]`;
    const o = obj(r, path, ['path', 'kind', 'bytes', 'sha256']);
    const p = typeof o.path === 'string' ? o.path : bad(`${path}.path must be a string`, `${path}.path`);
    const reason = unsafePackPathReason(p);
    if (reason) bad(`unsafe path (${reason})`, p, 'resource-path-unsafe');
    const folded = fold(p);
    if (seen.has(folded)) bad('duplicate or case-colliding path', p, 'resource-duplicate');
    seen.add(folded);
    const kind = (PACK_RESOURCE_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as PackResourceKind) : bad(`${path}.kind is not a known resource kind`, `${path}.kind`);
    return { path: p, kind, bytes: uint(o.bytes, `${path}.bytes`), sha256: pattern(o.sha256, SHA256, `${path}.sha256`) };
  });
  // A path that is also another path's directory (`data` and `data/x.bin`) cannot be extracted.
  for (const p of seen) {
    for (let at = p.indexOf('/'); at !== -1; at = p.indexOf('/', at + 1)) {
      if (seen.has(p.slice(0, at))) bad('path is both a file and a directory', p, 'resource-duplicate');
    }
  }
  // Exactly one authoritative resource per required kind; `map-style` is optional but also single.
  const kindCount = new Map<string, number>();
  for (const r of resources) {
    if ((kindCount.get(r.kind) ?? 0) >= 1) bad(`more than one '${r.kind}' resource`, r.path, 'resource-duplicate');
    kindCount.set(r.kind, 1);
  }
  return resources;
};

const build = (raw: unknown): PackManifest => {
  // Check the version first: a newer schema legitimately has fields this one does not know.
  if (isObj(raw) && 'schemaVersion' in raw && raw.schemaVersion !== PACK_SCHEMA_VERSION) bad(`unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)}`, 'schemaVersion', 'schema-unsupported');
  const top = obj(raw, 'manifest',
    ['schemaVersion', 'packId', 'venueId', 'packVersion', 'sdkCompatibility', 'routingPolicyVersion', 'createdAt',
      'minimumPlatformCapabilities', 'bounds', 'languages', 'totalBytes', 'fileCount', 'resources', 'attributions', 'provenance'],
    ['keyId', 'signatureAlgorithm']);

  const packVersion = nonEmpty(top.packVersion, 'packVersion');
  if (!parseSemver(packVersion)) bad('packVersion must be x.y.z', 'packVersion');
  const sdkCompatibility = nonEmpty(top.sdkCompatibility, 'sdkCompatibility');
  if (!isValidSdkRange(sdkCompatibility)) bad("sdkCompatibility must be space-separated comparators such as '>=0.1.0 <0.2.0'", 'sdkCompatibility');

  const b = obj(top.bounds, 'bounds', ['west', 'south', 'east', 'north']);
  const num = (v: unknown, lo: number, hi: number, p: string): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : bad(`${p} out of range`, p);
  const bounds = { west: num(b.west, -180, 180, 'bounds.west'), south: num(b.south, -90, 90, 'bounds.south'), east: num(b.east, -180, 180, 'bounds.east'), north: num(b.north, -90, 90, 'bounds.north') };
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) bad('bounds must have west<east and south<north', 'bounds');

  const unique = (values: string[], p: string): string[] => new Set(values).size === values.length ? values : bad(`${p} has duplicates`, p);
  const minimumPlatformCapabilities = unique(list(top.minimumPlatformCapabilities, 'minimumPlatformCapabilities', 0, 32).map((c, i) => pattern(c, ID, `minimumPlatformCapabilities[${i}]`)), 'minimumPlatformCapabilities');
  const languages = unique(list(top.languages, 'languages', 1, 32).map((l, i) => pattern(l, LANGUAGE, `languages[${i}]`)), 'languages');

  const resources = parseResources(top.resources);
  const kinds = new Set(resources.map((r) => r.kind));
  const lacking = REQUIRED_PACK_RESOURCE_KINDS.find((k) => !kinds.has(k));
  if (lacking) bad(`no '${lacking}' resource`, 'resources', 'required-resource-missing');
  const totalBytes = uint(top.totalBytes, 'totalBytes');
  const fileCount = uint(top.fileCount, 'fileCount');
  if (fileCount !== resources.length) bad(`fileCount ${fileCount} != ${resources.length} resources`, 'fileCount', 'totals-mismatch');
  if (totalBytes !== resources.reduce((n, r) => n + r.bytes, 0)) bad('totalBytes does not equal the sum of resource bytes', 'totalBytes', 'totals-mismatch');

  const attributions = list(top.attributions, 'attributions', 1, 64).map((a, i) => {
    const o = obj(a, `attributions[${i}]`, ['name', 'license'], ['url']);
    return { name: nonEmpty(o.name, `attributions[${i}].name`), license: nonEmpty(o.license, `attributions[${i}].license`), ...('url' in o ? { url: httpsUrl(o.url, `attributions[${i}].url`) } : {}) };
  });
  const pv = obj(top.provenance, 'provenance', ['source', 'licence'], ['sourceRevision', 'generatedBy']);
  const provenance: PackManifest['provenance'] = { source: nonEmpty(pv.source, 'provenance.source'), licence: nonEmpty(pv.licence, 'provenance.licence') };
  if ('sourceRevision' in pv) provenance.sourceRevision = nonEmpty(pv.sourceRevision, 'provenance.sourceRevision');
  if ('generatedBy' in pv) provenance.generatedBy = nonEmpty(pv.generatedBy, 'provenance.generatedBy');

  if (('keyId' in top) !== ('signatureAlgorithm' in top)) bad('keyId and signatureAlgorithm must be given together', 'keyId');
  const manifest: PackManifest = {
    schemaVersion: 1,
    packId: pattern(top.packId, PACK_ID, 'packId'),
    venueId: pattern(top.venueId, ID, 'venueId'),
    packVersion,
    sdkCompatibility,
    routingPolicyVersion: nonEmpty(top.routingPolicyVersion, 'routingPolicyVersion', 32),
    createdAt: pattern(top.createdAt, TIMESTAMP, 'createdAt'),
    minimumPlatformCapabilities, bounds, languages, totalBytes, fileCount, resources, attributions, provenance,
  };
  if ('keyId' in top) {
    manifest.keyId = pattern(top.keyId, ID, 'keyId');
    if (top.signatureAlgorithm !== 'ed25519') bad("signatureAlgorithm must be 'ed25519'", 'signatureAlgorithm');
    manifest.signatureAlgorithm = 'ed25519';
  }
  return manifest;
};

/** Parses and fully validates a manifest. Never throws; the returned text is what a detached signature must cover. */
export const parsePackManifest = (manifestText: string): ParsePackManifestResult => {
  if (manifestText.length > MAX_MANIFEST_CHARS) return { ok: false, error: { code: 'manifest-malformed', message: 'manifest is too large' } };
  try {
    return { ok: true, manifest: build(parseStrictJson(manifestText)), manifestText };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.error };
    if (e instanceof StrictJsonError) return { ok: false, error: { code: 'manifest-malformed', message: e.message } };
    throw e;
  }
};
