import {
  createFileSystemPackStore, createPackManager, parsePackVenueData, sha256Hex, type PackError, type PackFileSystem, type PackManager,
  type PackManifest, type PackPin, type RecoveryReport, type VenueDataSource,
} from '@muslim-ummah/offline-navigation';
import { installBundledPacks, type BundledPackInstall, type BundledPackSource, type PackAssetCopier } from './bundledPacks';

// Startup and venue opening on top of the SDK's PackManager. Order matters: bundled packs are made present and verified FIRST (the
// manager memoizes a definitive bundled failure for the process), then recover() sweeps interrupted updates and repairs the pointer.
// There is no signature verifier and no import path here: imported or remote packs are refused until a real publisher key exists.

/** The venue that opens first when the build bundles it. */
export const DEFAULT_VENUE_ID = 'karachi-ijtema';

export const textSha256 = async (text: string): Promise<string> => sha256Hex(new TextEncoder().encode(text));

export interface PackRuntimeDeps {
  fs: PackFileSystem;
  sources: readonly BundledPackSource[];
  copier: PackAssetCopier;
  sdkVersion: string;
  platformCapabilities: readonly string[];
}

export interface OpenedVenue {
  source: VenueDataSource;
  manifest: PackManifest;
  origin: 'bundled' | 'installed';
  /** Archive path relative to the pack file system's root; the host turns it into a `file://` URI for the map. */
  archivePath: string;
  names: ReadonlyMap<string, string>;
  /** Drop the journey pin. Idempotent. */
  release(): void;
}

export type OpenVenueResult = { ok: true; venue: OpenedVenue } | { ok: false; error: PackError | { code: 'no-pack'; message: string } };

export interface PackRuntime {
  manager: PackManager;
  install: BundledPackInstall;
  recovery: RecoveryReport;
  venueIds(): string[];
  /** Pins the active pack (so an update or rollback cannot change or remove it mid-journey) and loads its venue. */
  open(venueId: string): Promise<OpenVenueResult>;
}

export const startPacks = async (deps: PackRuntimeDeps): Promise<PackRuntime> => {
  const install = await installBundledPacks({ ...deps, sha256Text: textSha256 });
  const manager = createPackManager({
    store: createFileSystemPackStore({ fs: deps.fs }),
    sdkVersion: deps.sdkVersion,
    platformCapabilities: deps.platformCapabilities,
    bundled: install.bundled,
    ports: { manifestSha256: textSha256 },
  });
  const recovery = await manager.recover();

  const open = async (venueId: string): Promise<OpenVenueResult> => {
    const pin: PackPin | null = await manager.pin(venueId);
    if (!pin) return { ok: false, error: { code: 'no-pack', message: `no verified pack for '${venueId}'` } };
    const fail = (error: PackError): OpenVenueResult => { pin.release(); return { ok: false, error }; };
    const dir = pin.ref.area === 'bundled' ? `bundled/${pin.ref.id}` : `packs/installed/${pin.ref.id}`;
    const resource = (kind: PackManifest['resources'][number]['kind']) => pin.manifest.resources.find((r) => r.kind === kind)!;
    // The pack was verified when it was resolved; the bytes about to be parsed are checked against the manifest again.
    const read = async (kind: 'routing-graph' | 'place-directory' | 'localization'): Promise<string | PackError> => {
      const r = resource(kind);
      const text = await deps.fs.readText(`${dir}/${r.path}`).catch(() => null);
      if (text === null) return { code: 'resource-missing', message: 'file is missing', path: r.path };
      return (await textSha256(text)) === r.sha256 ? text : { code: 'resource-hash-mismatch', message: 'SHA-256 mismatch', path: r.path };
    };
    const [graph, places, localization] = [await read('routing-graph'), await read('place-directory'), await read('localization')];
    for (const part of [graph, places, localization]) if (typeof part !== 'string') return fail(part);
    const parsed = parsePackVenueData(graph as string, places as string, venueId);
    if (!parsed.ok) return fail(parsed.error);
    const names = new Map<string, string>();
    try {
      for (const entry of JSON.parse(localization as string).entries as Array<{ id: string; names: { en?: string } }>) if (typeof entry.names?.en === 'string') names.set(entry.id, entry.names.en);
    } catch {
      return fail({ code: 'resource-invalid', message: 'localization is not valid JSON', path: resource('localization').path });
    }
    return {
      ok: true,
      venue: { source: parsed.source, manifest: pin.manifest, origin: pin.ref.area === 'bundled' ? 'bundled' : 'installed', archivePath: `${dir}/${resource('map-archive').path}`, names, release: () => pin.release() },
    };
  };

  return { manager, install, recovery, venueIds: () => manager.venueIds(), open };
};
