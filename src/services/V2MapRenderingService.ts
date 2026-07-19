/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IJTEMA_BLOCKS,
  IJTEMA_GATES,
  IJTEMA_MAP_BOUNDS,
  IJTEMA_RASTAS,
  IJTEMA_SPECIAL_ROUTES,
  LocalizedLabel,
} from '../data/ijtema';
import { Coordinate, Place } from '../models/types';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import { V2PlaceAdapter } from './V2PlaceAdapter';

export interface V2LabelLayer {
  id: string;
  coordinate: Coordinate;
  text: string;
  isSelected?: boolean;
}

export interface V2BlockLayer {
  id: string;
  label: string;
  /** Bilingual EN/UR source name — see MapLocalizationService. */
  name: LocalizedLabel;
  center: Coordinate;
  polygon: Coordinate[];
  isSelected: boolean;
  pulse: boolean;
}

export interface V2PolylineLayer {
  id: string;
  label: string;
  /** Bilingual EN/UR source name — see MapLocalizationService. */
  name: LocalizedLabel;
  polyline: Coordinate[];
  labelCoordinate: Coordinate;
  isSelected: boolean;
}

export interface V2GateLayer {
  id: string;
  label: string;
  /** Bilingual EN/UR source name — see MapLocalizationService. */
  name: LocalizedLabel;
  coordinate: Coordinate;
  isRoutable: boolean;
  isStartRoutable: boolean;
  needsConnectorVerification: boolean;
  isSelected?: boolean;
  /** Home-only: true when this gate's label would visually collide with a higher-priority neighbor at the current zoom — render as a dot, not text. */
  labelSuppressed?: boolean;
}

export interface V2HomeMapLayers {
  useV2Map: boolean;
  graphOnlyFallbackSupported: boolean;
  activeMapFilter: string;
  venueBoundary: Coordinate[];
  blocks: V2BlockLayer[];
  gates: V2GateLayer[];
  rastas: V2PolylineLayer[];
  specialRoutes: V2PolylineLayer[];
  /** Home-only: block polygons after low-zoom LOD (hidden below MEDIUM_ZOOM unless selected). Nav keeps using the unfiltered `blocks`. */
  visibleBlocks: V2BlockLayer[];
  /** Home-only: rasta polylines after low-zoom LOD (hidden below MEDIUM_ZOOM unless selected). Nav keeps using the unfiltered `rastas`. */
  visibleRastas: V2PolylineLayer[];
  visibleBlockLabels: Array<V2BlockLayer>;
  visibleGateMarkers: V2GateLayer[];
  visibleRastaLabels: V2PolylineLayer[];
  visibleSpecialRouteLabels: V2PolylineLayer[];
  developerLabels: V2LabelLayer[];
  selectedMarkerCoordinate: Coordinate | null;
}

export interface V2MapLayerOptions {
  selectedPlaceId?: string | null;
  selectedPlace?: Place | null;
  developerMode?: boolean;
  graphOnlyFallback?: boolean;
  zoomLevel?: number;
  mapFilter?: string | null;
  /** Layers-sheet overlay toggles — independent of mapFilter, default true (all on) so existing callers are unaffected. */
  showGatesLayer?: boolean;
  showRastasLayer?: boolean;
  showSpecialRoutesLayer?: boolean;
}

type V2BaseLayers = Omit<
  V2HomeMapLayers,
  | 'useV2Map'
  | 'graphOnlyFallbackSupported'
  | 'activeMapFilter'
  | 'selectedMarkerCoordinate'
  | 'developerLabels'
  | 'visibleBlocks'
  | 'visibleRastas'
  | 'visibleBlockLabels'
  | 'visibleGateMarkers'
  | 'visibleRastaLabels'
  | 'visibleSpecialRouteLabels'
>;

// Single source of truth for zoom-based LOD thresholds — consumed both here
// and by GateLayer's home variant (src/views/components/map/GateLayer.tsx)
// for its full/compact/number gate-label tiers, so the two systems can't diverge.
export const LOW_ZOOM = 13;
export const MEDIUM_ZOOM = 15;
export const HIGH_ZOOM = 16.5;
export const DEFAULT_ZOOM = 15;
const MAJOR_GATE_IDS = new Set(['GATE_05', 'GATE_08', 'GATE_13', 'GATE_21', 'GATE_22']);
const MAP_FILTERS = new Set(['all', 'blocks', 'rastas', 'gates', 'special_routes']);

