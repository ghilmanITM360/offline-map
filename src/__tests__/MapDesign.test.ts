import { readFileSync } from 'fs';
import { join } from 'path';
import { staticColors } from '../theme';
import tokens from '../theme/mapMarkerTokens.json';
import { MARKER_IMAGES } from '../views/components/mapgl/markerImages.generated';
import { FACILITY_ICON_SIZE_BY_ZOOM, MAP_COLORS, MAP_LINE_WIDTH, MAP_VISUAL_PRIORITY, SPECIAL_ROUTE_DASH } from '../views/components/mapgl/mapDesign';
import { buildHomeVenueOverlay, buildMarkerOverlay, buildRouteOverlay, facilityIconKey, type OverlaySpec } from '../views/components/mapgl/overlaySpec';
import { LANDMARK_PLACES } from '../constants/data';

const c = (latitude: number, longitude: number) => ({ latitude, longitude });
const layerIds = (specs: OverlaySpec[]) => specs.flatMap((s) => s.layers.map((l) => l.id));

describe('Ijtema map design system', () => {
  it('ranks the user, then the active route, then destination, start, blocks and gates', () => {
    expect(MAP_VISUAL_PRIORITY.slice(0, 6)).toEqual(['user', 'activeRoute', 'destination', 'start', 'blocks', 'gates']);
    expect(MAP_VISUAL_PRIORITY[MAP_VISUAL_PRIORITY.length - 1]).toBe('surroundings');
  });

  it('the active route is heavier than every static line so nothing competes with it', () => {
    const statics = [MAP_LINE_WIDTH.rastaLine, MAP_LINE_WIDTH.rastaCasing, MAP_LINE_WIDTH.specialRoute, MAP_LINE_WIDTH.blockStroke];
    for (const w of statics) expect(MAP_LINE_WIDTH.activeRoute).toBeGreaterThan(w);
    expect(MAP_LINE_WIDTH.activeRouteCasing).toBeGreaterThanOrEqual(MAP_LINE_WIDTH.rastaSelectedCasing);
  });

  it('walking paths outrank the special route, which is told apart by pattern and not only colour', () => {
    expect(MAP_LINE_WIDTH.rastaCasing).toBeGreaterThan(MAP_LINE_WIDTH.specialRoute);
    expect(SPECIAL_ROUTE_DASH.length).toBeGreaterThanOrEqual(2);
  });

  it('draws bottom → top: venue context, then the route, then pins, then the user', () => {
    const full: OverlaySpec[] = [
      ...buildHomeVenueOverlay({ venueBoundary: [c(1, 1), c(1, 2), c(2, 2)], blocks: [], rastas: [], specialRoutes: [], gates: [], facilities: LANDMARK_PLACES, activeMapFilter: 'none' }),
      ...buildRouteOverlay({ outside: [], roadFollowing: false, inside: [c(1, 1), c(1, 2)] }),
      ...buildMarkerOverlay({ destination: c(1, 2), start: c(1, 1), user: { coordinate: c(1, 1), heading: 90 } }),
    ];
    const ids = layerIds(full);
    const at = (id: string) => ids.indexOf(id);
    expect(at('facilities-icon')).toBeLessThan(at('route-line'));
    expect(at('route-line')).toBeLessThan(at('pin-icon'));
    expect(at('pin-icon')).toBeLessThan(at('user-heading'));
    expect(at('user-heading')).toBeLessThan(at('user-dot'));
  });

  it('special routes are dashed when idle and gain a solid overlay only when selected', () => {
    const specs = buildHomeVenueOverlay({
      venueBoundary: [], blocks: [], rastas: [], gates: [], facilities: [], activeMapFilter: 'none',
      specialRoutes: [{ id: 'S', label: 'S', name: { en: 'S', ur: 'S' } as never, polyline: [c(1, 1), c(1, 2)], labelCoordinate: c(1, 1), isSelected: true }],
    });
    const special = specs.find((s) => s.id === 'venue-special')!;
    expect(special.layers.find((l) => l.id === 'special-line')!.paint['line-dasharray']).toEqual(SPECIAL_ROUTE_DASH);
    expect(special.layers.find((l) => l.id === 'special-selected-solid')!.filter).toEqual(['==', ['get', 'state'], 'selected']);
  });

  it('facility badges are small at the venue overview and full size up close', () => {
    expect(FACILITY_ICON_SIZE_BY_ZOOM).toEqual(['interpolate', ['linear'], ['zoom'], 14, 0.55, 16.5, 0.9]);
  });

  it('the user heading cone is drawn only for a valid heading on a live position', () => {
    const idsFor = (user: Parameters<typeof buildMarkerOverlay>[0]['user']) => layerIds(buildMarkerOverlay({ user }));
    expect(idsFor({ coordinate: c(1, 1), heading: 45 })).toContain('user-heading');
    expect(idsFor({ coordinate: c(1, 1), heading: -1 })).not.toContain('user-heading');
    expect(idsFor({ coordinate: c(1, 1) })).not.toContain('user-heading');
    expect(idsFor({ coordinate: c(1, 1), heading: 45, remembered: true })).not.toContain('user-heading');
  });
});

describe('marker images', () => {
  it('registers every image the overlay layers can reference, as PNG data URIs at 3x', () => {
    const wanted = ['pin-destination', 'pin-start', 'user-heading', 'gate-badge', 'gate-badge-warning', 'route-chevron'];
    for (const p of LANDMARK_PLACES) {
      wanted.push(`facility-${facilityIconKey(p)}`);
    }
    for (const name of wanted) {
      const img = (MARKER_IMAGES as Record<string, { source: { uri: string; scale: number } }>)[name];
      expect(img).toBeDefined();
      expect(img.source.scale).toBe(3);
      expect(img.source.uri.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    }
  });

  it('bakes the same colours as the theme tokens (regenerate with scripts/offline-map/build-marker-images.mjs)', () => {
    expect(tokens.destination).toBe(staticColors.gateAccent);
    expect(tokens.start).toBe(staticColors.startMarker);
    expect(tokens.facility).toBe(staticColors.facilityAccent);
    expect(tokens.user).toBe(staticColors.userLocation);
    expect(tokens.gate).toBe(staticColors.gateMarkerDot);
    expect(tokens.gateWarning).toBe(staticColors.gateMarkerWarning);
  });

  it('keeps the walking-path palette semi-transparent so the active route outranks it', () => {
    expect(MAP_COLORS.rastaCasing).toMatch(/rgba\(.*0\.[0-4]\d*\)/);
  });
});

describe('facilityIconKey', () => {
  it('maps landmark ids to the badge glyphs the old marker layer used', () => {
    const key = (id: string, category = 'Facility') => facilityIconKey({ id, category } as never);
    expect(key('LM_FOOD_MAIN')).toBe('food');
    expect(key('LM_WATER_NORTH')).toBe('water');
    expect(key('LM_MEDICAL_MAIN')).toBe('medical');
    expect(key('LM_PARKING')).toBe('parking');
    expect(key('LM_BUS_NORTH')).toBe('bus');
    expect(key('LM_LOST_FOUND')).toBe('lostfound');
    expect(key('LM_VOLUNTEER')).toBe('volunteer');
    expect(key('LM_MASJID_MAIN', 'Masjid')).toBe('landmark');
    expect(key('LM_GATE_EAST')).toBe('landmark');
  });
});

describe('marker image generator source', () => {
  it('the committed generator and tokens exist alongside the generated module', () => {
    expect(readFileSync(join(__dirname, '../../scripts/offline-map/build-marker-images.mjs'), 'utf8')).toContain('MARKER_IMAGES');
  });
});
