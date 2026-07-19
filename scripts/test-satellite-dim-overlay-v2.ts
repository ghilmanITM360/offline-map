import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Phase 11 (task #38): "no overlay-contrast system exists today" (docs/MAP_EXPERIENCE_AUDIT.md
// §6/§7) — block/gate/rasta/route overlays used the same fixed colors regardless of basemap,
// tuned for the flat standard map, with no adjustment for satellite imagery's higher visual
// noise. Rather than re-tuning every layer's per-state color for a second basemap (unverifiable
// without a device), a single semi-transparent dark scrim renders over satellite tiles only,
// so every existing overlay gets more legible "for free" without touching its own colors.

const overlaySource = readFileSync('src/views/components/map/SatelliteDimOverlay.tsx', 'utf8');
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(overlaySource.includes('export function SatelliteDimOverlay'), 'SatelliteDimOverlay component must exist and be exported');
assert(overlaySource.includes('zIndex={-1}'), 'Dim scrim must sit below the boundary/blocks/gates/rastas (zIndex 0+), just above the base tiles');
assert(overlaySource.includes('tappable={false}'), 'Dim scrim must not intercept taps meant for the map/overlays beneath it');

assert(home.includes('<SatelliteDimOverlay'), 'HomeScreen must render the satellite dim scrim');
assert(
  home.includes("mapType === 'satellite' && hasGoogleMapsKey && !isOffline"),
  'Dim scrim must only show when satellite tiles are actually the rendered basemap — not when offline forces a graph-only/none basemap while satellite is merely the selected preference',
);
assert(home.includes('SATELLITE_DIM_BOUNDARY'), 'Dim scrim bounds must be defined');
assert(home.includes('IJTEMA_MAP_BOUNDS.minLat - SATELLITE_DIM_LAT_PAD'), 'Dim scrim must be padded beyond the venue bounds to also cover gate approach streets');

console.log('Satellite dim overlay v2 checks passed.');
