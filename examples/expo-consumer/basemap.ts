// Identity of the bundled Karachi archive. `scripts/sdk-package/consumer.mjs` checks it against BASEMAP_PROVENANCE.json; the pack manager
// verifies the archive itself (size and SHA-256) before the map may use it.
export const BASEMAP = {
  sha256: 'd5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0',
  bytes: 434589,
  zoom: { min: 12, max: 16 },
} as const;
