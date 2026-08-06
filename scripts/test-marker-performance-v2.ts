import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
// The block/gate/rasta/special-route Marker/Polygon/Polyline JSX moved out of HomeScreen.tsx
// into shared layer components (src/views/components/map/*) — see docs/MAP_EXPERIENCE_AUDIT.md.
// Label text itself no longer renders as a Marker at all (see MapLabelOverlay.tsx and
// scripts/test-map-label-overlay-v2.ts) — only small fixed-size dot markers remain here.
const gateLayer = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const navMapLayers = readFileSync('src/views/components/navigation/NavigationMapLayersV2.tsx', 'utf8');
// User-location marker moved into its own shared component (heading-cone support) — see
// src/views/components/map/UserLocationMarker.tsx.
const userLocationMarkerSource = readFileSync('src/views/components/map/UserLocationMarker.tsx', 'utf8');

// --- user-location marker: tracksViewChanges must be permanently false ----

assert(home.includes('<UserLocationMarker'), 'Home must render the shared UserLocationMarker component bound to currentLocation.');
const userLocationMarkerMatch = userLocationMarkerSource.match(/<Marker[\s\S]*?coordinate=\{coordinate\}[\s\S]*?<\/Marker>/);
assert(userLocationMarkerMatch, 'UserLocationMarker must render a Marker bound to its coordinate prop.');
const userLocationMarkerBlock = userLocationMarkerMatch![0];
assert(
  userLocationMarkerBlock.includes('tracksViewChanges={false}'),
  'User-location marker must set tracksViewChanges={false} to avoid re-render thrash.',
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

const staticMarkerPatterns: Array<{ name: string; source: string; pattern: RegExp }> = [
  { name: 'selected place marker', source: home, pattern: /<Marker[^>]*coordinate=\{selectedPlaceMarkerCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'preview start marker', source: home, pattern: /<Marker[^>]*coordinate=\{previewStartCoordinate\}[\s\S]*?<\/Marker>/ },
  // Final pass (task #39): these three live-navigation markers (route start pin, destination
  // pin, snapped-user-location pulse) were missing tracksViewChanges entirely, defaulting to
  // react-native-maps' tracksViewChanges=true — continuous re-snapshotting for the whole
  // duration of every nav session. Fixed to false, matching HomeScreen's identical browse-mode
  // pulse marker (same Animated.View pulse technique, already tracksViewChanges={false} there).
  { name: 'nav route start marker', source: navMapLayers, pattern: /<Marker[^>]*coordinate=\{startCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'nav route destination marker', source: navMapLayers, pattern: /<Marker[^>]*coordinate=\{destinationCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'nav snapped-user-location marker', source: navMapLayers, pattern: /<Marker[^>]*coordinate=\{snappedLocation\}[\s\S]*?<\/Marker>/ },
];

for (const { name, source, pattern } of staticMarkerPatterns) {
  const match = source.match(pattern);
  assert(match, `Must render the ${name}.`);
  assert(
    match![0].includes('tracksViewChanges={false}'),
    `${name} must set tracksViewChanges={false} — it has no per-render visual state to re-rasterize.`,
  );
}

console.log('Marker performance v2 checks passed.');
