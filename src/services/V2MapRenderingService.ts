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
  center: Coordinate;
  polygon: Coordinate[];
  isSelected: boolean;
  pulse: boolean;
}

export interface V2PolylineLayer {
  id: string;
  label: string;
  polyline: Coordinate[];
  labelCoordinate: Coordinate;
  isSelected: boolean;
}

export interface V2GateLayer {
  id: string;
  label: string;
  coordinate: Coordinate;
  isRoutable: boolean;
  isStartRoutable: boolean;
  needsConnectorVerification: boolean;
  isSelected?: boolean;
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
}

type V2BaseLayers = Omit<
  V2HomeMapLayers,
  | 'useV2Map'
  | 'graphOnlyFallbackSupported'
  | 'activeMapFilter'
  | 'selectedMarkerCoordinate'
  | 'developerLabels'
  | 'visibleBlockLabels'
  | 'visibleGateMarkers'
  | 'visibleRastaLabels'
  | 'visibleSpecialRouteLabels'
>;

const LOW_ZOOM = 13;
const MEDIUM_ZOOM = 15;
const HIGH_ZOOM = 16.5;
const DEFAULT_ZOOM = 15;
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

  private static getBaseLayers(): V2BaseLayers {
    if (this.baseLayersCache) return this.baseLayersCache;

    const blocks = IJTEMA_BLOCKS.map((block) => ({
      id: block.id,
      label: normalizeBlockLabel(block.visual.label),
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
    const showGates = mapFilter === 'all' || mapFilter === 'gates';
    const showRastas = mapFilter === 'all' || mapFilter === 'rastas';
    const showSpecialRoutes = mapFilter === 'all' || mapFilter === 'special_routes';

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

    const visibleBlockLabels = mapFilter === 'blocks'
      ? blocks
      : pickByZoom(blocks, zoomLevel, selectedId, 4, () => false);
    const visibleGateMarkers = mapFilter === 'gates'
      ? gates
      : pickByZoom(gates, zoomLevel, selectedId, 2, (gate) => MAJOR_GATE_IDS.has(gate.id));
    const visibleRastaLabels = mapFilter === 'rastas'
      ? rastas
      : zoomLevel < LOW_ZOOM
      ? rastas.filter((rasta) => rasta.id === selectedId).map((rasta) => ({ ...rasta, isSelected: true }))
      : pickByZoom(rastas, zoomLevel, selectedId, 2, (_, index) => index % 3 === 0);
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
      visibleBlockLabels,
      gates,
      visibleGateMarkers,
      rastas,
      visibleRastaLabels,
      specialRoutes,
      visibleSpecialRouteLabels,
      developerLabels: options.developerMode ? this.getDeveloperLabels() : [],
      selectedMarkerCoordinate: options.selectedPlace ? V2PlaceAdapter.getMarkerCoordinate(options.selectedPlace) : null,
    };
  }
}
