import type { BundledPackSource } from './bundledPacks';

// EXTERNAL-SHAREABLE profile: only the synthetic demo venue. No Karachi survey data, graph, blocks or gates are in this bundle (the basemap
// is OpenStreetMap data, ODbL, with attribution). scripts/sdk-package/consumer.mjs --profile external installs this file as bundledPackTable.ts.
// The pack is built by the SDK repository's pack compiler; the digest below is the pin that authenticates its manifest (no signing key exists yet).
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
