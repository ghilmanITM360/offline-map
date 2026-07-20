/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Verifies the Marker-snapshot label rendering removal (docs/TARGETED_FIX_SPRINT_REPORT.md
// Phase 5) stuck: no layer component renders label text inside a Marker anymore, and
// HomeScreen renders exactly one shared MapLabelOverlay instead.

const overlay = readFileSync('src/views/components/map/MapLabelOverlay.tsx', 'utf8');
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

const layerFiles = [
  'src/views/components/map/GateLayer.tsx',
  'src/views/components/map/BlockLayer.tsx',
  'src/views/components/map/RastaLayer.tsx',
  'src/views/components/map/SpecialRouteLayer.tsx',
];

// --- no layer file renders a label (Marker wrapping a Text) anymore ---------

for (const file of layerFiles) {
  const source = readFileSync(file, 'utf8');
  const markerWithTextBlocks = source.match(/<Marker[\s\S]*?<\/Marker>/g) ?? [];
  for (const block of markerWithTextBlocks) {
    assert(
      !/<Text[\s>]/.test(block),
      `${file} must not render a <Text> label inside a <Marker> — label text moved to MapLabelOverlay.`,
    );
  }
}

// --- MapLabelOverlay never imports Marker from react-native-maps -----------

assert(
  !/import\s*\{[^}]*\bMarker\b[^}]*\}\s*from\s*['"]react-native-maps['"]/.test(overlay),
  'MapLabelOverlay.tsx must not import Marker — it renders plain Views positioned via pointForCoordinate, not Marker snapshots.',
);

// --- MapLabelOverlay projects via pointForCoordinate, not Marker anchoring --

assert(
  overlay.includes('pointForCoordinate'),
  'MapLabelOverlay.tsx must project coordinates via MapView.pointForCoordinate.',
);

// --- HomeScreen renders exactly one shared MapLabelOverlay ------------------

const overlayUsages = home.match(/<MapLabelOverlay\b/g) ?? [];
assert.equal(
  overlayUsages.length,
  1,
  `HomeScreen.tsx must render exactly one <MapLabelOverlay>, found ${overlayUsages.length}.`,
);

console.log('Map label overlay v2 checks passed.');
