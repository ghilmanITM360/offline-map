/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.2: compiles a directory of venue resources plus a build spec into a deterministic `pack.manifest.json`.
// The output is a pure function of the file contents and the spec: no clock, no host paths, no directory-walk order. The result is
// run back through the SDK's own parser and verifier, so a manifest this tool writes is one the PackManager will accept.
// It never signs: a compiled pack is `trust: none` until a digest is pinned (bundled) or a publisher signs it (not built yet).
import { lstatSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkPackCompatibility, createSha256, PACK_MANIFEST_FILE, PACK_RESOURCE_KINDS, PACK_SCHEMA_VERSION, parsePackManifest,
  REQUIRED_PACK_RESOURCE_KINDS, unsafePackPathReason, verifyPack, type PackErrorCode, type PackFileSystem, type PackManifest, type PackResourceKind,
} from '../../packages/offline-navigation/src/domain/pack';
import { createNodePackFileSystem } from './nodePackFileSystem';

export type PackCompileErrorCode =
  | PackErrorCode
  | 'resource-undeclared' | 'kind-unsupported' | 'symlink-refused' | 'directory-invalid'
  | 'venue-conflict' | 'resource-invalid' | 'pack-id-mismatch' | 'resource-changed';

export class PackCompileError extends Error {
  constructor(readonly code: PackCompileErrorCode, message: string, readonly path?: string) {
    super(path ? `${message}: ${path}` : message);
    this.name = 'PackCompileError';
  }
}

export interface PackBuildSpec {
  packId: string;
  venueId: string;
  packVersion: string;
  sdkCompatibility: string;
  routingPolicyVersion: string;
  /** Supplied by the caller (e.g. the data's own build time): the compiler never reads the clock. */
  createdAt: string;
  minimumPlatformCapabilities: string[];
  bounds: PackManifest['bounds'];
  languages: string[];
  /** Every file that ships, with its kind. A file in the directory that is not listed here is an error. */
  resources: Array<{ path: string; kind: PackResourceKind }>;
  attributions: PackManifest['attributions'];
  provenance: PackManifest['provenance'];
}

export interface CompileOptions {
  /** Write `pack.manifest.json` into the directory (atomic). Default: only return it. */
  write?: boolean;
  /** SDK version the pack must load in; defaults to this repository's SDK package version. */
  sdkVersion?: string;
  /** Filesystem port rooted at the pack directory; defaults to Node's. Lets tests inject a racing filesystem. */
  fs?: PackFileSystem;
}

export interface CompiledPack {
  manifest: PackManifest;
  /** Exact bytes written/to be written; this is what a pinned digest or signature covers. */
  manifestText: string;
  manifestSha256: string;
}

/** Data resources must say which venue they belong to, so a graph can never be filed under another venue's pack. */
const VENUE_SCOPED_JSON: readonly PackResourceKind[] = ['routing-graph', 'place-directory', 'gate-metadata', 'localization', 'venue-geometry', 'place-catalog'];
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

const defaultSdkVersion = (): string => JSON.parse(readFileSync(join(__dirname, '../../packages/offline-navigation/package.json'), 'utf8')).version;
const fold = (p: string): string => p.toUpperCase().toLowerCase();

const walk = async (root: string, rel: string): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await readdir(rel ? join(root, rel) : root, { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new PackCompileError('symlink-refused', 'symbolic links are never packed', path);
    if (entry.isDirectory()) out.push(...await walk(root, path));
    else if (entry.isFile()) out.push(path);
    else throw new PackCompileError('directory-invalid', 'only regular files and directories can be packed', path);
  }
  return out;
};

