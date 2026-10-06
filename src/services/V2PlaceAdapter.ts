/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Block,
  Gate,
  IJTEMA_BLOCKS,
  IJTEMA_GATES,
  IJTEMA_NAVIGATION_GRAPH_V2,
  IJTEMA_RASTAS,
  IJTEMA_SPECIAL_ROUTES,
  MAJOR_GATE_IDS,
  Rasta,
  SpecialRoute,
  getBlockEntryNodeIds,
} from '../data/ijtema';
import { Coordinate as V2Coordinate } from '../data/ijtema/types';
import { Coordinate, Place, V2Place } from '../models/types';

export interface V2PlaceAdapterOptions {
  developerMode?: boolean;
  includeUnavailableGates?: boolean;
}

export type { V2Place } from '../models/types';

const disconnectedGateIds = new Set(['GATE_18', 'GATE_19']);

const toAppCoordinate = (coordinate: V2Coordinate): Coordinate => ({
  latitude: coordinate.lat,
  longitude: coordinate.lng,
});

const hasGraphConnection = (nodeId: string): boolean =>
  Boolean(IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId] && IJTEMA_NAVIGATION_GRAPH_V2.adjacency[nodeId]?.length > 0);

const hasConnectedSpecialRoutePath = (route: SpecialRoute): boolean => {
  const routePointIds = new Set(route.points.map((point) => point.id));
  return route.points.some((point) =>
    (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[point.id] ?? []).some((edge) => !routePointIds.has(edge.to)),
  );
};

const gateUnavailableReason = (gate: Gate): string | undefined => {
  if (gate.routingStatus === 'missing_coordinate' || !gate.coordinate) {
    return `${gate.name.en} is missing a verified coordinate and cannot be used for routing yet.`;
  }
  if (!hasGraphConnection(gate.id)) {
    return `${gate.name.en} needs connector verification before routing.`;
  }
  return undefined;
};

/**
 * Presentational-only warning for gates whose source coordinate is flagged
 * `needs_verification` (see src/data/ijtema/dataIssues.ts GATE_13_14_NEAR_DUPLICATE).
 * Deliberately does not touch routingStatus/isRoutable/canStartRouteFromOutside —
 * this must never block or alter routing, only inform the user on selection.
 */
const gateVerificationWarning = (gate: Gate): string | undefined =>
  gate.status === 'needs_verification' ? 'Directions to this gate may be less exact.' : undefined;

/**
 * Blocks whose entry node sits on (or is graph-adjacent to) one of the given path point
 * ids — reuses the same navigation graph adjacency hasConnectedSpecialRoutePath already
 * relies on, so "connected blocks" on a Rasta/Pindal's LocationSheet is real routing data,
 * not a guess from proximity/geometry.
 */
const findConnectedBlockNames = (pointIds: string[]): string[] => {
  const pointIdSet = new Set(pointIds);
  const names: string[] = [];
  for (const block of IJTEMA_BLOCKS) {
    const isConnected = getBlockEntryNodeIds(block.id).some(
      (entryId) =>
        pointIdSet.has(entryId) ||
        (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[entryId] ?? []).some((edge) => pointIdSet.has(edge.to)),
    );
    if (isConnected) names.push(block.name.en);
  }
  return names;
};

export class V2PlaceAdapter {
  private static allPlacesCache = new Map<string, V2Place[]>();
  private static categoryCache = new Map<string, V2Place[]>();

  private static optionsKey(options: V2PlaceAdapterOptions = {}): string {
    return `${options.developerMode ? 'dev' : 'normal'}:${options.includeUnavailableGates ? 'all-gates' : 'searchable-gates'}`;
  }

  static toCoordinate(coordinate: V2Coordinate): Coordinate {
    return toAppCoordinate(coordinate);
  }

  static blockToPlace(block: Block, options: V2PlaceAdapterOptions = {}): V2Place {
    const entryNodeIds = getBlockEntryNodeIds(block.id);
    return {
      id: block.id,
      name: block.name.en,
      urduName: block.name.ur,
      secondaryLabel: block.name.romanUrdu,
      category: 'Block',
      description: `${block.name.en} of Karachi Ijtema ground.`,
      coordinate: toAppCoordinate(block.center),
      polygon: block.polygon.map(toAppCoordinate),
      routingNodeId: entryNodeIds[0],
      aliases: block.aliases,
      sourceVersion: 'v2',
      sourceKind: 'block',
      routingStatus: 'routable',
      isRoutable: true,
      isStartRoutable: true,
      developerLabel: options.developerMode ? `${block.id}: ${entryNodeIds.join(', ')}` : undefined,
    };
  }

  static gateToPlace(gate: Gate, options: V2PlaceAdapterOptions = {}): V2Place {
    const unavailableReason = gateUnavailableReason(gate);
    const isConnected = gate.routingStatus === 'routable' && hasGraphConnection(gate.id);
    const routingStatus = gate.routingStatus === 'missing_coordinate'
      ? 'missing_coordinate'
      : isConnected
      ? 'routable'
      : 'needs_connector_verification';

    return {
      id: gate.id,
      name: gate.name.en,
      urduName: gate.name.ur,
      secondaryLabel: gate.name.romanUrdu,
      category: 'Gate',
      description: unavailableReason ?? `Official Ijtema entry / exit gate — ${gate.name.en}.`,
      coordinate: gate.coordinate ? toAppCoordinate(gate.coordinate) : (undefined as unknown as Coordinate),
      routingNodeId: isConnected ? gate.id : undefined,
      resolvedRoutingNodeId: isConnected ? gate.id : undefined,
      aliases: gate.aliases,
      sourceVersion: 'v2',
      sourceKind: 'gate',
      routingStatus,
      isRoutable: isConnected,
      isStartRoutable: isConnected,
      unavailableReason,
      verificationWarning: gateVerificationWarning(gate),
      developerLabel: options.developerMode ? `${gate.id}${disconnectedGateIds.has(gate.id) ? ' disconnected' : ''}` : undefined,
      gateNumber: gate.number,
      isMajorGate: MAJOR_GATE_IDS.has(gate.id),
    };
  }

