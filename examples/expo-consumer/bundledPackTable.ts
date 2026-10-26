import type { BundledPackSource } from './bundledPacks';

// The packs that ship inside this app. Both are built by the SDK repository's pack compiler from tracked sources; the digest below
// is the pin that authenticates each manifest (no signing key exists yet). scripts/sdk-package/consumer.mjs rebuilds the packs and
// fails if a digest or file list here differs from what the compiler produced. Both packs ship the same Karachi archive asset.
const ARCHIVE = require('./assets/karachi-basemap.pmtiles');

export interface BundledPackAssets extends BundledPackSource {
  /** The manifest's packId. `id` is the directory name inside the app (no '@': it ends up in the map's archive URL). */
  packId: string;
  /** Pack-relative path to Metro asset module. */
  assets: Record<string, number>;
}

export const BUNDLED_PACK_TABLE: BundledPackAssets[] = [
  {
    id: 'karachi-ijtema-1.0.0',
    packId: 'karachi-ijtema@1.0.0',
    manifestSha256: 'e248c3730203c7535d82041f665ed41809edfe7998959bbe10f6ee9390a03ad1',
    assets: {
      'pack.manifest.json': require('./assets/packs/karachi-ijtema/pack.manifest.json.packfile'),
      'PROVENANCE.json': require('./assets/packs/karachi-ijtema/PROVENANCE.json.packfile'),
      'data/gate-metadata.json': require('./assets/packs/karachi-ijtema/data__gate-metadata.json.packfile'),
      'data/localization.json': require('./assets/packs/karachi-ijtema/data__localization.json.packfile'),
      'data/place-directory.json': require('./assets/packs/karachi-ijtema/data__place-directory.json.packfile'),
      'data/routing-graph.json': require('./assets/packs/karachi-ijtema/data__routing-graph.json.packfile'),
      'map/ijtema-basemap.pmtiles': ARCHIVE,
    },
  },
  {
    id: 'synthetic-demo-venue-1.0.0',
    packId: 'synthetic-demo-venue@1.0.0',
    manifestSha256: 'edd5367bf0bdf1ca4eebba68a69c6ff177eb7d8ccf865593560ae76bcb11f7b0',
    assets: {
      'pack.manifest.json': require('./assets/packs/synthetic-demo-venue/pack.manifest.json.packfile'),
      'PROVENANCE.json': require('./assets/packs/synthetic-demo-venue/PROVENANCE.json.packfile'),
      'data/gate-metadata.json': require('./assets/packs/synthetic-demo-venue/data__gate-metadata.json.packfile'),
      'data/localization.json': require('./assets/packs/synthetic-demo-venue/data__localization.json.packfile'),
      'data/place-directory.json': require('./assets/packs/synthetic-demo-venue/data__place-directory.json.packfile'),
      'data/routing-graph.json': require('./assets/packs/synthetic-demo-venue/data__routing-graph.json.packfile'),
      'map/ijtema-basemap.pmtiles': ARCHIVE,
    },
  },
].map((pack) => ({ ...pack, files: Object.keys(pack.assets) }));
