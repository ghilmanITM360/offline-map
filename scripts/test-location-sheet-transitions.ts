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
assert(
  source.includes("<FadeContent transitionKey={showStartOptions || showManualStartSearch ? 'options' : 'summary'}>"),
  'The start-source section (summary <-> options/search) must be wrapped in FadeContent',
);
assert(
  source.includes('<FadeContent transitionKey={loadState}>'),
  'The route status section (loading/error/ready/hint) must be wrapped in FadeContent keyed on loadState',
);
assert(
  source.includes("<FadeContent transitionKey={showDestinationOptions ? 'destOptions' : 'destSummary'}>"),
  'The "Going to" destination section (summary <-> inline destination search) must be wrapped in FadeContent, matching the start-source section',
);

console.log('LocationSheet transition checks passed.');
