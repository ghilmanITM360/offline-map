import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { translate } from '../src/i18n/translate';
import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';

// The banner names the route-consistent recommended gate, but only as a provisional
// suggestion until route preview determines the final gate.

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

// Phase 4 (unify Gate 08/14/15/16 routing): the banner used to call the plain
// distance-only nearest-gate lookup directly, which could disagree with the
// gate Directions would actually route through once a destination is known.
// It now goes through RoutingServiceV2.recommendOutsideEntryGate, which reuses
// the same destination-aware selection as real route computation (falling back
// to nearest-gate only when no destination is selected yet).
assert(
  home.includes('recommendPreviewEntryGate(currentLocation, selectedPlace)') && readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8').includes('return RoutingServiceV2.recommendOutsideEntryGate'),
  'Home must compute the outside-venue banner gate through the shared, route-consistent gate selector',
);
assert(
  home.includes("t('journeyHome.suggested')") && home.includes('nearestEntryGate.name.en'),
  'Outside-venue banner must name the actual suggested gate in its own text surface',
);
assert(
  home.includes("t('journeyHome.noGate')"),
  'Outside-venue banner must have a sane fallback when no routable gate is found',
);
assert(
  home.includes("t('journeyHome.outsideAnnouncement',") &&
    translate('en', 'journeyHome.outsideAnnouncement', { gate: 'Gate 12' }).includes('Final entry gate is confirmed when route preview is calculated.'),
  'Outside-venue banner must describe its gate recommendation as provisional',
);
assert(
  !/outsideVenueGateText[^>]*numberOfLines=\{1\}/.test(home) && !/outsideVenueGateText[^>]*ellipsizeMode="tail"/.test(home),
  'Outside-venue gate identity must not use single-line tail truncation',
);
assert(home.includes('accessibilityRole="button"'), 'Outside-venue close action must expose button role');
assert(home.includes("t('journeyHome.dismissOutside')"), 'Outside-venue close action must expose meaningful accessibility label');

// Compact "floating notification" sizing: smaller than the old 48px two-line card, pill-shaped.
// Scoped to the banner's own style block — other UI (e.g. accessible touch targets
// elsewhere on Home) legitimately uses minHeight: 48 and isn't what this guards against.
const outsideVenueBannerStyleMatch = home.match(/outsideVenueBanner:\s*{[^}]*}/);
assert(!!outsideVenueBannerStyleMatch, 'Home screen must define an outsideVenueBanner style block');
const outsideVenueBannerStyle = outsideVenueBannerStyleMatch![0];
assert(outsideVenueBannerStyle.includes('minHeight: 40'), 'Outside-venue banner must use compact pill sizing, not the old large card height');
assert(!outsideVenueBannerStyle.includes('minHeight: 48'), 'Old two-line banner height (48) must be gone');
// 3ee3175: the 76 px reserve moved from the style block to physicalMarginRight(76) at the call site, so it stays on the physical right under RTL.
assert(home.includes('physicalMarginRight(76)'), 'Outside-venue banner must reserve right-side map controls');

// Sanity: the underlying gate lookup used by the banner is a real, cheap distance-only lookup
// (not full route computation) and only returns gates that are actually routable/connected.
const gate = EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser({ latitude: 26.9695, longitude: 66.9968 });
assert(gate, 'A nearby outside coordinate must resolve to a real nearest gate');
assert(typeof gate!.name.en === 'string' && gate!.name.en.length > 0, 'Resolved gate must carry a real display name');

console.log('Outside banner gate v2 checks passed.');
