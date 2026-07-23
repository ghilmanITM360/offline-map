import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

// Phase 9 (task #36): the task asked for selected-block rendering to have a blue border,
// light fill, and an EN/UR label bubble — all three already existed (border+fill from the
// task #26 extraction, the bubble's Urdu secondary line from task #31). The one real gap:
// the label bubble's Urdu text only switched to white when the "blocks" filter chip was
// focused (`v2BlockLabelUrduFocused`), not when the block itself was individually selected —
// so a selected block's blue bubble (`v2SelectedBlockLabel`, background #1A73E8) rendered its
// Urdu line in dark green (#2E7D32), which is very low contrast against blue.

const blockLayer = readFileSync('src/views/components/map/BlockLayer.tsx', 'utf8');
const mapLayerStyles = readFileSync('src/views/components/map/mapLayerStyles.ts', 'utf8');
// Block label rendering (including the Urdu secondary line's selected-state color) moved
// out of BlockLayer.tsx into MapLabelOverlay.tsx's getLabelStyles, fed by HomeScreen's
// mapLabelItems — see docs/TARGETED_FIX_SPRINT_REPORT.md Phase 5.
const mapLabelOverlay = readFileSync('src/views/components/map/MapLabelOverlay.tsx', 'utf8');
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(
  mapLabelOverlay.includes('styles.v2BlockLabelUrdu, focused && styles.v2BlockLabelUrduFocused, isSelected && styles.v2SelectedBlockLabelText'),
  'Selected block Urdu label text must switch to the selected (white) text color, not stay dark green on the blue selected bubble',
);
assert(mapLayerStyles.includes('v2SelectedBlockLabelText'), 'v2SelectedBlockLabelText style must exist');

// Border+fill+bubble were already in place before this phase — assert they still are.
assert(blockLayer.includes("fillColor={block.isSelected ? 'rgba(26,115,232,0.42)'"), 'Selected block must keep its light blue fill');
assert(
  blockLayer.includes('strokeColor={block.isSelected ? staticColors.selectedBlock') &&
    staticColors.selectedBlock === '#1A73E8',
  'Selected block must keep its blue border',
);
assert(home.includes('MapLocalizationService.getSecondaryLabel(block.name)'), 'Selected block label bubble must keep showing the Urdu secondary line');

console.log('Selected block contrast v2 checks passed.');
