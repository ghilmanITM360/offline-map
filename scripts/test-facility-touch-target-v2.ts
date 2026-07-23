import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Production stabilization pass — P0 touch-target fix. FacilityLayer's Marker had no hit-area
// wrapper at all (unlike GateLayer's suppressed-gate case, which at least had an
// under-sized 32x32 one) — its visible icon (markerSizes.facility, well under 44dp) was
// also its entire native tap target. react-native-maps' Marker has no hitSlop, so the fix
// widens the Marker's own child View, anchor-centered so the visible icon doesn't move —
// same pattern as GateLayer's v2GateMarkerHitArea (see test-gate-touch-target-v2.ts).

const facilityLayer = readFileSync('src/views/components/map/FacilityLayer.tsx', 'utf8');
const mapLayerStyles = readFileSync('src/views/components/map/mapLayerStyles.ts', 'utf8');

assert(
  mapLayerStyles.includes('facilityMarkerHitArea:'),
  'mapLayerStyles must define a facilityMarkerHitArea style — the widened invisible touch target for facility markers.',
);
assert(
  /facilityMarkerHitArea:\s*\{\s*\n\s*width: 44,\s*\n\s*height: 44,/.test(mapLayerStyles),
  'facilityMarkerHitArea must meet the 44dp platform-standard minimum touch target.',
);
assert(
  /<View style=\{styles\.facilityMarkerHitArea\}>\s*\n\s*<View style=\{\[styles\.facilityMarker, isSelected && styles\.facilityMarkerSelected\]\}>/.test(facilityLayer),
  'FacilityLayer must wrap its visible icon container in the wider hit-area View, keeping the visible marker itself unchanged.',
);

// Must not use the unsupported hitSlop prop on Marker (react-native-maps does not support it).
assert(
  !/<Marker[^>]*hitSlop/.test(facilityLayer),
  'FacilityLayer must not rely on Marker hitSlop — react-native-maps does not support it; the fix must be a real wider element.',
);

// Must not regress the Android marker-snapshot Text-clipping fix (no Text as a Marker child).
assert(
  !/<Marker[\s\S]*?<Text[\s\S]*?<\/Marker>/.test(facilityLayer),
  'FacilityLayer must not render a Text label inside a Marker (Android marker-snapshot clipping bug).',
);

console.log('Facility touch-target v2 checks passed.');
