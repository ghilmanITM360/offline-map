// SHA-256 of a whole file by the platform (expo-crypto), as the SDK store's optional `digestFile` port. Hashing a 0.4 MB archive in JS
// costs about a second on a phone because Hermes runs it in an interpreter; the platform does it in milliseconds. Integrity only, exactly like
// the JS hasher: it proves the bytes match the manifest, not who published them.

/** Whole files up to this size are read into memory and hashed natively; anything larger goes back to the SDK's bounded-memory streaming hash. */
export const NATIVE_DIGEST_MAX_BYTES = 8 * 1024 * 1024;

export interface NativeDigestDeps {
  /** The file's size in bytes, or null when it does not exist. */
  size(path: string): Promise<number | null>;
  readBytes(path: string): Promise<Uint8Array>;
  /** SHA-256 of the bytes, as the platform returns it. */
  digest(bytes: Uint8Array): Promise<ArrayBuffer>;
}

const toHex = (digest: ArrayBuffer): string => Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');

export const createNativeDigest = (deps: NativeDigestDeps, maxBytes = NATIVE_DIGEST_MAX_BYTES) => async (path: string): Promise<{ bytes: number; sha256: string } | null> => {
  const size = await deps.size(path);
  if (size === null || size > maxBytes) return null; // missing: the store reports it; too big: the SDK streams it
  const bytes = await deps.readBytes(path);
  if (bytes.length > maxBytes) return null; // grew since it was measured
  return { bytes: bytes.length, sha256: toHex(await deps.digest(bytes)) };
};
