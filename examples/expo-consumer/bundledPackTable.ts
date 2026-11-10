import type { BundledPackSource } from './bundledPacks';

// INTERNAL profile: the owner-controlled Karachi preset 1.1.0 and the synthetic demo venue 1.1.0. NOT cleared for external distribution.
// The external-shareable profile is bundledPackTable.external.ts (synthetic data only). Both packs are built by the SDK repository's pack
// compiler from tracked sources; the digest below
// is the pin that authenticates each manifest (no signing key exists yet). scripts/sdk-package/consumer.mjs rebuilds the packs and
// fails if a digest or file list here differs from what the compiler produced. Both packs ship the same Karachi archive asset.
const ARCHIVE = require('./assets/karachi-basemap.pmtiles');

export interface BundledPackAssets extends BundledPackSource {
  /** The manifest's packId. `id` is the directory name inside the app (no '@': it ends up in the map's archive URL). */
  packId: string;
  /** Pack-relative path to Metro asset module. */
  assets: Record<string, number>;
}

// Typed explicitly: without it TypeScript unions the entries' differently-shaped `assets` objects and rejects a pack whose file names differ.
const PACKS: Array<Omit<BundledPackAssets, 'files'>> = [
  {
    id: 'karachi-ijtema-1.1.0',
    packId: 'karachi-ijtema@1.1.0',
    manifestSha256: '4eea9a74d95f9cd431750e8fd4a81a5bf733ccc341e6764239830319cbbfcec1',
    assets: {
      'pack.manifest.json': require('./assets/packs/karachi-ijtema/pack.manifest.json.packfile'),
      'PROVENANCE.json': require('./assets/packs/karachi-ijtema/PROVENANCE.json.packfile'),
      'data/gate-metadata.json': require('./assets/packs/karachi-ijtema/data__gate-metadata.json.packfile'),
      'data/localization.json': require('./assets/packs/karachi-ijtema/data__localization.json.packfile'),
      'data/place-catalog.json': require('./assets/packs/karachi-ijtema/data__place-catalog.json.packfile'),
      'data/place-directory.json': require('./assets/packs/karachi-ijtema/data__place-directory.json.packfile'),
      'data/routing-graph.json': require('./assets/packs/karachi-ijtema/data__routing-graph.json.packfile'),
      'data/venue-geometry.json': require('./assets/packs/karachi-ijtema/data__venue-geometry.json.packfile'),
      'map/ijtema-basemap.pmtiles': ARCHIVE,
    },
  },
  {
    id: 'synthetic-demo-venue-1.1.0',
    packId: 'synthetic-demo-venue@1.1.0',
    manifestSha256: '7006cde90e71206c84a6c8434d2c59eefd60de084c4265f9a568e271b03bc69d',
    assets: {
      'pack.manifest.json': require('./assets/packs/synthetic-demo-venue/pack.manifest.json.packfile'),
      'PROVENANCE.json': require('./assets/packs/synthetic-demo-venue/PROVENANCE.json.packfile'),
      'data/gate-metadata.json': require('./assets/packs/synthetic-demo-venue/data__gate-metadata.json.packfile'),
      'data/localization.json': require('./assets/packs/synthetic-demo-venue/data__localization.json.packfile'),
      'data/place-catalog.json': require('./assets/packs/synthetic-demo-venue/data__place-catalog.json.packfile'),
      'data/place-directory.json': require('./assets/packs/synthetic-demo-venue/data__place-directory.json.packfile'),
      'data/routing-graph.json': require('./assets/packs/synthetic-demo-venue/data__routing-graph.json.packfile'),
      'data/venue-geometry.json': require('./assets/packs/synthetic-demo-venue/data__venue-geometry.json.packfile'),
      'map/ijtema-basemap.pmtiles': ARCHIVE,
    },
  },
];

export const BUNDLED_PACK_TABLE: BundledPackAssets[] = PACKS.map((pack) => ({ ...pack, files: Object.keys(pack.assets) }));