const midpoint = (points: Coordinate[]): Coordinate => points[Math.floor(points.length / 2)] ?? points[0];

const normalizeBlockLabel = (label: string): string => label.replace(/\s+/g, ' ').trim();
const normalizeGateLabel = (label: string): string => label.replace(/\s+/g, ' ').replace(/\bGate\s+Gate\b/gi, 'Gate').trim();

function pickByZoom<T extends { id: string }>(
  items: T[],
  zoomLevel: number,
  selectedId: string | null,
  mediumEvery: number,
  lowZoomPredicate: (item: T, index: number) => boolean,
): T[] {
  if (zoomLevel >= HIGH_ZOOM) return items;
  if (zoomLevel >= MEDIUM_ZOOM) {
    return items.filter((item, index) => item.id === selectedId || index % mediumEvery === 0);
  }
  return items.filter((item, index) => item.id === selectedId || lowZoomPredicate(item, index));
}

// Minimum on-screen gap (px) to keep between two gate label centers before
// treating them as colliding — approximates a compact gate pill's width so
// clusters don't render overlapping/clipped labels ("Ga", "G" fragments).
const GATE_LABEL_MIN_GAP_PX = 42;

const metersPerPixelAtZoom = (latitude: number, zoomLevel: number): number =>
  (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoomLevel);

const approxPixelDistance = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  zoomLevel: number,
): number => {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((a.latitude * Math.PI) / 180);
  const dLatM = (a.latitude - b.latitude) * metersPerDegreeLat;
  const dLngM = (a.longitude - b.longitude) * metersPerDegreeLng;
  const meters = Math.sqrt(dLatM * dLatM + dLngM * dLngM);
  return meters / metersPerPixelAtZoom(a.latitude, zoomLevel);
};

// Greedy collision avoidance: every gate stays visible as a marker (callers
// rely on the full set being present, e.g. the explicit "Gates" filter), but
// when two gate labels would visually overlap at this zoom, the lower-
// priority one's label text is suppressed in favor of a plain dot — instead
// of rendering clipped/illegible fragments ("Ga Ga", "G"). Priority:
// selected > major gate > everything else, stable on incoming order.
function declutterGateMarkers<T extends { id: string; coordinate: { latitude: number; longitude: number }; isSelected?: boolean }>(
  gates: T[],
  zoomLevel: number,
): (T & { labelSuppressed: boolean })[] {
  if (gates.length <= 1 || zoomLevel >= HIGH_ZOOM) {
    return gates.map((gate) => ({ ...gate, labelSuppressed: false }));
  }

  const priority = (gate: T): number => (gate.isSelected ? 2 : MAJOR_GATE_IDS.has(gate.id) ? 1 : 0);
  const ordered = [...gates].sort((a, b) => priority(b) - priority(a));
  const placedLabels: T[] = [];
  const suppressed = new Set<string>();

  for (const gate of ordered) {
    const collides = placedLabels.some(
      (existing) => approxPixelDistance(gate.coordinate, existing.coordinate, zoomLevel) < GATE_LABEL_MIN_GAP_PX,
    );
    if (collides) {
      suppressed.add(gate.id);
    } else {
      placedLabels.push(gate);
    }
  }

  return gates.map((gate) => ({ ...gate, labelSuppressed: suppressed.has(gate.id) }));
}

function normalizeMapFilter(filter: string | null | undefined): string {
  if (!filter) return 'all';
  const normalized = filter.toLowerCase();
  if (normalized === 'specialroutes' || normalized === 'shahr-e-pindal') return 'special_routes';
  return MAP_FILTERS.has(normalized) ? normalized : 'all';
}

export class V2MapRenderingService {
  private static baseLayersCache: V2BaseLayers | null = null;
  private static developerLabelsCache: V2LabelLayer[] | null = null;

  static getVenueBoundary(): Coordinate[] {
    return [
      { latitude: IJTEMA_MAP_BOUNDS.minLat, longitude: IJTEMA_MAP_BOUNDS.minLng },
      { latitude: IJTEMA_MAP_BOUNDS.minLat, longitude: IJTEMA_MAP_BOUNDS.maxLng },
      { latitude: IJTEMA_MAP_BOUNDS.maxLat, longitude: IJTEMA_MAP_BOUNDS.maxLng },
      { latitude: IJTEMA_MAP_BOUNDS.maxLat, longitude: IJTEMA_MAP_BOUNDS.minLng },
    ];
  }

