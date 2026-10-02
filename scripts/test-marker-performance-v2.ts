import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
// The block/gate/rasta/special-route Marker/Polygon/Polyline JSX moved out of HomeScreen.tsx
// into shared layer components (src/views/components/map/*) — see docs/ARCHITECTURE.md.
// Label text itself no longer renders as a Marker at all (see MapLabelOverlay.tsx and
// scripts/test-map-label-overlay-v2.ts) — only small fixed-size dot markers remain here.
const gateLayer = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const navMapLayers = readFileSync('src/views/components/navigation/NavigationMapLayersV2.tsx', 'utf8');
// User-location marker moved into its own shared component (heading-cone support) — see
// src/views/components/map/UserLocationMarker.tsx.
const userLocationMarkerSource = readFileSync('src/views/components/map/UserLocationMarker.tsx', 'utf8');

// --- user-location marker: tracksViewChanges is bounded, never permanently true ----

assert(home.includes('<UserLocationMarker'), 'Home must render the shared UserLocationMarker component bound to currentLocation.');
const userLocationMarkerMatch = userLocationMarkerSource.match(/<SvgMarker[\s\S]*?coordinate=\{coordinate\}[\s\S]*?<\/SvgMarker>/);
assert(userLocationMarkerMatch, 'UserLocationMarker must render an SvgMarker bound to its coordinate prop.');
// SvgMarker (useMarkerPaintWindow) tracks view changes only while the SVG icon first paints (a permanently
// false marker captures a blank bitmap, #128 C), then freezes it, so there is still no per-frame re-snapshot.
const paintWindow = readFileSync('src/views/components/map/useMarkerPaintWindow.tsx', 'utf8');
assert(
  paintWindow.includes('tracking: false') && paintWindow.includes('MARKER_PAINT_MS'),
  'useMarkerPaintWindow must freeze the marker bitmap after a bounded window to avoid re-render thrash.',
);
assert(
  !userLocationMarkerMatch![0].includes('tracksViewChanges={true}'),
  'User-location marker must never be permanently tracksViewChanges={true}.',
);

// --- gate markers: must NOT be permanently tracksViewChanges=true ----------

assert(
  gateLayer.includes(`key={\`\${keyPrefix}_\${gate.id}\`}`),
  'GateLayer must render v2 gate markers.',
);
assert(
  !/tracksViewChanges=\{focused \|\| gate\.isSelected\}/.test(gateLayer),
  'Gate markers must no longer be permanently tracksViewChanges={focused || gate.isSelected} (that thrashed on every render).',
);
assert(
  !/tracksViewChanges=\{true\}/.test(gateLayer),
  'Gate markers must not hardcode tracksViewChanges to always-true.',
);
assert(
  gateLayer.includes('tracksViewChanges={false}'),
  'Gate dot markers have no dynamic-size label content anymore (see MapLabelOverlay.tsx), so tracksViewChanges must be permanently false.',
);

// --- representative sample of other static markers fixed to false ---------

const staticMarkerPatterns: Array<{ name: string; source: string; pattern: RegExp; svg?: boolean }> = [
  { name: 'selected place marker', source: home, pattern: /<SvgMarker[^>]*coordinate=\{selectedPlaceMarkerCoordinate\}[\s\S]*?<\/SvgMarker>/, svg: true },
  { name: 'preview start marker', source: home, pattern: /<SvgMarker[^>]*coordinate=\{previewStartCoordinate\}[\s\S]*?<\/SvgMarker>/, svg: true },
  // Final pass (task #39): these three live-navigation markers (route start pin, destination
  // pin, snapped-user-location pulse) were missing tracksViewChanges entirely, defaulting to
  // react-native-maps' tracksViewChanges=true — continuous re-snapshotting for the whole
  // duration of every nav session. Fixed to false, matching HomeScreen's identical browse-mode
  // pulse marker (same Animated.View pulse technique, already tracksViewChanges={false} there).
  { name: 'nav route start marker', source: navMapLayers, pattern: /<Marker[^>]*coordinate=\{startCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'nav route destination marker', source: navMapLayers, pattern: /<SvgMarker[^>]*coordinate=\{destinationCoordinate\}[\s\S]*?<\/SvgMarker>/, svg: true },
  { name: 'nav snapped-user-location marker', source: navMapLayers, pattern: /<SvgMarker[\s\S]*?coordinate=\{snappedLocation\}[\s\S]*?<\/SvgMarker>/, svg: true },
];

for (const { name, source, pattern, svg } of staticMarkerPatterns) {
  const match = source.match(pattern);
  assert(match, `Must render the ${name}.`);
  if (svg) {
    // SVG-icon markers go through SvgMarker: bounded tracking, then frozen (see useMarkerPaintWindow).
    assert(!match![0].includes('tracksViewChanges={true}'), `${name} must not be permanently tracksViewChanges={true}.`);
  } else {
    assert(
      match![0].includes('tracksViewChanges={false}'),
      `${name} must set tracksViewChanges={false} — it has no per-render visual state to re-rasterize.`,
    );
  }
}

console.log('Marker performance v2 checks passed.');
