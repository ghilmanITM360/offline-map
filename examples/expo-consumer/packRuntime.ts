import {
  createFileSystemPackStore, createPackManager, createPlaceCatalog, parsePackPlaceCatalog, parsePackVenueData, parsePackVenueGeometry, sha256Hex,
  type PackError, type PackFileSystem, type PackManager, type PackManifest, type PackPin, type PlaceCatalog, type RecoveryReport, type VenueDataSource, type VenueGeometry,
} from '@muslim-ummah/offline-navigation';
import { installBundledPacks, type BundledPackInstall, type BundledPackSource, type PackAssetCopier } from './bundledPacks';

// Startup and venue opening on top of the SDK's PackManager. Order matters: bundled packs are made present and verified FIRST (the
// manager memoizes a definitive bundled failure for the process), then recover() sweeps interrupted updates and repairs the pointer.
// There is no signature verifier and no import path here: imported or remote packs are refused until a real publisher key exists.

/** The venue that opens first when the build bundles it. */
export const DEFAULT_VENUE_ID = 'karachi-ijtema';

export const textSha256 = async (text: string): Promise<string> => sha256Hex(new TextEncoder().encode(text));

/** Where startup time went, measured on the device. `readMs` is time spent waiting for file reads; hashing is what is left of the verify steps. */
export interface StartupTimings {
  /** Bundled packs: copy if needed, verify. */
  installMs: number;
  /** Time inside the copier (packaged asset to app storage, and the manifest read). */
  copyMs: number;
  /** Sweep and pointer repair. */
  recoverMs: number;
  /** The last `open()`: pin (verify) plus reading and re-checking the venue files. */
  openMs: number;
  /** Time awaiting `readChunks`, summed over every pass. */
  readMs: number;
  bytesRead: number;
  filesRead: number;
}

const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

type PackFileDigest = NonNullable<Parameters<typeof createFileSystemPackStore>[0]['digestFile']>;

export interface PackRuntimeDeps {
  fs: PackFileSystem;
  sources: readonly BundledPackSource[];
  copier: PackAssetCopier;
  sdkVersion: string;
  platformCapabilities: readonly string[];
  /** Optional platform SHA-256 of a whole file (see nativeDigest.ts); the SDK streams in JS when it is absent or declines. */
  digestFile?: PackFileDigest;
}

export interface OpenedVenue {
  source: VenueDataSource;
  manifest: PackManifest;
  origin: 'bundled' | 'installed';
  /** Archive path relative to the pack file system's root; the host turns it into a `file://` URI for the map. */
  archivePath: string;
  /** English place names. */
  names: ReadonlyMap<string, string>;
  /** Every language the pack's localization file carries, per place: `{ en, ur, 'ur-Latn' }`. */
  localizedNames?: ReadonlyMap<string, Readonly<Record<string, string>>>;
  /** Present only when the pack carries a `place-catalog`: every place a person can search for, with its location and routing status. */
  catalog?: PlaceCatalog;
  /** Present only when the pack carries a `venue-geometry`: block outlines, access points, gates, rastas, facilities. */
  geometry?: VenueGeometry;
  /** Drop the journey pin. Idempotent. */
  release(): void;
}

export type OpenVenueResult = { ok: true; venue: OpenedVenue } | { ok: false; error: PackError | { code: 'no-pack'; message: string } };

export interface PackRuntime {
  manager: PackManager;
  install: BundledPackInstall;
  recovery: RecoveryReport;
  timings: StartupTimings;
  venueIds(): string[];
  /** Pins the active pack (so an update or rollback cannot change or remove it mid-journey) and loads its venue. */
  open(venueId: string): Promise<OpenVenueResult>;
}