  /**
   * Splits a route's coordinates into the outside-venue leg and the inside
   * leg for two-color rendering (dashed/amber outside vs solid blue inside),
   * per the UX flow in docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md — applies
   * to both street-graph and beeline outside legs, `outsideLegCoordinateCount`
   * is 1 for a plain beeline. The gate coordinate is shared between both
   * slices so the two polylines connect with no visual gap.
   */
  static splitOutsideInsideCoordinates(
    coordinates: Coordinate[],
    outsideLegCoordinateCount: number | undefined,
  ): { outside: Coordinate[]; inside: Coordinate[] } {
    const count = outsideLegCoordinateCount ?? 0;
    if (count <= 0 || count >= coordinates.length) {
      return { outside: [], inside: coordinates };
    }
    return {
      outside: coordinates.slice(0, count + 1),
      inside: coordinates.slice(count),
    };
  }

  private static getBaseLayers(): V2BaseLayers {
    if (this.baseLayersCache) return this.baseLayersCache;

    const blocks = IJTEMA_BLOCKS.map((block) => ({
      id: block.id,
      label: normalizeBlockLabel(block.visual.label),
      name: block.name,
      center: V2PlaceAdapter.toCoordinate(block.center),
      polygon: block.polygon.map((point) => V2PlaceAdapter.toCoordinate(point)),
      isSelected: false,
      pulse: false,
    }));

    const gates = IJTEMA_GATES
      .filter((gate) => gate.coordinate && gate.userFacingBehavior.mapDisplay === 'visible')
      .map((gate) => {
        const place = V2PlaceAdapter.gateToPlace(gate, { developerMode: false });
        return {
          id: gate.id,
          label: normalizeGateLabel(gate.name.en),
          name: gate.name,
          coordinate: V2PlaceAdapter.toCoordinate(gate.coordinate!),
          isRoutable: place.isRoutable === true,
          isStartRoutable: place.isStartRoutable === true,
          needsConnectorVerification: place.routingStatus === 'needs_connector_verification',
          isSelected: false,
        };
      });

    const rastas = IJTEMA_RASTAS.map((rasta) => {
      const polyline = rasta.points.map((point) => V2PlaceAdapter.toCoordinate(point.coordinate));
      return {
        id: rasta.id,
        label: rasta.visual.label,
        name: rasta.name,
        polyline,
        labelCoordinate: midpoint(polyline),
        isSelected: false,
      };
    });

    const specialRoutes = IJTEMA_SPECIAL_ROUTES.map((route) => {
      const polyline = route.points.map((point) => V2PlaceAdapter.toCoordinate(point.coordinate));
      return {
        id: route.id,
        label: route.visual.label,
        name: route.name,
        polyline,
        labelCoordinate: midpoint(polyline),
        isSelected: false,
      };
    });

    this.baseLayersCache = {
      venueBoundary: this.getVenueBoundary(),
      blocks,
      gates,
      rastas,
      specialRoutes,
    };

    return this.baseLayersCache;
  }

  private static getDeveloperLabels(): V2LabelLayer[] {
    if (this.developerLabelsCache) return this.developerLabelsCache;

    this.developerLabelsCache = [
      ...IJTEMA_BLOCKS.flatMap((block) =>
        Object.entries(block.entryPoints).map(([key, coordinate]) => ({
          id: `${block.id}_${key.toUpperCase()}`,
          coordinate: V2PlaceAdapter.toCoordinate(coordinate),
          text: `${block.id}_${key.toUpperCase()}`,
        })),
      ),
      ...IJTEMA_RASTAS.flatMap((rasta) =>
        rasta.points.map((point) => ({
          id: point.id,
          coordinate: V2PlaceAdapter.toCoordinate(point.coordinate),
          text: point.id,
        })),
      ),
      ...IJTEMA_SPECIAL_ROUTES.flatMap((route) =>
        route.points.map((point) => ({
          id: point.id,
          coordinate: V2PlaceAdapter.toCoordinate(point.coordinate),
          text: point.id,
        })),
      ),
    ];

    return this.developerLabelsCache;
  }

