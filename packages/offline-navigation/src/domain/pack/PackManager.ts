/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { checkPackCompatibility, compareSemver, parseSemver, type PackCompatibilityContext } from './PackCompatibility';
import type { PackError, PackErrorCode } from './PackError';
import { parsePackManifest, type PackManifest } from './PackManifest';
import type { PackRef, PackStore } from './PackStore';
import { verifyPack, type PackTrust, type PackVerifyPorts } from './PackVerifier';
import { parseStrictJson } from './StrictJson';

export interface BundledPack {
  /** Stable id inside the `bundled` area. */
  id: string;
  manifestText: string;
  /** Digest shipped with the app: bundled content is authenticated by being part of the signed app binary. */
  pinnedManifestSha256: string;
}

export interface PackManagerConfig {
  store: PackStore;
  sdkVersion: string;
  platformCapabilities: readonly string[];
  bundled?: readonly BundledPack[];
  /** Hashing / signature ports; the file reader always comes from the store. */
  ports: Omit<PackVerifyPorts, 'reader'>;
  /** Installed (non-bundled) packs must be signed by one of these keys. */
  trustedKeyIds?: readonly string[];
  /** Default true: installed packs fail closed without a verifiable signature. `false` accepts `trust: 'none'` installs. */
  requireSignature?: boolean;
  /** Extra free bytes required beyond the pack itself (staging temp, journal, platform overhead). */
  reserveBytes?: number;
  /** `full` (default) re-hashes active installed packs at startup, as the bundled basemap already does; `none` trusts the directory. */
  verifyOnRecover?: 'full' | 'none';
}

export interface ActivePack {
  ref: PackRef;
  manifest: PackManifest;
  source: 'installed' | 'bundled';
}

export interface PackPin extends ActivePack {
  /** Idempotent. While pinned, an installed pack's files are never removed. */
  release(): void;
}

export interface InstallOptions {
  venueId: string;
  signature?: string;
  /** Only for an explicitly authorized emergency rollback channel; never a default. */
  allowDowngrade?: boolean;
}

export type PackOpResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: PackError };

export interface RecoveryReport {
  pointerCorrupt: boolean;
  /** Venues whose active pack was definitively broken and were rolled back or returned to the bundled pack. */
  repaired: Array<{ venueId: string; reason: PackError; to: 'previous' | 'bundled' | 'none' }>;
  /** Venues whose installed pack could not be used right now (unreadable storage, SDK/platform mismatch); files are kept. */
  unavailable: Array<{ venueId: string; reason: PackError }>;
  removedStaging: number;
  removedOrphans: number;
}

/** `confirmed` = the pack has run successfully on this device; only a confirmed pack is kept as the rollback target. */
interface VenueEntry { active: string; previous: string | null; confirmed: boolean }
const POINTER_VERSION = 1;
type Version = [number, number, number];

/** Failures that prove the pack on disk is wrong. Anything else (I/O error, SDK range after an app update) is not grounds to delete it. */
const DEFINITIVE: ReadonlySet<PackErrorCode> = new Set<PackErrorCode>([
  'resource-missing', 'resource-size-mismatch', 'resource-hash-mismatch', 'resource-unexpected', 'manifest-malformed',
  'field-invalid', 'schema-unsupported', 'totals-mismatch', 'resource-path-unsafe', 'resource-duplicate', 'required-resource-missing', 'venue-mismatch',
]);
const TRANSIENT: ReadonlySet<PackErrorCode> = new Set<PackErrorCode>(['resource-unreadable', 'digest-unverifiable']);

const err = (code: PackErrorCode, message: string, path?: string): { ok: false; error: PackError } => ({ ok: false, error: { code, message, path } });
const versionOf = (m: PackManifest): Version => parseSemver(m.packVersion) as Version;

/**
 * One manager per app, `recover()` once at startup. Offline by construction: nothing here reaches a network; installs consume
 * a staging directory the host has already filled. Mutations are serialized and the active pointer is a single atomic
 * write, so a crash leaves the old or the new pack active, never a mixture, and an unverified pack is never activated.
 */