export const compilePack = async (dir: string, spec: PackBuildSpec, options: CompileOptions = {}): Promise<CompiledPack> => {
  // 1. The spec alone: kinds, paths, duplicates and required kinds are decided before the disk is touched.
  const seen = new Set<string>();
  const kinds = new Set<string>();
  for (const r of spec.resources) {
    if (!(PACK_RESOURCE_KINDS as readonly string[]).includes(r.kind)) throw new PackCompileError('kind-unsupported', `unsupported resource kind '${r.kind}'`, r.path);
    const reason = unsafePackPathReason(r.path);
    if (reason) throw new PackCompileError('resource-path-unsafe', `unsafe path (${reason})`, r.path);
    if (seen.has(fold(r.path))) throw new PackCompileError('resource-duplicate', 'duplicate or case-colliding path', r.path);
    seen.add(fold(r.path));
    if (kinds.has(r.kind)) throw new PackCompileError('resource-duplicate', `more than one '${r.kind}' resource`, r.path);
    kinds.add(r.kind);
  }
  const lacking = REQUIRED_PACK_RESOURCE_KINDS.find((k) => !kinds.has(k));
  if (lacking) throw new PackCompileError('required-resource-missing', `no '${lacking}' resource`);

  // 2. The directory: a real directory, no symlinks anywhere, and exactly the declared files.
  let root: ReturnType<typeof lstatSync> | undefined;
  try { root = lstatSync(dir); } catch { /* reported below */ }
  if (!root || root.isSymbolicLink() || !root.isDirectory()) throw new PackCompileError('directory-invalid', 'the pack directory must be an existing real directory', dir);
  const onDisk = new Set((await walk(dir, '')).filter((p) => p !== PACK_MANIFEST_FILE));
  for (const p of onDisk) if (!spec.resources.some((r) => r.path === p)) throw new PackCompileError('resource-undeclared', 'file is not declared in the build spec', p);
  for (const r of spec.resources) if (!onDisk.has(r.path)) throw new PackCompileError('resource-missing', 'declared file is missing', r.path);

  // 3. Size and bounded-memory SHA-256, in path order. A file that changes while it is read is an error, not a guess.
  const fs = options.fs ?? createNodePackFileSystem(dir);
  const resources: PackManifest['resources'] = [];
  for (const r of [...spec.resources].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const before = await fs.size(r.path);
    const hasher = createSha256();
    let bytes = 0;
    for await (const chunk of fs.readChunks(r.path, CHUNK_BYTES)) { hasher.update(chunk); bytes += chunk.length; }
    const after = await fs.size(r.path);
    if (before === null || after === null || before !== bytes || after !== bytes) throw new PackCompileError('resource-changed', 'file changed while it was being hashed', r.path);
    resources.push({ path: r.path, kind: r.kind, bytes, sha256: hasher.digestHex() });
  }

  // 4. The manifest, in a fixed key order, validated by the SDK's own parser and compatibility check.
  const manifest: PackManifest = {
    schemaVersion: PACK_SCHEMA_VERSION,
    packId: spec.packId,
    venueId: spec.venueId,
    packVersion: spec.packVersion,
    sdkCompatibility: spec.sdkCompatibility,
    routingPolicyVersion: spec.routingPolicyVersion,
    createdAt: spec.createdAt,
    minimumPlatformCapabilities: spec.minimumPlatformCapabilities,
    bounds: { west: spec.bounds.west, south: spec.bounds.south, east: spec.bounds.east, north: spec.bounds.north },
    languages: spec.languages,
    totalBytes: resources.reduce((n, r) => n + r.bytes, 0),
    fileCount: resources.length,
    resources,
    attributions: spec.attributions.map((a) => ({ name: a.name, license: a.license, ...(a.url === undefined ? {} : { url: a.url }) })),
    provenance: {
      source: spec.provenance.source, licence: spec.provenance.licence,
      ...(spec.provenance.sourceRevision === undefined ? {} : { sourceRevision: spec.provenance.sourceRevision }),
      ...(spec.provenance.generatedBy === undefined ? {} : { generatedBy: spec.provenance.generatedBy }),
    },
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const parsed = parsePackManifest(manifestText);
  if (!parsed.ok) throw new PackCompileError(parsed.error.code, parsed.error.message, parsed.error.path);
  const compat = checkPackCompatibility(parsed.manifest, { sdkVersion: options.sdkVersion ?? defaultSdkVersion(), platformCapabilities: manifest.minimumPlatformCapabilities });
  if (!compat.ok) throw new PackCompileError(compat.error.code, compat.error.message);
  if (spec.packId !== `${spec.venueId}@${spec.packVersion}`) throw new PackCompileError('pack-id-mismatch', `packId must be '${spec.venueId}@${spec.packVersion}'`, spec.packId);

  // 5. Venue-scoped data must name this venue.
  for (const r of resources.filter((x) => VENUE_SCOPED_JSON.includes(x.kind))) {
    if (r.bytes > MAX_JSON_BYTES) throw new PackCompileError('resource-invalid', 'data resource is too large to inspect', r.path);
    let doc: unknown;
    try { doc = JSON.parse(await fs.readText(r.path) ?? ''); } catch { throw new PackCompileError('resource-invalid', 'data resource is not valid UTF-8 JSON', r.path); }
    const venueId = typeof doc === 'object' && doc !== null && !Array.isArray(doc) ? (doc as { venueId?: unknown }).venueId : undefined;
    if (venueId !== spec.venueId) throw new PackCompileError('venue-conflict', `resource names venue ${JSON.stringify(venueId)}, the pack is for '${spec.venueId}'`, r.path);
  }

  // 6. Prove it: the verifier must accept the directory against the manifest we are about to publish.
  const verified = await verifyPack(manifestText, {
    reader: {
      stat: async (path) => {
        const hasher = createSha256();
        let bytes = 0;
        for await (const chunk of fs.readChunks(path, CHUNK_BYTES)) { hasher.update(chunk); bytes += chunk.length; }
        return { bytes, sha256: hasher.digestHex() };
      },
      list: async () => (await fs.listFilesRecursive('.')).filter((p) => p !== PACK_MANIFEST_FILE),
    },
  });
  if (!verified.ok) throw new PackCompileError(verified.error.code, verified.error.message, verified.error.path);

  if (options.write) await fs.writeTextAtomic(PACK_MANIFEST_FILE, manifestText);
  const hasher = createSha256();
  hasher.update(new TextEncoder().encode(manifestText));
  return { manifest: parsed.manifest, manifestText, manifestSha256: hasher.digestHex() };
};

/** What an app ships to authenticate a bundled pack without a signature: the manifest digest, plus the per-file facts for review. */
export const pinFor = (pack: CompiledPack) => ({
  packId: pack.manifest.packId,
  manifestSha256: pack.manifestSha256,
  manifestBytes: new TextEncoder().encode(pack.manifestText).length,
  resources: pack.manifest.resources.map((r) => ({ path: r.path, kind: r.kind, bytes: r.bytes, sha256: r.sha256 })),
});
