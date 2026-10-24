/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackManifest } from './PackManifest';
import type { PackError } from './PackError';

type Semver = readonly [number, number, number];
const SEMVER = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const COMPARATOR = /^(>=|<=|>|<|=)(\d+\.\d+\.\d+)$/;

/** Strict `x.y.z` only; pre-release/build metadata are deliberately unsupported (a pack targets released SDKs). */
export const parseSemver = (v: string): Semver | null => {
  const m = SEMVER.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

export const compareSemver = (a: Semver, b: Semver): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** A range is one or more space-separated comparators (`>=0.1.0 <0.2.0`); all must hold. */
const parseRange = (range: string): Array<[string, Semver]> | null => {
  const parts = range.split(' ');
  const out: Array<[string, Semver]> = [];
  for (const p of parts) {
    const m = COMPARATOR.exec(p);
    const v = m && parseSemver(m[2]);
    if (!m || !v) return null;
    out.push([m[1], v]);
  }
  return out;
};

/** Valid and bounded on both sides, so a pack can never claim every future SDK. */
export const isValidSdkRange = (range: string): boolean => {
  const r = parseRange(range);
  return r !== null && r.some(([op]) => op === '>=' || op === '>' || op === '=') && r.some(([op]) => op === '<' || op === '<=' || op === '=');
};

const satisfies = (version: Semver, range: Array<[string, Semver]>): boolean => range.every(([op, v]) => {
  const c = compareSemver(version, v);
  return op === '>=' ? c >= 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : op === '<' ? c < 0 : c === 0;
});

export interface PackCompatibilityContext {
  sdkVersion: string;
  /** Capabilities the host platform actually provides (e.g. `pmtiles-local-read`). */
  platformCapabilities: readonly string[];
  /** When set, a pack for any other venue is rejected (never silently substituted). */
  expectedVenueId?: string;
}

export type PackCompatibility = { ok: true } | { ok: false; error: PackError };

export const checkPackCompatibility = (manifest: PackManifest, ctx: PackCompatibilityContext): PackCompatibility => {
  const err = (code: PackError['code'], message: string): PackCompatibility => ({ ok: false, error: { code, message } });
  if (ctx.expectedVenueId !== undefined && manifest.venueId !== ctx.expectedVenueId) {
    return err('venue-mismatch', `pack is for '${manifest.venueId}', not '${ctx.expectedVenueId}'`);
  }
  const sdk = parseSemver(ctx.sdkVersion);
  const range = parseRange(manifest.sdkCompatibility);
  if (!sdk || !range || !satisfies(sdk, range)) return err('sdk-incompatible', `SDK ${ctx.sdkVersion} is outside '${manifest.sdkCompatibility}'`);
  const missing = manifest.minimumPlatformCapabilities.find((c) => !ctx.platformCapabilities.includes(c));
  if (missing !== undefined) return err('capability-missing', `platform lacks '${missing}'`);
  return { ok: true };
};
