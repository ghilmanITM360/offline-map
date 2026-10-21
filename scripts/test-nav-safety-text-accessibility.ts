import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Accessibility pass: safety-relevant navigation text (GPS warnings, reroute/arrival
// notifications, next-step preview) was undersized for the app's elderly user base —
// as small as 12-13px next to the 24px maneuver label. This pins the fix so a future
// edit can't silently shrink these back down.
//
// navOverlayStyles.ts uses RN's StyleSheet.create, which pulls in 'react-native' —
// that import chain breaks under esbuild/tsx (see test-selected-block-contrast-v2.ts
// for the same constraint), so this reads the file as text and extracts fontSize
// values per named style rule via regex, rather than importing the StyleSheet object.

const stylesPath = 'src/views/components/navigation/navOverlayStyles.ts';
const colorsPath = 'src/theme/colors.ts';
const chromeV1Path = 'src/views/components/navigation/NavigationChromeV1.tsx';
const chromeV2Path = 'src/views/components/navigation/NavigationChromeV2.tsx';

const stylesSource = readFileSync(stylesPath, 'utf8');
const colorsSource = readFileSync(colorsPath, 'utf8');
const chromeV1Source = readFileSync(chromeV1Path, 'utf8');
const chromeV2Source = readFileSync(chromeV2Path, 'utf8');
// B4c-2: the arrival sheet styles live in the SDK card.
const arrivalCardSource = readFileSync('packages/offline-navigation/src/ui/ArrivalCard.tsx', 'utf8');
// B4c-3: the reroute status banner lives in the SDK card.
const rerouteBannerSource = readFileSync('packages/offline-navigation/src/ui/RerouteBanner.tsx', 'utf8');

/** Extracts the body of `name: { ... }` (single-level brace matching) from a
 * StyleSheet.create source block, then pulls its `fontSize` value out. */
function fontSizeOf(source: string, ruleName: string): number {
  const startMatch = new RegExp(`\\b${ruleName}:\\s*\\{`).exec(source);
  assert(startMatch, `Style rule "${ruleName}" not found in ${stylesPath}`);
  const bodyStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = bodyStart;
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  const body = source.slice(bodyStart, i - 1);
  const sizeMatch = /fontSize:\s*(\d+(?:\.\d+)?)/.exec(body);
  assert(sizeMatch, `Style rule "${ruleName}" has no fontSize`);
  return Number(sizeMatch[1]);
}

function hexOf(source: string, tokenName: string): string {
  const match = new RegExp(`\\b${tokenName}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(source);
  assert(match, `Color token "${tokenName}" not found in ${colorsPath}`);
  return match[1];
}

// --- WCAG contrast helper (relative luminance / contrast ratio) ---
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(hexA: string, hexB: string): number {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;
const SAFETY_TEXT_FLOOR = 15; // matches the 15-17px target range for safety-critical secondary text
const MANEUVER_LABEL_SIZE = 24; // primary instruction — not in scope for this pass, must stay put

// --- Font sizes: GPS / reroute / next-step text must be at (or above) the new floor ---
assert(fontSizeOf(stylesSource, 'weakGpsText') >= SAFETY_TEXT_FLOOR, 'weakGpsText (GPS weak/lost banner, shared by NavigationChromeV1 and V2) must be >= 15px');
assert(fontSizeOf(rerouteBannerSource, 'text') >= SAFETY_TEXT_FLOOR, 'RerouteBanner text (reroute notification banner) must be >= 15px');
assert(fontSizeOf(stylesSource, 'nextStepText') >= SAFETY_TEXT_FLOOR, 'nextStepText (upcoming-turn preview) must be >= 15px');
assert(fontSizeOf(stylesSource, 'rerouteText') >= SAFETY_TEXT_FLOOR, '"Finding a new way…" reroute-card text must be >= 15px');

// Arrival messaging was already at/above the floor before this pass — pin it so it can't regress.
assert(fontSizeOf(arrivalCardSource, 'title') >= SAFETY_TEXT_FLOOR, 'arrivedTitle must stay >= 15px');
assert(fontSizeOf(arrivalCardSource, 'destination') >= SAFETY_TEXT_FLOOR, 'ArrivalCard destination (destination name on arrival) must stay >= 15px');

// The 24px maneuver label is the primary instruction and explicitly out of scope for
// this pass — assert it is untouched, not merely "still large enough".
assert.equal(fontSizeOf(stylesSource, 'maneuverLabel'), MANEUVER_LABEL_SIZE, 'maneuverLabel must remain exactly 24px — out of scope for this accessibility pass');

// Chrome/decorative text deliberately NOT bumped, to confirm this was a targeted fix
// rather than a blanket resize.
assert(fontSizeOf(stylesSource, 'rememberedLabelText') < SAFETY_TEXT_FLOOR, 'rememberedLabelText is decorative map-marker chrome, not safety text — should stay small');
assert(fontSizeOf(stylesSource, 'startMarkerLabelText') < SAFETY_TEXT_FLOOR, 'startMarkerLabelText is decorative map-marker chrome, not safety text — should stay small');

// --- Contrast: GPS/reroute banner text must clear WCAG AA (4.5:1) against its own background ---
const white = '#FFFFFF';
const weakGpsBackground = hexOf(colorsSource, 'weakGpsBackground');
const rerouteBackground = hexOf(colorsSource, 'rerouteBackground');

assert(
  contrastRatio(white, weakGpsBackground) >= WCAG_AA_NORMAL_TEXT,
  `weakGpsText (white) on weakGpsBackground (${weakGpsBackground}) must clear WCAG AA 4.5:1, got ${contrastRatio(white, weakGpsBackground).toFixed(2)}:1`,
);
assert(
  contrastRatio(white, rerouteBackground) >= WCAG_AA_NORMAL_TEXT,
  `rerouteText (white) on rerouteBackground (${rerouteBackground}) must clear WCAG AA 4.5:1, got ${contrastRatio(white, rerouteBackground).toFixed(2)}:1`,
);

// --- The GPS_LOST banner (added alongside weak-GPS handling) must still reuse the same
// styled banner rather than drifting onto a separate, unaudited style. ---
assert(
  /gpsSignalState === 'GPS_LOST'[\s\S]{0,200}styles\.weakGpsBanner[\s\S]{0,200}styles\.weakGpsText/.test(chromeV2Source),
  'NavigationChromeV2 GPS_LOST banner must reuse styles.weakGpsBanner/styles.weakGpsText (the audited, now-larger, now-contrast-fixed style) — not a separate one-off style',
);

// --- allowFontScaling must never be disabled on these components — OS text scaling has
// to stay on top of these fixed-size floors, not be capped underneath them. ---
assert(!/allowFontScaling\s*=\s*\{?\s*false/.test(chromeV1Source), 'NavigationChromeV1 must not disable allowFontScaling');
assert(!/allowFontScaling\s*=\s*\{?\s*false/.test(chromeV2Source), 'NavigationChromeV2 must not disable allowFontScaling');
assert(!/allowFontScaling\s*=\s*\{?\s*false/.test(stylesSource), 'navOverlayStyles.ts must not disable allowFontScaling');

console.log('Navigation safety-text accessibility checks passed.');
