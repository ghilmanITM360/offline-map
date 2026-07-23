import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Regression: Gate markers lose their touch target in dense clusters — see docs/fix.md
// Fix 2. Suppressed + unselected gates (labelSuppressed && !isSelected) get no
// MapLabelOverlay Pressable at all (see HomeScreen's mapLabelItems: `if (gate.labelSuppressed
// && !gate.isSelected) continue;`), leaving only GateLayer's native Marker — a ~10px dot
// (markerSizes.gate) — as the tap target. react-native-maps' Marker has no hitSlop, so the
// fix widens the Marker's own child View for that case, mirroring the "invisible wide hit
// area" idea RastaLayer/SpecialRouteLayer already use (a transparent Polyline hit corridor
// layered on top of the thin visible line, unconditional on label suppression).
const gateLayer = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const mapLayerStyles = readFileSync('src/views/components/map/mapLayerStyles.ts', 'utf8');
const rastaLayer = readFileSync('src/views/components/map/RastaLayer.tsx', 'utf8');

// --- Reference pattern still intact (Rasta's hit corridor survives suppression) ---
assert(
  /tappable\s*\n\s*onPress=\{\(e\) => onPressRasta\(rasta\.id, e\.nativeEvent\.coordinate\)\}/.test(rastaLayer),
  'Reference pattern missing: RastaLayer must still render its unconditional invisible wide hit-corridor Polyline.',
);

// --- Gate fix: widened Marker child for the suppressed + unselected case ---
assert(
  mapLayerStyles.includes('v2GateMarkerHitArea:'),
  'mapLayerStyles must define a v2GateMarkerHitArea style — the widened invisible touch target for suppressed gate markers.',
);
assert(
  /v2GateMarkerHitArea:\s*\{\s*\n\s*width: 44,\s*\n\s*height: 44,/.test(mapLayerStyles),
  'v2GateMarkerHitArea must meet the 44dp platform-standard minimum touch target — 32px was still short of it.',
);

assert(
  gateLayer.includes('const needsWiderHitArea = gate.labelSuppressed && !gate.isSelected;'),
  'GateLayer must widen the touch target specifically for the suppressed + unselected case — the case that loses its MapLabelOverlay Pressable entirely.',
);
assert(
  gateLayer.includes('{needsWiderHitArea ? <View style={styles.v2GateMarkerHitArea}>{dot}</View> : dot}'),
  'GateLayer must wrap the gate dot in the wider hit-area View when suppressed and unselected, keeping the visible dot itself unchanged.',
);

// --- Must not regress the existing "no Text-in-Marker" clipping fix ---
assert(
  !/<Marker[\s\S]*?<Text[\s\S]*?<\/Marker>/.test(gateLayer),
  'GateLayer must still not render a Text label inside a Marker (Android marker-snapshot clipping bug) — the hit-area fix must not reintroduce this.',
);

// --- Must not use the unsupported hitSlop prop on Marker (react-native-maps does not
// support it — confirmed in the prior audit; a real wider element is required instead) ---
assert(
  !/<Marker[^>]*hitSlop/.test(gateLayer),
  'GateLayer must not rely on Marker hitSlop — react-native-maps does not support it; the fix must be a real wider element.',
);

console.log('Gate touch-target v2 checks passed.');
