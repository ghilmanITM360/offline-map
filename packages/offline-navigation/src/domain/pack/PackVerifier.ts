/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackError } from './PackError';
import { checkPackCompatibility, type PackCompatibilityContext } from './PackCompatibility';
import { parsePackManifest, type PackManifest } from './PackManifest';

export interface PackFileReader {
  /** Size and lowercase hex SHA-256 of a pack-relative file, or null when it does not exist. May throw if unreadable. */
  stat(path: string): Promise<{ bytes: number; sha256: string } | null>;
  /** Optional: every pack-relative file present (excluding the manifest and its signature) so extras can be rejected. */
  list?(): Promise<string[]>;
}

export interface PackSignatureVerifier {
  /** True only when `signature` is a valid Ed25519 signature by the trusted key `keyId` over the exact UTF-8 `message`. */
  verify(args: { keyId: string; algorithm: 'ed25519'; message: string; signature: string }): Promise<boolean>;
}

export interface PackVerifyPorts {
  reader: PackFileReader;
  /** Lowercase hex SHA-256 of the exact UTF-8 manifest text; needed only for `pinnedManifestSha256`. */
  manifestSha256?(text: string): Promise<string>;
  signatureVerifier?: PackSignatureVerifier;
}

export interface PackVerifyOptions {
  /** A digest obtained out of band (e.g. shipped with the app for a bundled pack): content integrity only, not publisher identity. */
  pinnedManifestSha256?: string;
  /** Remote or imported packs must set this; it fails closed when no verifier/trusted key exists. */
  requireSignature?: boolean;
  trustedKeyIds?: readonly string[];
  /** Detached signature (opaque encoding agreed with the verifier) over the exact manifest text. */
  signature?: string;
  /** When given, SDK/capability/venue compatibility is checked after authentication and before any file is read. */
  compatibility?: PackCompatibilityContext;
}

/**
 * How the manifest was authenticated: `signed` (trusted key verified it), `pinned` (matches an out-of-band digest), or
 * `none` (files merely match the manifest). Callers must refuse `none` for any pack that did not ship inside the app.
 */
export type PackTrust = 'signed' | 'pinned' | 'none';

export type PackVerification = { ok: true; manifest: PackManifest; trust: PackTrust } | { ok: false; error: PackError };

/**
 * SHA-256 against a digest inside the manifest proves only that files match that manifest; the manifest itself is
 * authenticated either by a pinned digest (bundled) or a signature (remote/imported). Without one of those this
 * proves consistency, not provenance: the result's `trust` says which it was, and `requireSignature` lets callers refuse it.
 * Manifest text must be exact UTF-8 decoded with `fatal: true` and no BOM stripping by the host, so signed bytes == parsed text.
 */
export const verifyPack = async (manifestText: string, ports: PackVerifyPorts, options: PackVerifyOptions = {}): Promise<PackVerification> => {
  const fail = (code: PackError['code'], message: string, path?: string): PackVerification => ({ ok: false, error: { code, message, path } });
  const parsed = parsePackManifest(manifestText);
  if (!parsed.ok) return parsed;
  const { manifest } = parsed;

  let trust: PackTrust = 'none';
  if (options.pinnedManifestSha256 !== undefined) {
    if (!ports.manifestSha256) return fail('digest-unverifiable', 'a pinned digest was given but no hasher is available');
    let digest: unknown;
    try {
      digest = await ports.manifestSha256(manifestText);
    } catch {
      return fail('digest-unverifiable', 'the manifest could not be hashed');
    }
    if (typeof digest !== 'string' || digest.toLowerCase() !== options.pinnedManifestSha256.toLowerCase()) return fail('manifest-digest-mismatch', 'manifest does not match the pinned digest');
    trust = 'pinned';
  }

  if (options.requireSignature || options.signature !== undefined) {
    if (!ports.signatureVerifier || options.signature === undefined) return fail('signature-required', 'a signature and a verifier are required');
    if (!manifest.keyId || !manifest.signatureAlgorithm || !options.trustedKeyIds?.includes(manifest.keyId)) return fail('signature-untrusted-key', 'manifest key is not trusted');
    let valid = false;
    try {
      // Strictly `true`: a bridge returning "false", 1 or an object must not pass.
      valid = (await ports.signatureVerifier.verify({ keyId: manifest.keyId, algorithm: manifest.signatureAlgorithm, message: manifestText, signature: options.signature })) === true;
    } catch {
      valid = false;
    }
    if (!valid) return fail('signature-invalid', 'signature does not verify');
    trust = 'signed';
  }

  if (options.compatibility) {
    const compat = checkPackCompatibility(manifest, options.compatibility);
    if (!compat.ok) return compat;
  }

  if (ports.reader.list) {
    const known = new Set(manifest.resources.map((r) => r.path));
    let present: string[];
    try {
      present = await ports.reader.list();
    } catch {
      return fail('resource-unreadable', 'the pack directory could not be listed');
    }
    const extra = present.find((p) => !known.has(p));
    if (extra !== undefined) return fail('resource-unexpected', 'file is not in the manifest', extra);
  }
  for (const r of manifest.resources) {
    let stat: { bytes: number; sha256: string } | null;
    try {
      stat = await ports.reader.stat(r.path);
    } catch {
      return fail('resource-unreadable', 'file could not be read', r.path);
    }
    if (!stat) return fail('resource-missing', 'file is missing', r.path);
    if (stat.bytes !== r.bytes) return fail('resource-size-mismatch', `expected ${r.bytes} bytes, found ${stat.bytes}`, r.path);
    if (typeof stat.sha256 !== 'string' || stat.sha256.toLowerCase() !== r.sha256) return fail('resource-hash-mismatch', 'SHA-256 mismatch', r.path);
  }
  return { ok: true, manifest, trust };
};