  static getHomeLayers(options: V2MapLayerOptions = {}): V2HomeMapLayers {
    const selectedId = options.selectedPlaceId ?? options.selectedPlace?.id ?? null;
    const baseLayers = this.getBaseLayers();
    const zoomLevel = options.zoomLevel ?? DEFAULT_ZOOM;
    const mapFilter = normalizeMapFilter(options.mapFilter);

    const showBlocks = mapFilter === 'all' || mapFilter === 'blocks';
    const showGates = (mapFilter === 'all' || mapFilter === 'gates') && options.showGatesLayer !== false;
    const showRastas = (mapFilter === 'all' || mapFilter === 'rastas') && options.showRastasLayer !== false;
    const showSpecialRoutes = (mapFilter === 'all' || mapFilter === 'special_routes') && options.showSpecialRoutesLayer !== false;

    const blocks = showBlocks
      ? baseLayers.blocks.map((block) => ({
          ...block,
          isSelected: selectedId === block.id,
          pulse: selectedId === block.id,
        }))
      : [];
    const gates = showGates
      ? baseLayers.gates.map((gate) => ({
          ...gate,
          isSelected: selectedId === gate.id,
        }))
      : [];
    const rastas = showRastas
      ? baseLayers.rastas.map((rasta) => ({
          ...rasta,
          isSelected: selectedId === rasta.id,
        }))
      : [];
    const specialRoutes = showSpecialRoutes
      ? baseLayers.specialRoutes.map((route) => ({
          ...route,
          isSelected: selectedId === route.id,
        }))
      : [];

    // Phase 6 LOD: below MEDIUM_ZOOM only the venue boundary, major gates (already
    // handled by visibleGateMarkers' MAJOR_GATE_IDS predicate below), and special
    // routes ("major routes" — always rendered, unfiltered) stay on screen. Block
    // polygons and rasta polylines are dense enough to clutter a zoomed-out view,
    // so they're hidden below MEDIUM_ZOOM unless the user explicitly filtered to
    // that category or has one selected. Nav mode intentionally keeps consuming
    // the unfiltered `blocks`/`rastas` fields (see NavigationMapLayersV2) — this
    // LOD only applies to the two new `visibleBlocks`/`visibleRastas` fields Home renders from.
    const visibleBlocks = mapFilter === 'blocks' || zoomLevel >= MEDIUM_ZOOM
      ? blocks
      : blocks.filter((block) => block.isSelected);
    const visibleRastas = mapFilter === 'rastas' || zoomLevel >= MEDIUM_ZOOM
      ? rastas
      : rastas.filter((rasta) => rasta.isSelected);

    const visibleBlockLabels = mapFilter === 'blocks'
      ? blocks
      : pickByZoom(visibleBlocks, zoomLevel, selectedId, 4, () => false);
    const visibleGateMarkers = declutterGateMarkers(
      mapFilter === 'gates'
        ? gates
        : pickByZoom(gates, zoomLevel, selectedId, 2, (gate) => MAJOR_GATE_IDS.has(gate.id)),
      zoomLevel,
    );
    const visibleRastaLabels = mapFilter === 'rastas'
      ? rastas
      : pickByZoom(visibleRastas, zoomLevel, selectedId, 2, (_, index) => index % 3 === 0);
    const visibleSpecialRouteLabels = mapFilter === 'special_routes'
      ? specialRoutes
      : zoomLevel < MEDIUM_ZOOM
      ? specialRoutes.filter((route) => route.id === selectedId).map((route) => ({ ...route, isSelected: true }))
      : specialRoutes;

    return {
      useV2Map: MapFeatureFlagsService.useIjtemaV2Map(),
      graphOnlyFallbackSupported: Boolean(options.graphOnlyFallback),
      activeMapFilter: mapFilter,
      venueBoundary: baseLayers.venueBoundary,
      blocks,
      visibleBlocks,
      visibleBlockLabels,
      gates,
      visibleGateMarkers,
      rastas,
      visibleRastas,
      visibleRastaLabels,
      specialRoutes,
      visibleSpecialRouteLabels,
      developerLabels: options.developerMode ? this.getDeveloperLabels() : [],
      selectedMarkerCoordinate: options.selectedPlace ? V2PlaceAdapter.getMarkerCoordinate(options.selectedPlace) : null,
    };
  }
}
