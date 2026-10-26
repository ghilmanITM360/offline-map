/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// SHA-256 in pure JS with an incremental interface, so a multi-megabyte archive is hashed in bounded memory (one 64-byte block
// buffer plus whatever chunk the caller holds). Integrity only: a matching digest proves the bytes, not who published them.

// Int32 arithmetic with the rotations written out: Hermes has no JIT, so every helper call in the 64-round loop is real interpreter work.
// Measured in the Hermes VM this is about 30% faster than the helper-call version; the digests are identical.
const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export interface Sha256Hasher {
  /** Feeds bytes. The array is only read during the call, so the caller may reuse its buffer. */
  update(data: Uint8Array): void;
  /** Lowercase hex digest. The hasher is finished afterwards; calling update or digestHex again throws. */
  digestHex(): string;
}

export const createSha256 = (): Sha256Hasher => {
  const h = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Int32Array(64);
  const block = new Uint8Array(64);
  let used = 0;
  let total = 0;
  let done = false;

  const compress = (data: Uint8Array, offset: number): void => {
    for (let i = 0, j = offset; i < 16; i++, j += 4) w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      w[i] = (w[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + w[i - 7]
        + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  };

  return {
    update(data) {
      if (done) throw new Error('sha256: already finished');
      total += data.length;
      let i = 0;
      if (used > 0) {
        const take = Math.min(64 - used, data.length);
        block.set(data.subarray(0, take), used);
        used += take;
        i = take;
        if (used < 64) return;
        compress(block, 0);
        used = 0;
      }
      for (; i + 64 <= data.length; i += 64) compress(data, i);
      if (i < data.length) {
        block.set(data.subarray(i), 0);
        used = data.length - i;
      }
    },
    digestHex() {
      if (done) throw new Error('sha256: already finished');
      done = true;
      const bitLength = total * 8;
      block[used++] = 0x80;
      if (used > 56) {
        block.fill(0, used);
        compress(block, 0);
        used = 0;
      }
      block.fill(0, used);
      const high = Math.floor(bitLength / 0x100000000);
      const low = bitLength >>> 0;
      block[56] = high >>> 24; block[57] = high >>> 16; block[58] = high >>> 8; block[59] = high;
      block[60] = low >>> 24; block[61] = low >>> 16; block[62] = low >>> 8; block[63] = low;
      compress(block, 0);
      return Array.from(h, (x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
    },
  };
};

/** One-shot convenience over the incremental hasher. */
export const sha256Hex = (data: Uint8Array): string => {
  const hasher = createSha256();
  hasher.update(data);
  return hasher.digestHex();
};
