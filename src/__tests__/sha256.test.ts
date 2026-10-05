import { createHash, randomBytes } from 'crypto';
import { sha256Hex } from '../utils/sha256';

const reference = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('sha256Hex (#306: content identity for the bundled basemap, no native dependency)', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it.each([1, 55, 56, 63, 64, 65, 119, 120, 1000, 65537])('matches node crypto for %i random bytes (padding boundaries)', (n) => {
    const bytes = new Uint8Array(randomBytes(n));
    expect(sha256Hex(bytes)).toBe(reference(bytes));
  });

  it('hashes an archive-sized buffer quickly enough to run once per app start', () => {
    const bytes = new Uint8Array(randomBytes(434_589));
    const t0 = Date.now();
    const digest = sha256Hex(bytes);
    const ms = Date.now() - t0;
    expect(digest).toBe(reference(bytes));
    // Generous ceiling for a loaded CI box; the real cost is recorded in the PR description.
    expect(ms).toBeLessThan(2000);
  });
});
