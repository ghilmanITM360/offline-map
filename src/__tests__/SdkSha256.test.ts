/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The pack hasher is hand-written (no native dependency), so it is checked against Node's own SHA-256 at every padding boundary, with
// awkward chunking, and with bytes that exercise the sign bit.
import { createHash, randomBytes } from 'node:crypto';
import { createSha256, sha256Hex } from '@muslim-ummah/offline-navigation';

const reference = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const chunked = (bytes: Uint8Array, size: number) => {
  const hasher = createSha256();
  for (let i = 0; i < bytes.length; i += size) hasher.update(bytes.subarray(i, Math.min(bytes.length, i + size)));
  return hasher.digestHex();
};

describe('SDK SHA-256', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it.each([0, 1, 2, 3, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000, 65_535, 65_536, 65_537])('matches Node for %i random bytes', (n) => {
    const bytes = new Uint8Array(randomBytes(n));
    expect(sha256Hex(bytes)).toBe(reference(bytes));
  });

  it('gives the same digest however the bytes are chunked, including one byte at a time and across block edges', () => {
    const bytes = new Uint8Array(randomBytes(1_000));
    const expected = reference(bytes);
    for (const size of [1, 2, 7, 31, 63, 64, 65, 127, 333, 1_000]) expect(chunked(bytes, size)).toBe(expected);
  });

  it('is exact for bytes with the high bit set and for runs of 0x00 and 0xff', () => {
    for (const fill of [0x00, 0x7f, 0x80, 0xff]) {
      const bytes = new Uint8Array(300).fill(fill);
      expect(sha256Hex(bytes)).toBe(reference(bytes));
    }
  });

  it('hashes an archive-sized buffer in bounded chunks to the same digest', () => {
    const bytes = new Uint8Array(randomBytes(434_589));
    expect(chunked(bytes, 64 * 1024)).toBe(reference(bytes));
  });

  it('is single use: a finished hasher refuses more input and a second digest', () => {
    const hasher = createSha256();
    hasher.update(new Uint8Array([1]));
    hasher.digestHex();
    expect(() => hasher.update(new Uint8Array([2]))).toThrow(/finished/);
    expect(() => hasher.digestHex()).toThrow(/finished/);
  });

  it('does not keep or modify the caller\'s buffer', () => {
    const bytes = new Uint8Array(randomBytes(200));
    const copy = bytes.slice();
    const hasher = createSha256();
    hasher.update(bytes);
    bytes.fill(0);
    expect(hasher.digestHex()).toBe(reference(copy));
  });
});
