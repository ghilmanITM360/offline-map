import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';

// Phase 8 (task #35): the outside-venue banner used to show a generic two-line message
// ("Outside Ijtema area" / "Offline routing will enter through nearest connected official
// gate.") without naming an actual gate. It now names the real nearest routable gate and
// is a single-line, more compact floating notification (pill shape, smaller minHeight).

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

// Phase 4 (unify Gate 08/14/15/16 routing): the banner used to call the plain
// distance-only nearest-gate lookup directly, which could disagree with the
// gate Directions would actually route through once a destination is known.
// It now goes through RoutingServiceV2.recommendOutsideEntryGate, which reuses
// the same destination-aware selection as real route computation (falling back
// to nearest-gate only when no destination is selected yet).
assert(
  home.includes('RoutingServiceV2.recommendOutsideEntryGate'),
  'Home must compute the outside-venue banner gate through the shared, route-consistent gate selector',
);
assert(
  home.includes('Enter through ${nearestEntryGate.name.en}'),
  'Outside-venue banner must name the actual nearest gate, not a generic message',
);
assert(
  home.includes("'Outside Ijtema · Nearest gate unavailable'"),
  'Outside-venue banner must have a sane fallback when no routable gate is found',
);
assert(!home.includes('outsideVenueSubtext'), 'Outside-venue banner must be a single-line notification, not a two-line card');
assert(home.includes('numberOfLines={1}') , 'Outside-venue banner text must be constrained to one line');

// Compact "floating notification" sizing: smaller than the old 48px two-line card, pill-shaped.
// Scoped to the banner's own style block — other UI (e.g. accessible touch targets
// elsewhere on Home) legitimately uses minHeight: 48 and isn't what this guards against.
const outsideVenueBannerStyleMatch = home.match(/outsideVenueBanner:\s*{[^}]*}/);
assert(!!outsideVenueBannerStyleMatch, 'Home screen must define an outsideVenueBanner style block');
const outsideVenueBannerStyle = outsideVenueBannerStyleMatch![0];
assert(outsideVenueBannerStyle.includes('minHeight: 40'), 'Outside-venue banner must use compact pill sizing, not the old large card height');
assert(!outsideVenueBannerStyle.includes('minHeight: 48'), 'Old two-line banner height (48) must be gone');

// Sanity: the underlying gate lookup used by the banner is a real, cheap distance-only lookup
// (not full route computation) and only returns gates that are actually routable/connected.
const gate = EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser({ latitude: 26.9695, longitude: 66.9968 });
assert(gate, 'A nearby outside coordinate must resolve to a real nearest gate');
assert(typeof gate!.name.en === 'string' && gate!.name.en.length > 0, 'Resolved gate must carry a real display name');

console.log('Outside banner gate v2 checks passed.');
