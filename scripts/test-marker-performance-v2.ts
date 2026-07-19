import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
// The block/gate/rasta/special-route Marker/Polygon/Polyline JSX moved out of HomeScreen.tsx
// into shared layer components (src/views/components/map/*) — see docs/MAP_EXPERIENCE_AUDIT.md.
const gateLayer = readFileSync('src/views/components/map/GateLayer.tsx', 'utf8');
const rastaLayer = readFileSync('src/views/components/map/RastaLayer.tsx', 'utf8');
const blockLayer = readFileSync('src/views/components/map/BlockLayer.tsx', 'utf8');
const specialRouteLayer = readFileSync('src/views/components/map/SpecialRouteLayer.tsx', 'utf8');
const navMapLayers = readFileSync('src/views/components/navigation/NavigationMapLayersV2.tsx', 'utf8');

// --- mapLabelsTransitioning bounded-transition-window state ---------------
// Phase 5 (map label system): this flag was gate-only (gateMarkersTransitioning)
// and keyed only on filter + selection, so block/rasta/special-route labels never
// got a tracksViewChanges=true window at all — a label mounting or resizing with
// tracksViewChanges already false can freeze blank/clipped on Android. Renamed and
// broadened to mapLabelsTransitioning, shared by all four label layers, and keyed
// additionally on zoom-LOD tier (not just filter/selection) since that's when
// block/rasta labels actually mount/unmount.

assert(
  /const \[mapLabelsTransitioning, setMapLabelsTransitioning\] = useState\(false\)/.test(home),
  'Home must track map label transitions with a bounded-window state flag.',
);

assert(
  home.includes("const mapLabelVisualSignature = `${v2MapLayers.activeMapFilter}|${selectedPlace?.id ?? ''}|${zoomLodTier}`;"),
  'Home must derive the map label visual signature from active filter + selected place id + zoom-LOD tier.',
);

assert(
  /setMapLabelsTransitioning\(true\)[\s\S]{0,120}setTimeout\(\(\) => setMapLabelsTransitioning\(false\), 400\)/.test(home),
  'Map label transition window must flip on for exactly 400ms after the visual signature changes.',
);

assert(
  home.includes('transitioning={mapLabelsTransitioning}'),
  'Home must pass the bounded transition-window state into GateLayer.',
);

// --- user-location marker: tracksViewChanges must be permanently false ----

const userLocationMarkerMatch = home.match(/<Marker coordinate=\{currentLocation\}[\s\S]*?<\/Marker>/);
assert(userLocationMarkerMatch, 'Home must render a user-location Marker bound to currentLocation.');
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
  gateLayer.includes('tracksViewChanges={transitioning}'),
  'Home-variant gate markers must key tracksViewChanges off the bounded transition-window state passed in as a prop.',
);

// --- block/rasta/special-route labels: same bounded transition-window, not a
// permanent false --- Phase 5: these used to hardcode tracksViewChanges={false}
// with no refresh path at all, which is what let them mount and never render
// (see GateLayer.tsx's "KNOWN ISSUE" comment for the parallel gate-side bug).
// Label marker `key`s now also encode focused/isSelected (see BlockLayer.tsx
// comment) so react-native-maps remounts them fresh when their rendered size
// changes — hence the open-ended key=\{`...\$\{block.id\}...`\} match instead of
// an exact-close.
const transitionTrackedLabelPatterns: Array<{ name: string; source: string; pattern: RegExp }> = [
  { name: 'rasta label marker', source: rastaLayer, pattern: /<Marker[\s\S]*?key=\{`\$\{keyPrefix\}_label_\$\{rasta\.id\}[\s\S]*?`\}[\s\S]*?<\/Marker>/ },
  { name: 'block label marker', source: blockLayer, pattern: /<Marker[\s\S]*?key=\{`\$\{keyPrefix\}_label_\$\{block\.id\}[\s\S]*?`\}[\s\S]*?<\/Marker>/ },
  { name: 'special route label marker', source: specialRouteLayer, pattern: /<Marker[\s\S]*?key=\{`\$\{keyPrefix\}_label_\$\{route\.id\}[\s\S]*?`\}[\s\S]*?<\/Marker>/ },
];

for (const { name, source, pattern } of transitionTrackedLabelPatterns) {
  const match = source.match(pattern);
  assert(match, `Must render the ${name}.`);
  assert(
    match![0].includes('tracksViewChanges={transitioning}'),
    `${name} must key tracksViewChanges off the bounded transition-window state passed in as a prop, not a permanent false.`,
  );
}

// --- representative sample of other static markers fixed to false ---------

const staticMarkerPatterns: Array<{ name: string; source: string; pattern: RegExp }> = [
  { name: 'selected place marker', source: home, pattern: /<Marker coordinate=\{selectedPlaceMarkerCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'preview start marker', source: home, pattern: /<Marker coordinate=\{previewStartCoordinate\}[\s\S]*?<\/Marker>/ },
  // Final pass (task #39): these three live-navigation markers (route start pin, destination
  // pin, snapped-user-location pulse) were missing tracksViewChanges entirely, defaulting to
  // react-native-maps' tracksViewChanges=true — continuous re-snapshotting for the whole
  // duration of every nav session. Fixed to false, matching HomeScreen's identical browse-mode
  // pulse marker (same Animated.View pulse technique, already tracksViewChanges={false} there).
  { name: 'nav route start marker', source: navMapLayers, pattern: /<Marker coordinate=\{startCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'nav route destination marker', source: navMapLayers, pattern: /<Marker coordinate=\{destinationCoordinate\}[\s\S]*?<\/Marker>/ },
  { name: 'nav snapped-user-location marker', source: navMapLayers, pattern: /<Marker coordinate=\{snappedLocation\}[\s\S]*?<\/Marker>/ },
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