export const createPackManager = (config: PackManagerConfig) => {
  const { store } = config;
  const bundled = config.bundled ?? [];
  const venues = new Map<string, VenueEntry>();
  /** Installed packs this process cannot use (kept on disk, bundled served instead). */
  const unavailable = new Map<string, PackError>();
  const pins = new Map<string, number>();
  const pendingRemoval = new Set<string>();
  let generation = 0;
  let pointerReadable = true;
  let recovered = false;
  let recoverPromise: Promise<RecoveryReport> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  const needRecovered = (): void => { if (!recovered) throw new Error('PackManager.recover() must complete first'); };

  const compat = (expectedVenueId?: string): PackCompatibilityContext => ({
    sdkVersion: config.sdkVersion, platformCapabilities: config.platformCapabilities, expectedVenueId,
  });
  const readerFor = (ref: PackRef): PackVerifyPorts => ({ ...config.ports, reader: store.reader(ref) });

  const bundledFor = (venueId: string): Array<{ pack: BundledPack; manifest: PackManifest }> => {
    const out: Array<{ pack: BundledPack; manifest: PackManifest }> = [];
    for (const pack of bundled) {
      const m = parsePackManifest(pack.manifestText);
      if (m.ok && m.manifest.venueId === venueId) out.push({ pack, manifest: m.manifest });
    }
    return out.sort((a, b) => compareSemver(versionOf(b.manifest), versionOf(a.manifest)));
  };

  /** Integrity + compatibility of an installed pack. Its signature was checked at install and is not stored: this is not authentication. */
  const verifyInstalled = async (id: string, venueId: string, deep: boolean): Promise<{ ok: true; manifest: PackManifest } | { ok: false; error: PackError }> => {
    const ref: PackRef = { area: 'installed', id };
    let text: string | null;
    try {
      text = await store.readManifest(ref);
    } catch {
      return err('resource-unreadable', 'installed manifest could not be read', id);
    }
    if (text === null) return err('resource-missing', 'installed manifest is missing', id);
    if (!deep) {
      const parsed = parsePackManifest(text);
      if (!parsed.ok) return parsed;
      const c = checkPackCompatibility(parsed.manifest, compat(venueId));
      return c.ok ? { ok: true, manifest: parsed.manifest } : c;
    }
    const r = await verifyPack(text, readerFor(ref), { compatibility: compat(venueId) });
    return r.ok ? { ok: true, manifest: r.manifest } : r;
  };

  // Bundled content is hashed once per process (warmed in recover): hashing a large archive per lookup would stall navigation.
  // Only a definitive mismatch is remembered as a failure; a transient read error is retried.
  const bundledMemo = new Map<string, ActivePack | null>();
  const resolveBundled = async (venueId: string): Promise<ActivePack | null> => {
    for (const { pack } of bundledFor(venueId)) {
      if (!bundledMemo.has(pack.id)) {
        const ref: PackRef = { area: 'bundled', id: pack.id };
        const r = await verifyPack(pack.manifestText, readerFor(ref), { pinnedManifestSha256: pack.pinnedManifestSha256, compatibility: compat(venueId) });
        if (r.ok) bundledMemo.set(pack.id, { ref, manifest: r.manifest, source: 'bundled' });
        else if (DEFINITIVE.has(r.error.code) || r.error.code === 'manifest-digest-mismatch' || r.error.code === 'sdk-incompatible' || r.error.code === 'capability-missing') bundledMemo.set(pack.id, null);
        else continue;
      }
      const hit = bundledMemo.get(pack.id);
      if (hit) return hit;
    }
    return null;
  };
  const manifestTextOf = (ref: PackRef): Promise<string | null> =>
    ref.area === 'bundled' ? Promise.resolve(bundled.find((b) => b.id === ref.id)?.manifestText ?? null) : store.readManifest(ref);

  const pointerText = (gen: number): string => JSON.stringify({
    v: POINTER_VERSION, generation: gen,
    venues: Object.fromEntries([...venues.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, e]) => [k, { active: e.active, previous: e.previous, confirmed: e.confirmed }])),
  });
  /**
   * Persist `next`; memory changes only if the write succeeds. A rejected write is not proof that nothing changed (a platform can fail after
   * the new pointer is already in place, e.g. while cleaning up the replaced file), so the disk is read back: if it holds exactly the text
   * that was written, the write committed and the failure is ignored.
   */
  const writeState = async (next: Map<string, VenueEntry>): Promise<PackError | null> => {
    const saved = new Map(venues);
    venues.clear();
    next.forEach((v, k) => venues.set(k, v));
    const text = pointerText(generation + 1);
    try {
      await store.writePointer(text);
    } catch {
      let landed = false;
      try { landed = (await store.readPointer()) === text; } catch { landed = false; }
      if (!landed) {
        venues.clear();
        saved.forEach((v, k) => venues.set(k, v));
        return { code: 'pointer-write-failed', message: 'the active pointer could not be written' };
      }
    }
    generation += 1;
    return null;
  };

  /** The pack ids the pointer on disk references; null when that cannot be established (unreadable or unparseable): then nothing is safe to delete. */
  const persistedIds = async (): Promise<Set<string> | null> => {
    try {
      const text = await store.readPointer();
      if (text === null) return new Set();
      const parsed = parsePointerText(text);
      return parsed ? new Set([...parsed.venues.values()].flatMap((e) => (e.previous ? [e.active, e.previous] : [e.active]))) : null;
    } catch {
      return null;
    }
  };

  /** Never removes a pack that is pinned by a journey or that the persisted pointer still references; those stay for a later sweep or recovery. */
  const removeInstalled = async (id: string): Promise<boolean> => {
    if ((pins.get(id) ?? 0) > 0) { pendingRemoval.add(id); return false; }
    const onDisk = await persistedIds();
    if (onDisk === null || onDisk.has(id)) { pendingRemoval.add(id); return false; }
    try {
      await store.remove({ area: 'installed', id });
      pendingRemoval.delete(id);
      return true;
    } catch {
      pendingRemoval.add(id); // retried on the next mutation or recovery; never blocks navigation
      return false;
    }
  };
  const referenced = (): Set<string> => new Set([...venues.values()].flatMap((e) => (e.previous ? [e.active, e.previous] : [e.active])));
  const sweepPending = async (): Promise<void> => {
    const keep = referenced();
    for (const id of [...pendingRemoval]) if (!keep.has(id)) await removeInstalled(id); else pendingRemoval.delete(id);
  };
  const removeUnreferenced = async (ids: Array<string | null | undefined>): Promise<void> => {
    const keep = referenced();
    for (const id of new Set(ids)) if (id && !keep.has(id)) await removeInstalled(id);
  };

  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  /** Strict shape check: a plain record of plain entries and a finite, non-negative integer generation. Anything else is corrupt, never "empty". */
  const parsePointerText = (text: string): { generation: number; venues: Map<string, VenueEntry> } | null => {
    try {
      const o = parseStrictJson(text);
      if (!isRecord(o) || o.v !== POINTER_VERSION || !Number.isSafeInteger(o.generation) || (o.generation as number) < 0 || !isRecord(o.venues)) return null;
      const out = new Map<string, VenueEntry>();
      for (const [k, raw] of Object.entries(o.venues)) {
        if (!isRecord(raw)) return null;
        const e = raw as { active?: unknown; previous?: unknown; confirmed?: unknown };
        const idOk = (v: unknown) => typeof v === 'string' && v.startsWith(`${k}@`) && parseSemver(v.slice(k.length + 1)) !== null;
        if (!idOk(e.active) || (e.previous !== null && !idOk(e.previous)) || typeof e.confirmed !== 'boolean') return null;
        out.set(k, { active: e.active as string, previous: e.previous as string | null, confirmed: e.confirmed });
      }
      return { generation: o.generation as number, venues: out };
    } catch {
      return null;
    }
  };
  const parsePointer = (text: string): Map<string, VenueEntry> | null => {
    const parsed = parsePointerText(text);
    if (!parsed) return null;
    generation = parsed.generation;
    return parsed.venues;
  };

  const doRecover = async (): Promise<RecoveryReport> => {
    const report: RecoveryReport = { pointerCorrupt: false, repaired: [], unavailable: [], removedStaging: 0, removedOrphans: 0 };
    venues.clear(); unavailable.clear();
    generation = 0;
    pointerReadable = true;
    const text = await store.readPointer();
    if (text !== null) {
      const parsed = parsePointer(text);
      if (parsed) parsed.forEach((v, k) => venues.set(k, v)); else { report.pointerCorrupt = true; pointerReadable = false; }
    }
    // Leftover staging is untrusted and unfinished: recover() runs once, before any install in this process.
    for (const id of await store.list('staging')) { await store.remove({ area: 'staging', id }); report.removedStaging++; }

    if (pointerReadable) {
      const next = new Map(venues);
      let changed = false;
      for (const [venueId, entry] of venues) {
        const active = await verifyInstalled(entry.active, venueId, config.verifyOnRecover !== 'none');
        if (active.ok) continue;
        if (!DEFINITIVE.has(active.error.code)) {
          // Unreadable storage or an SDK/platform mismatch after an app update says nothing about the pack's integrity: keep the files.
          unavailable.set(venueId, active.error);
          report.unavailable.push({ venueId, reason: active.error });
          continue;
        }
        const prev = entry.previous ? await verifyInstalled(entry.previous, venueId, true) : null;
        if (prev && !prev.ok && !DEFINITIVE.has(prev.error.code)) {
          // The fallback cannot be judged right now either; deleting it would be a guess.
          unavailable.set(venueId, prev.error);
          report.unavailable.push({ venueId, reason: prev.error });
          continue;
        }
        changed = true;
        if (prev?.ok) { next.set(venueId, { active: entry.previous as string, previous: null, confirmed: true }); report.repaired.push({ venueId, reason: active.error, to: 'previous' }); }
        else { next.delete(venueId); report.repaired.push({ venueId, reason: active.error, to: (await resolveBundled(venueId)) ? 'bundled' : 'none' }); }
      }
      if (changed) {
        // If persisting fails, still serve the repaired view in this process; the next recover() repeats the repair.
        if (await writeState(next)) { venues.clear(); next.forEach((v, k) => venues.set(k, v)); }
      }
      // Orphans (a commit whose pointer write never happened, a removal a crash interrupted) are not referenced.
      const keep = referenced();
      for (const id of await store.list('installed')) {
        if (!keep.has(id) && (pins.get(id) ?? 0) === 0 && (await removeInstalled(id))) report.removedOrphans++;
      }
    }
    for (const b of bundled) { const m = parsePackManifest(b.manifestText); if (m.ok) await resolveBundled(m.manifest.venueId); } // warm the hash memo
    recovered = true;
    return report;
  };
  /** Run once at startup. Calling again returns the same report and does not touch staging; a failed attempt can be retried. */
  const recover = (): Promise<RecoveryReport> => {
    recoverPromise ??= serialize(doRecover).catch((e) => { recoverPromise = null; throw e; });
    return recoverPromise;
  };

  const versionOfRef = (m: PackManifest): Version => versionOf(m);
  /** The pack to use: the higher of the installed active pack and the best bundled pack (an app update must not be shadowed by a stale install). */
  const resolveActive = async (venueId: string): Promise<ActivePack | null> => {
    needRecovered();
    let installed: ActivePack | null = null;
    const entry = venues.get(venueId);
    if (entry && !unavailable.has(venueId)) {
      const ref: PackRef = { area: 'installed', id: entry.active };
      let text: string | null = null;
      try { text = await store.readManifest(ref); } catch { /* unreadable right now: serve the bundled pack, keep the files */ }
      const parsed = text === null ? null : parsePackManifest(text);
      if (parsed?.ok && parsed.manifest.venueId === venueId) installed = { ref, manifest: parsed.manifest, source: 'installed' };
    }
    const fallback = await resolveBundled(venueId);
    if (installed && fallback && compareSemver(versionOfRef(fallback.manifest), versionOfRef(installed.manifest)) > 0) return fallback;
    return installed ?? fallback;
  };

  const effectiveVersion = async (venueId: string): Promise<{ version: Version; text: string | null } | null> => {
    const active = await resolveActive(venueId);
    return active && { version: versionOf(active.manifest), text: await manifestTextOf(active.ref) };
  };

  const retire = (id: string): void => {
    const n = (pins.get(id) ?? 1) - 1;
    if (n <= 0) { pins.delete(id); void serialize(sweepPending); } else pins.set(id, n);
  };

  return {
    recover,
    /** Not queued behind installs: opening a venue never waits for a long verification. */
    resolveActive,
    venueIds: (): string[] => [...new Set([...venues.keys(), ...bundled.flatMap((b) => { const m = parsePackManifest(b.manifestText); return m.ok ? [m.manifest.venueId] : []; })])].sort(),

    /**
     * Pin the pack a journey starts on: a later activation or rollback cannot remove its files or switch its graph. The
     * pin is taken synchronously on the current active id before any await, so no removal can slip in while resolving.
     */
    pin: async (venueId: string): Promise<PackPin | null> => {
      needRecovered();
      for (let attempt = 0; attempt < 3; attempt++) {
        const early = venues.get(venueId)?.active;
        if (early) pins.set(early, (pins.get(early) ?? 0) + 1);
        let active: ActivePack | null;
        try {
          active = await resolveActive(venueId);
        } catch (e) {
          if (early) retire(early); // never leak a pin when resolving fails
          throw e;
        }
        if (active && active.ref.area === 'installed' && active.ref.id !== early) { if (early) retire(early); continue; } // state moved: retry
        if (!active || active.ref.area !== 'installed') { if (early) retire(early); }
        if (!active) return null;
        let held = active.ref.area === 'installed';
        return { ...active, release: () => { if (held) { held = false; retire(active.ref.id); } } };
      }
      throw new Error('the active pack kept changing while pinning');
    },

    /** Call before downloading/copying into staging: refuses without touching any existing pack. */
    checkRoom: async (manifestText: string): Promise<PackOpResult> => {
      const parsed = parsePackManifest(manifestText);
      if (!parsed.ok) return parsed;
      const free = await store.freeBytes();
      const need = parsed.manifest.totalBytes + (config.reserveBytes ?? 0);
      return free >= need ? { ok: true } : err('storage-insufficient', `need ${need} bytes, ${free} free`);
    },

    installStaged: (stagingId: string, options: InstallOptions): Promise<PackOpResult<{ manifest: PackManifest; trust: PackTrust }>> => serialize(async () => {
      needRecovered();
      if (!pointerReadable) return err('pointer-corrupt', 'the active pointer is unreadable; call repairPointer() first');
      const stagingRef: PackRef = { area: 'staging', id: stagingId };
      const discard = async () => { try { await store.remove({ area: 'staging', id: stagingId }); } catch { /* recovery removes it */ } };
      let text: string | null;
      try {
        text = await store.readManifest(stagingRef);
      } catch {
        return err('resource-unreadable', 'the staged manifest could not be read', stagingId); // staging kept: may succeed on retry
      }
      if (text === null) return err('staging-missing', 'nothing is staged under that id', stagingId);

      // Cheap, unauthenticated pre-checks first so a refusal never waits for hashing a large archive; the full verify still runs below.
      const early = parsePackManifest(text);
      if (!early.ok) { await discard(); return early; }
      if (early.manifest.venueId !== options.venueId) { await discard(); return err('venue-mismatch', `pack is for '${early.manifest.venueId}', not '${options.venueId}'`); }
      const current = await effectiveVersion(options.venueId);
      if (current) {
        const c = compareSemver(versionOf(early.manifest), current.version);
        if (c === 0) { await discard(); return current.text === text ? err('already-installed', 'this exact pack is already active') : err('version-conflict', 'same version, different content'); }
        if (c < 0 && !options.allowDowngrade) { await discard(); return err('version-not-newer', 'an older pack never replaces a newer one without an authorized downgrade'); }
      }

      const v = await verifyPack(text, readerFor(stagingRef), {
        requireSignature: config.requireSignature ?? true, trustedKeyIds: config.trustedKeyIds, signature: options.signature, compatibility: compat(options.venueId),
      });
      if (!v.ok) { if (!TRANSIENT.has(v.error.code)) await discard(); return v; } // an I/O error may succeed on retry
      const { manifest } = v;

      const id = `${manifest.venueId}@${manifest.packVersion}`;
      if (referenced().has(id)) { await discard(); return err('version-conflict', 'that version is still referenced as active/previous'); }
      if ((await store.list('installed')).includes(id)) {
        await removeInstalled(id); // an orphan from an interrupted run
        if ((await store.list('installed')).includes(id)) return err('version-conflict', 'that directory is still in use; retry after the journey ends', id); // staging kept
      }
      try {
        await store.commit(stagingId, id);
      } catch {
        await discard();
        return err('commit-failed', 'the staged pack could not be moved into place', id);
      }
      // Staging can be written by others between the verification above and the move, so what was verified is not yet what is installed.
      // Bind them before anything points at it: the committed manifest must be the very bytes that were authenticated, and the committed
      // files must still match it. Anything else is removed unreferenced and never activated.
      const installedRef: PackRef = { area: 'installed', id };
      let committedText: string | null = null;
      try { committedText = await store.readManifest(installedRef); } catch { committedText = null; }
      const bound = committedText === text ? await verifyPack(text, readerFor(installedRef), { compatibility: compat(options.venueId) }) : null;
      if (!bound?.ok) {
        await removeInstalled(id);
        return bound ? bound : err('manifest-digest-mismatch', 'the staged manifest changed after it was verified', id);
      }

      // Only a pack that has run successfully (confirmed) becomes the rollback target; an unconfirmed one is replaced, not kept.
      const old = venues.get(manifest.venueId);
      const previous = old ? (old.confirmed ? old.active : old.previous) : null;
      const next = new Map(venues);
      next.set(manifest.venueId, { active: id, previous, confirmed: false });
      const failed = await writeState(next);
      if (failed) { await removeInstalled(id); return { ok: false, error: failed }; }
      unavailable.delete(manifest.venueId);
      await removeUnreferenced([old?.active, old?.previous]);
      await sweepPending();
      return { ok: true, manifest, trust: v.trust };
    }),

    /** The host calls this with the id it ran on (`pin.ref.id`) once that pack served a successful session: it becomes the last-known-good rollback target. */
    confirmActive: (venueId: string, packId: string): Promise<PackOpResult> => serialize(async () => {
      needRecovered();
      const entry = venues.get(venueId);
      if (!entry || unavailable.has(venueId)) return err('not-installed', 'no usable installed pack for this venue');
      // The id the session actually ran on (e.g. `pin.ref.id`): an install that activated meanwhile must not inherit its success.
      if (entry.active !== packId) return err('version-conflict', 'a different pack is active now; it has not run yet');
      if (entry.confirmed) return { ok: true };
      const next = new Map(venues);
      next.set(venueId, { ...entry, confirmed: true });
      const failed = await writeState(next);
      return failed ? { ok: false, error: failed } : { ok: true };
    }),

    /** Return a venue to its previous confirmed pack (or the bundled one) after a failed run; the failed pack is removed. */
    rollback: (venueId: string): Promise<PackOpResult<{ to: 'previous' | 'bundled' }>> => serialize(async () => {
      needRecovered();
      const entry = venues.get(venueId);
      if (!entry) return err('not-installed', 'no installed pack for this venue');
      const next = new Map(venues);
      let to: 'previous' | 'bundled';
      const prev = entry.previous ? await verifyInstalled(entry.previous, venueId, true) : null;
      if (prev && !prev.ok && !DEFINITIVE.has(prev.error.code)) return prev; // cannot tell if it is broken: change nothing
      if (prev?.ok) { next.set(venueId, { active: entry.previous as string, previous: null, confirmed: true }); to = 'previous'; }
      else if (await resolveBundled(venueId)) { next.delete(venueId); to = 'bundled'; }
      else return err('no-previous', 'there is nothing verified to roll back to');
      const failed = await writeState(next);
      if (failed) return { ok: false, error: failed };
      unavailable.delete(venueId);
      await removeUnreferenced([entry.active, entry.previous]);
      await sweepPending();
      return { ok: true, to };
    }),

    /** After `pointerCorrupt`: start from an empty pointer (bundled packs serve; installed directories are swept by the next recover()). */
    repairPointer: (): Promise<PackOpResult> => serialize(async () => {
      needRecovered();
      if (pointerReadable) return { ok: true };
      // Keep every installed pack that still verifies instead of declaring them all orphans: rebuild the pointer from the directories, the
      // newest per venue, unconfirmed (nothing says it has run). If a directory cannot be judged right now, change nothing and let the caller retry.
      const found = new Map<string, { id: string; version: Version }>();
      for (const id of await store.list('installed')) {
        const at = id.lastIndexOf('@');
        const version = at > 0 ? parseSemver(id.slice(at + 1)) : null;
        if (!version) continue;
        const venueId = id.slice(0, at);
        const checked = await verifyInstalled(id, venueId, true);
        if (!checked.ok) { if (DEFINITIVE.has(checked.error.code)) continue; return checked; }
        if (`${checked.manifest.venueId}@${checked.manifest.packVersion}` !== id) continue;
        const best = found.get(venueId);
        if (!best || compareSemver(version as Version, best.version) > 0) found.set(venueId, { id, version: version as Version });
      }
      const rebuilt = new Map<string, VenueEntry>();
      found.forEach((f, venueId) => rebuilt.set(venueId, { active: f.id, previous: null, confirmed: false }));
      const failed = await writeState(rebuilt);
      if (failed) return { ok: false, error: failed };
      pointerReadable = true;
      return { ok: true };
    }),
  };
};

export type PackManager = ReturnType<typeof createPackManager>;