export const startPacks = async (deps: PackRuntimeDeps): Promise<PackRuntime> => {
  const timings: StartupTimings = { installMs: 0, copyMs: 0, recoverMs: 0, openMs: 0, readMs: 0, bytesRead: 0, filesRead: 0 };
  // Counting wrappers only: the bytes and the order of reads are exactly what the unwrapped file system would see.
  const fs: PackFileSystem = {
    ...deps.fs,
    readChunks: async function* (path, chunkBytes) {
      timings.filesRead += 1;
      const iterator = deps.fs.readChunks(path, chunkBytes)[Symbol.asyncIterator]();
      for (;;) {
        const t = now();
        const next = await iterator.next();
        timings.readMs += now() - t;
        if (next.done) return;
        timings.bytesRead += next.value.length;
        yield next.value;
      }
    },
  };
  const timedCopier: PackAssetCopier = {
    readText: async (...args) => { const t = now(); try { return await deps.copier.readText(...args); } finally { timings.copyMs += now() - t; } },
    copy: async (...args) => { const t = now(); try { await deps.copier.copy(...args); } finally { timings.copyMs += now() - t; } },
  };
  const startedAt = now();
  const install = await installBundledPacks({ ...deps, fs, copier: timedCopier, sha256Text: textSha256 });
  timings.installMs = now() - startedAt;
  const manager = createPackManager({
    store: createFileSystemPackStore({ fs, digestFile: deps.digestFile }),
    sdkVersion: deps.sdkVersion,
    platformCapabilities: deps.platformCapabilities,
    bundled: install.bundled,
    ports: { manifestSha256: textSha256 },
  });
  const recoverStart = now();
  const recovery = await manager.recover();
  timings.recoverMs = now() - recoverStart;

  const open = async (venueId: string): Promise<OpenVenueResult> => {
    const openStart = now();
    try { return await openVenue(venueId); } finally { timings.openMs = now() - openStart; }
  };
  const openVenue = async (venueId: string): Promise<OpenVenueResult> => {
    const pin: PackPin | null = await manager.pin(venueId);
    if (!pin) return { ok: false, error: { code: 'no-pack', message: `no verified pack for '${venueId}'` } };
    const fail = (error: PackError): OpenVenueResult => { pin.release(); return { ok: false, error }; };
    const dir = pin.ref.area === 'bundled' ? `bundled/${pin.ref.id}` : `packs/installed/${pin.ref.id}`;
    const resource = (kind: PackManifest['resources'][number]['kind']) => pin.manifest.resources.find((r) => r.kind === kind)!;
    // The pack was verified when it was resolved; the bytes about to be parsed are checked against the manifest again.
    const read = async (kind: 'routing-graph' | 'place-directory' | 'localization' | 'place-catalog' | 'venue-geometry'): Promise<string | PackError> => {
      const r = resource(kind);
      const text = await fs.readText(`${dir}/${r.path}`).catch(() => null);
      if (text === null) return { code: 'resource-missing', message: 'file is missing', path: r.path };
      return (await textSha256(text)) === r.sha256 ? text : { code: 'resource-hash-mismatch', message: 'SHA-256 mismatch', path: r.path };
    };
    const [graph, places, localization] = [await read('routing-graph'), await read('place-directory'), await read('localization')];
    for (const part of [graph, places, localization]) if (typeof part !== 'string') return fail(part);
    const parsed = parsePackVenueData(graph as string, places as string, venueId);
    if (!parsed.ok) return fail(parsed.error);
    const names = new Map<string, string>();
    const localizedNames = new Map<string, Record<string, string>>();
    try {
      for (const entry of JSON.parse(localization as string).entries as Array<{ id: string; names: Record<string, unknown> }>) {
        if (typeof entry.names?.en === 'string') names.set(entry.id, entry.names.en);
        const all: Record<string, string> = {};
        for (const [language, name] of Object.entries(entry.names ?? {})) if (typeof name === 'string' && name.length > 0) all[language] = name;
        localizedNames.set(entry.id, all);
      }
    } catch {
      return fail({ code: 'resource-invalid', message: 'localization is not valid JSON', path: resource('localization').path });
    }
    // Optional resources: absent in a version-1 pack, which then opens exactly as before. Present, they are held to the same re-check and strict
    // parsing as the routing data, and a bad one fails the open (a pack is never activated with half its data).
    let catalog: PlaceCatalog | undefined;
    let geometry: VenueGeometry | undefined;
    const nodeIds = new Set(parsed.source.graph.nodeIds());
    if (pin.manifest.resources.some((r) => r.kind === 'place-catalog')) {
      const text = await read('place-catalog');
      if (typeof text !== 'string') return fail(text);
      const c = parsePackPlaceCatalog(text, { venueId, bounds: pin.manifest.bounds, nodeIds, languages: pin.manifest.languages });
      if (!c.ok) return fail(c.error);
      catalog = createPlaceCatalog(c.catalog);
    }
    if (pin.manifest.resources.some((r) => r.kind === 'venue-geometry')) {
      const text = await read('venue-geometry');
      if (typeof text !== 'string') return fail(text);
      const placeIds = new Set(catalog ? catalog.list().map((p) => p.id) : parsed.source.placeIds());
      const g = parsePackVenueGeometry(text, { venueId, bounds: pin.manifest.bounds, placeIds, nodeIds });
      if (!g.ok) return fail(g.error);
      geometry = g.geometry;
    }
    return {
      ok: true,
      venue: { source: parsed.source, manifest: pin.manifest, ...(catalog ? { catalog } : {}), ...(geometry ? { geometry } : {}), origin: pin.ref.area === 'bundled' ? 'bundled' : 'installed', archivePath: `${dir}/${resource('map-archive').path}`, names, localizedNames, release: () => pin.release() },
    };
  };

  return { manager, install, recovery, timings, venueIds: () => manager.venueIds(), open };
};