  static rastaToPlace(rasta: Rasta, options: V2PlaceAdapterOptions = {}): V2Place {
    const firstPoint = rasta.points[0];
    return {
      id: rasta.id,
      name: rasta.name.en,
      urduName: rasta.name.ur,
      secondaryLabel: rasta.name.romanUrdu,
      category: 'Rasta',
      description: `Walking path — ${rasta.name.en}.`,
      coordinate: toAppCoordinate(firstPoint.coordinate),
      polyline: rasta.points.map((point) => toAppCoordinate(point.coordinate)),
      routingNodeId: firstPoint.id,
      aliases: rasta.aliases,
      sourceVersion: 'v2',
      sourceKind: 'rasta',
      routingStatus: 'routable',
      isRoutable: true,
      isStartRoutable: true,
      developerLabel: options.developerMode ? rasta.points.map((point) => point.id).join(', ') : undefined,
      connectedBlockNames: findConnectedBlockNames(rasta.points.map((point) => point.id)),
    };
  }

  static specialRouteToPlace(route: SpecialRoute, options: V2PlaceAdapterOptions = {}): V2Place {
    const firstPoint = route.points[0];
    const isConnected = hasConnectedSpecialRoutePath(route);
    const routingStatus = isConnected ? 'routable' : 'needs_connector_verification';
    return {
      id: route.id,
      name: route.name.en,
      urduName: route.name.ur,
      secondaryLabel: route.name.romanUrdu,
      category: 'SpecialRoute',
      description: isConnected
        ? `${route.name.en} walking corridor.`
        : `${route.name.en} isn't ready for directions yet.`,
      coordinate: toAppCoordinate(firstPoint.coordinate),
      polyline: route.points.map((point) => toAppCoordinate(point.coordinate)),
      routingNodeId: firstPoint.id,
      aliases: route.aliases,
      sourceVersion: 'v2',
      sourceKind: 'special_route',
      routingStatus,
      isRoutable: isConnected,
      isStartRoutable: isConnected,
      unavailableReason: isConnected ? undefined : `${route.name.en} needs connector verification before routing.`,
      developerLabel: options.developerMode ? route.points.map((point) => point.id).join(', ') : undefined,
      connectedBlockNames: findConnectedBlockNames(route.points.map((point) => point.id)),
    };
  }

  static getAllPlaces(options: V2PlaceAdapterOptions = {}): V2Place[] {
    const key = this.optionsKey(options);
    const cached = this.allPlacesCache.get(key);
    if (cached) return cached;

    const places = [
      ...IJTEMA_BLOCKS.map((block) => this.blockToPlace(block, options)),
      ...IJTEMA_GATES
        .filter((gate) => options.includeUnavailableGates || gate.userFacingBehavior.normalSearch === 'searchable')
        .map((gate) => this.gateToPlace(gate, options)),
      ...IJTEMA_RASTAS.map((rasta) => this.rastaToPlace(rasta, options)),
      ...IJTEMA_SPECIAL_ROUTES.map((route) => this.specialRouteToPlace(route, options)),
    ];
    this.allPlacesCache.set(key, places);
    return places;
  }

  static getPlacesByCategory(category: string, options: V2PlaceAdapterOptions = {}): V2Place[] {
    const normalized = category.toLowerCase();
    const key = `${normalized}:${this.optionsKey(options)}`;
    const cached = this.categoryCache.get(key);
    if (cached) return cached;

    let places: V2Place[] = [];
    if (normalized === 'blocks') places = IJTEMA_BLOCKS.map((block) => this.blockToPlace(block, options));
    if (normalized === 'gates') {
      places = IJTEMA_GATES
        .filter((gate) => options.includeUnavailableGates || gate.userFacingBehavior.normalSearch === 'searchable')
        .map((gate) => this.gateToPlace(gate, options));
    }
    if (normalized === 'rastas') places = IJTEMA_RASTAS.map((rasta) => this.rastaToPlace(rasta, options));
    if (normalized === 'special_routes' || normalized === 'specialroutes' || normalized === 'shahr-e-pindal') {
      places = IJTEMA_SPECIAL_ROUTES.map((route) => this.specialRouteToPlace(route, options));
    }
    if (normalized === 'all') places = this.getAllPlaces(options);

    this.categoryCache.set(key, places);
    return places;
  }

  static getPlaceById(id: string, options: V2PlaceAdapterOptions = {}): V2Place | null {
    const block = IJTEMA_BLOCKS.find((item) => item.id === id);
    if (block) return this.blockToPlace(block, options);

    const gate = IJTEMA_GATES.find((item) => item.id === id);
    if (gate) return this.gateToPlace(gate, { ...options, includeUnavailableGates: true });

    const rasta = IJTEMA_RASTAS.find((item) => item.id === id);
    if (rasta) return this.rastaToPlace(rasta, options);

    const specialRoute = IJTEMA_SPECIAL_ROUTES.find((item) => item.id === id);
    if (specialRoute) return this.specialRouteToPlace(specialRoute, options);

    return null;
  }

  static getMarkerCoordinate(place: Place): Coordinate | null {
    if (place.resolvedRoutingCoordinate) return place.resolvedRoutingCoordinate;
    if (place.coordinate) return place.coordinate;
    if (place.polygon?.[0]) return place.polygon[0];
    if (place.polyline?.[0]) return place.polyline[0];
    return null;
  }
}
