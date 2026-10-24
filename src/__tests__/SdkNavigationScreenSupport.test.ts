import type { LiveStartBlocker, NavigationError } from '@muslim-ummah/offline-navigation';
import {
  createDefaultNavigationTheme,
  ENGLISH_NAVIGATION_SCREEN_COPY as copy,
  filterPlaceItems,
  normalizeSearchText,
  type PlaceDirectoryItem,
} from '@muslim-ummah/offline-navigation/ui';

const items: PlaceDirectoryItem[] = [
  { id: 'a', title: 'Main Lobby', subtitle: 'Ground floor' },
  { id: 'b', title: 'Annex Wing', searchTerms: ['east building', 'ملحق'] },
  { id: 'c', title: 'Grand Hall', subtitle: 'Level 2' },
];
const ids = (list: PlaceDirectoryItem[]) => list.map((i) => i.id);

describe('filterPlaceItems', () => {
  it('an empty or blank query lists everything, as a fresh array', () => {
    expect(ids(filterPlaceItems(items, ''))).toEqual(['a', 'b', 'c']);
    expect(ids(filterPlaceItems(items, '   '))).toEqual(['a', 'b', 'c']);
    expect(filterPlaceItems(items, '')).not.toBe(items);
  });

  it('ignores case and surrounding space, and matches inside words', () => {
    expect(ids(filterPlaceItems(items, '  LOBBY '))).toEqual(['a']);
    expect(ids(filterPlaceItems(items, 'ann'))).toEqual(['b']);
  });

  it('every typed word must match somewhere, in any order', () => {
    expect(ids(filterPlaceItems(items, 'hall grand'))).toEqual(['c']);
    expect(ids(filterPlaceItems(items, 'hall lobby'))).toEqual([]);
  });

  it('searches the subtitle and the host-supplied search terms, in any script', () => {
    expect(ids(filterPlaceItems(items, 'level 2'))).toEqual(['c']);
    expect(ids(filterPlaceItems(items, 'east'))).toEqual(['b']);
    expect(ids(filterPlaceItems(items, 'ملحق'))).toEqual(['b']);
  });

  it('matches full-width and decomposed forms the way the user sees them', () => {
    expect(normalizeSearchText('ＬＯＢＢＹ')).toBe('lobby');
    expect(normalizeSearchText('Café')).toBe(normalizeSearchText('Café'));
    expect(ids(filterPlaceItems([{ id: 'x', title: 'Café' }], 'café'))).toEqual(['x']);
  });

  it('does not change the places it is given', () => {
    const copyOfItems = JSON.parse(JSON.stringify(items));
    filterPlaceItems(items, 'lobby');
    expect(items).toEqual(copyOfItems);
  });
});

describe('createDefaultNavigationTheme', () => {
  it('is stable across calls for the same direction and scheme, so leaves keep their identity', () => {
    expect(createDefaultNavigationTheme({ isRTL: false })).toBe(createDefaultNavigationTheme({ isRTL: false }));
    expect(createDefaultNavigationTheme({ isRTL: true })).not.toBe(createDefaultNavigationTheme({ isRTL: false }));
    expect(createDefaultNavigationTheme({ isRTL: false, colorScheme: 'dark' })).not.toBe(createDefaultNavigationTheme({ isRTL: false }));
  });

  it('chooses the chevrons for the reading direction', () => {
    const ltr = createDefaultNavigationTheme({ isRTL: false });
    const rtl = createDefaultNavigationTheme({ isRTL: true });
    expect(rtl.icons.Back).toBe(ltr.icons.Forward);
    expect(rtl.icons.Forward).toBe(ltr.icons.Back);
    expect(ltr.icons.Back).not.toBe(ltr.icons.Forward);
  });

  it('merges host colour overrides over the palette without touching the shared themes', () => {
    const custom = createDefaultNavigationTheme({ isRTL: false, colors: { brand: '#112233' } });
    expect(custom.colors.brand).toBe('#112233');
    expect(custom.colors.surface).toBe(createDefaultNavigationTheme({ isRTL: false }).colors.surface);
    expect(createDefaultNavigationTheme({ isRTL: false }).colors.brand).not.toBe('#112233');
  });

  // WCAG 2.x contrast ratio.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(['light', 'dark'] as const)('the %s palette clears WCAG AA on every pair the screen draws', (scheme) => {
    const c = createDefaultNavigationTheme({ isRTL: false, colorScheme: scheme }).colors;
    const pairs: Array<[string, string, string]> = [
      ['text on surface', c.text, c.surface],
      ['text on screen', c.text, c.screen],
      ['text on surfaceMuted', c.text, c.surfaceMuted],
      ['text on brandTint', c.text, c.brandTint],
      ['secondary on surface', c.textSecondary, c.surface],
      ['secondary on surfaceMuted', c.textSecondary, c.surfaceMuted],
      ['secondary on pressed', c.textSecondary, c.pressed],
      ['brand on surface', c.brand, c.surface],
      ['brand on surfaceMuted', c.brand, c.surfaceMuted],
      ['brand on brandTint', c.brand, c.brandTint],
      ['onBrand on brand', c.onBrand, c.brand],
      ['warning', c.warningText, c.warningFill],
      ['info', c.infoText, c.infoFill],
    ];
    for (const [name, fg, bg] of pairs) expect({ name, ok: ratio(fg, bg) >= 4.5 }).toEqual({ name, ok: true });
  });
});

describe('ENGLISH_NAVIGATION_SCREEN_COPY', () => {
  it('words every reason live navigation can be refused, and every route failure', () => {
    const blockers: LiveStartBlocker[] = [
      'permission_needed', 'permission_blocked', 'approximate_only', 'precision_unknown', 'services_off', 'no_fix', 'stale_fix',
      'weak_fix', 'unsupported', 'route_pending', 'outside_venue', 'already_at_destination', 'no_route',
    ];
    expect(Object.keys(copy.liveBlockers).sort()).toEqual([...blockers].sort());
    for (const b of blockers) expect(copy.liveBlockers[b].trim()).not.toBe('');
    const errors: NavigationError[] = ['unknown_place', 'no_route', 'route_failed'];
    expect(Object.keys(copy.trip.errors).sort()).toEqual([...errors].sort());
  });

  it('never promises what the controller does not do', () => {
    // Live copy must not claim a guide switch or automatic retry; the controller offers neither.
    const all = JSON.stringify(copy, (_k, v) => (typeof v === 'function' ? v('x', 1, 'y') : v));
    expect(all).not.toMatch(/automatically|retry(ing)? (automatically|again soon)|switch(ing)? back/i);
  });
});
