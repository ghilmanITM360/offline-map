/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Verifies the Marker-snapshot label rendering removal (docs/ARCHITECTURE.md
// Phase 5) stuck: no layer component renders label text inside a Marker anymore, and
// HomeScreen renders exactly one shared MapLabelOverlay instead.

const overlay = readFileSync('src/views/components/map/MapLabelOverlay.tsx', 'utf8');
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

const overlaySpec = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');

// --- no map layer renders label text: labels are only the shared overlay -----

assert(
  !overlaySpec.includes('text-field'),
  'overlaySpec must not render label text in map layers — label text lives in MapLabelOverlay.',
);

// --- MapLabelOverlay is plain Views, not a map-SDK marker --------------------

assert(
  !/react-native-maps/.test(overlay),
  'MapLabelOverlay.tsx must not depend on a map-SDK Marker — it renders plain Views positioned via pointForCoordinate.',
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
