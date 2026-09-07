import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Stage 5 TASK 3: LocationSheet's route-preview content (start summary <-> start
// options/search, loading/error/ready status) must cross-fade instead of snapping
// instantly, via plain RN Animated so it can't fight BottomSheetModal's own
// reanimated gesture/layout handling (no LayoutAnimation).
const source = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');

assert(
  source.includes("import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';"),
  'LocationSheet must import the shared transition timing constants',
);
assert(
  source.includes('function FadeContent({ transitionKey, children }'),
  'LocationSheet must define a FadeContent helper for cross-fading swapped content',
);
assert(
  source.includes('NAV_TRANSITION_TIMINGS.sheetContentFadeMs'),
  'FadeContent must use the shared sheet content fade duration',
);
assert(
  !source.includes('LayoutAnimation.'),
  'LocationSheet must not call LayoutAnimation — it can conflict with BottomSheetModal internals',
);
// Phase A/C/D later removed the start-source and destination options/search sections
// FadeContent used to wrap (both are now plain, non-swapping summary cards — see
// LocationSheet.test.tsx) — only the route status section (loading/error/ready/hint) still
// swaps content and needs the cross-fade.
assert(
  !source.includes('showStartOptions') && !source.includes('showManualStartSearch') && !source.includes('showDestinationOptions'),
  'LocationSheet must not reintroduce the removed start-source/destination options sections',
);
assert(
  source.includes('<FadeContent transitionKey={loadState}>'),
  'The route status section (loading/error/ready/hint) must be wrapped in FadeContent keyed on loadState',
);

console.log('LocationSheet transition checks passed.');
