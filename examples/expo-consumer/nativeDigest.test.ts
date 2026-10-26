import { createHash, randomBytes } from 'node:crypto';
import { createNativeDigest, NATIVE_DIGEST_MAX_BYTES, type NativeDigestDeps } from './nativeDigest';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const nodeDigest = async (bytes: Uint8Array): Promise<ArrayBuffer> => {
  const d = createHash('sha256').update(bytes).digest();
  return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
};
const deps = (files: Record<string, Uint8Array>, over: Partial<NativeDigestDeps> = {}): NativeDigestDeps => ({
  size: async (p) => files[p]?.length ?? null,
  readBytes: async (p) => files[p],
  digest: nodeDigest,
  ...over,
});

describe('platform file digest', () => {
  it('returns the length and lowercase hex SHA-256 of exactly the bytes it read', async () => {
    const data = new Uint8Array(randomBytes(434_589));
    const digest = createNativeDigest(deps({ 'a.bin': data }));
    expect(await digest('a.bin')).toEqual({ bytes: 434_589, sha256: sha(data) });
  });

  it('is exact for an empty file', async () => {
    expect(await createNativeDigest(deps({ 'e': new Uint8Array(0) }))('e')).toEqual({ bytes: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
  });

  it('leaves a missing file to the store, which reports it', async () => {
    expect(await createNativeDigest(deps({}))('nope')).toBeNull();
  });

  it('declines a file too large to hold in memory, so the SDK streams it instead', async () => {
    let read = false;
    const digest = createNativeDigest(deps({ 'big': new Uint8Array(0) }, { size: async () => NATIVE_DIGEST_MAX_BYTES + 1, readBytes: async () => { read = true; return new Uint8Array(0); } }));
    expect(await digest('big')).toBeNull();
    expect(read).toBe(false); // it never even loaded it
  });

  it('declines a file that grew past the limit between measuring and reading', async () => {
    const digest = createNativeDigest(deps({}, { size: async () => 10, readBytes: async () => new Uint8Array(NATIVE_DIGEST_MAX_BYTES + 1) }), NATIVE_DIGEST_MAX_BYTES);
    expect(await digest('x')).toBeNull();
  });

  it('reports the bytes it actually hashed, not the size it measured before reading', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const digest = createNativeDigest(deps({}, { size: async () => 99, readBytes: async () => data }));
    expect(await digest('x')).toEqual({ bytes: 4, sha256: sha(data) });
  });

  it('lets a platform failure surface, because the store then falls back to hashing in JS', async () => {
    const digest = createNativeDigest(deps({ f: new Uint8Array(3) }, { digest: async () => { throw new Error('module missing'); } }));
    await expect(digest('f')).rejects.toThrow('module missing');
  });
});
