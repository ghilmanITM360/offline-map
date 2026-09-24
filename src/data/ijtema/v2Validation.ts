/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structural validation for the actual v2 production navigation dataset
 * (`src/data/ijtema/*`), which the legacy `validateIjtemaGraph` (./validation.ts)
 * never covers — that function only ever runs against the legacy v1 dataset
 * (`src/constants/data.ts`). See DATA-VALIDATION-002.
 *
 * This does not replace the existing hand-written assertions in
 * `scripts/test-map-data-v2.ts` (which pin exact known-good values — specific
 * coordinates, counts, documented data-issue IDs). It adds the generic
 * structural checks that were not covered anywhere: cross-entity duplicate
 * aliases, unexpected disconnected destinations, and a single reusable,
 * structured (non-throwing) report shape any caller can consume.
 */

import { IJTEMA_BLOCKS } from './blocks';
import { IJTEMA_CENTRAL_POINTS } from './centralPoints';
import { IJTEMA_GATES } from './gates';
import { getBlockEntryNodeIds } from './graphBuilder';
import { IJTEMA_MAP_BOUNDS } from './mapBounds';
import { IJTEMA_NAVIGATION_GRAPH_V2 } from './navigationGraph';
import { IJTEMA_RASTAS } from './rastas';
import { IJTEMA_SPECIAL_ROUTES } from './specialRoutes';
import { Block, CentralPoint, Coordinate, Gate, MapBounds, Rasta, SpecialRoute } from './types';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationEntityType =
  | 'gate'
  | 'block'
  | 'rasta'
  | 'rastaPoint'
  | 'specialRoute'
  | 'specialRoutePoint'
  | 'centralPoint'
  | 'dataset';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  entityType: ValidationEntityType;
  entityId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  summary: {
    gates: number;
    blocks: number;
    rastas: number;
    rastaPoints: number;
    specialRoutes: number;
    specialRoutePoints: number;
    centralPoints: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export interface V2DatasetInput {
  gates: Gate[];
  blocks: Block[];
  rastas: Rasta[];
  specialRoutes: SpecialRoute[];
  centralPoints: CentralPoint[];
  /** Node ID -> outgoing edges, from the already-built navigation graph. Only presence/length is used. */
  graphAdjacency: Record<string, unknown[]>;
  bounds: MapBounds;
}

export const defaultV2DatasetInput = (): V2DatasetInput => ({
  gates: IJTEMA_GATES,
  blocks: IJTEMA_BLOCKS,
  rastas: IJTEMA_RASTAS,
  specialRoutes: IJTEMA_SPECIAL_ROUTES,
  centralPoints: IJTEMA_CENTRAL_POINTS,
  graphAdjacency: IJTEMA_NAVIGATION_GRAPH_V2.adjacency,
  bounds: IJTEMA_MAP_BOUNDS,
});

const isFiniteCoordinate = (coordinate: Coordinate | undefined): coordinate is Coordinate =>
  Boolean(coordinate) && Number.isFinite(coordinate!.lat) && Number.isFinite(coordinate!.lng);

const isWithinBounds = (coordinate: Coordinate, bounds: MapBounds): boolean =>
  coordinate.lat >= bounds.minLat &&
  coordinate.lat <= bounds.maxLat &&
  coordinate.lng >= bounds.minLng &&
  coordinate.lng <= bounds.maxLng;

const hasAnyGraphConnection = (adjacency: Record<string, unknown[]>, nodeId: string): boolean =>
  (adjacency[nodeId] ?? []).length > 0;

class IssueCollector {
  private readonly issues: ValidationIssue[] = [];

  push(issue: ValidationIssue): void {
    this.issues.push(issue);
  }

  all(): ValidationIssue[] {
    return this.issues;
  }
}

const checkCoordinate = (
  issues: IssueCollector,
  coordinate: Coordinate | undefined,
  bounds: MapBounds,
  entityType: ValidationEntityType,
  entityId: string,
  fieldLabel: string,
): void => {
  if (!coordinate) return;

  if (!isFiniteCoordinate(coordinate)) {
    issues.push({
      code: 'MALFORMED_COORDINATE',
      severity: 'error',
      entityType,
      entityId,
      message: `${fieldLabel} has a non-finite (NaN/Infinity) latitude or longitude.`,
      metadata: { coordinate },
    });
    return;
  }

  if (coordinate.lat === 0 && coordinate.lng === 0) {
    issues.push({
      code: 'ZERO_COORDINATE',
      severity: 'error',
      entityType,
      entityId,
      message: `${fieldLabel} is exactly (0, 0), which almost always means an unset value, not a real location.`,
    });
    return;
  }

  if (!isWithinBounds(coordinate, bounds)) {
    issues.push({
      code: 'OUT_OF_BOUNDS_COORDINATE',
      severity: 'error',
      entityType,
      entityId,
      message: `${fieldLabel} (${coordinate.lat}, ${coordinate.lng}) falls outside the expected venue bounds.`,
      metadata: { coordinate, bounds },
    });
  }
};

const checkNonEmptyName = (
  issues: IssueCollector,
  name: string | undefined,
  entityType: ValidationEntityType,
  entityId: string,
  fieldLabel: string,
): void => {
  if (!name || name.trim().length === 0) {
    issues.push({
      code: 'EMPTY_NAME',
      severity: 'error',
      entityType,
      entityId,
      message: `${fieldLabel} is empty.`,
    });
  }
};

const trackId = (
  seen: Map<string, { entityType: ValidationEntityType; entityId: string }>,
  issues: IssueCollector,
  id: string,
  entityType: ValidationEntityType,
  entityId: string,
): void => {
  if (!id || id.trim().length === 0) {
    issues.push({
      code: 'EMPTY_ID',
      severity: 'error',
      entityType,
      entityId: entityId || '(unknown)',
      message: `${entityType} has an empty ID.`,
    });
    return;
  }

  const existing = seen.get(id);
  if (existing) {
    issues.push({
      code: 'DUPLICATE_ID',
      severity: 'error',
      entityType,
      entityId: id,
      message: `ID '${id}' is used by both ${existing.entityType} '${existing.entityId}' and ${entityType} '${entityId}'.`,
      metadata: { conflictsWith: existing },
    });
    return;
  }

  seen.set(id, { entityType, entityId });
};

const trackAlias = (
  seenAliases: Map<string, { entityType: ValidationEntityType; entityId: string }>,
  issues: IssueCollector,
  alias: string,
  entityType: ValidationEntityType,
  entityId: string,
): void => {
  const existing = seenAliases.get(alias);
  if (existing) {
    if (existing.entityType === entityType && existing.entityId === entityId) return;
    issues.push({
      code: 'DUPLICATE_ALIAS',
      severity: 'warning',
      entityType,
      entityId,
      message: `Alias '${alias}' is shared with ${existing.entityType} '${existing.entityId}', which makes search results ambiguous.`,
      metadata: { conflictsWith: existing },
    });
    return;
  }
  seenAliases.set(alias, { entityType, entityId });
};

const checkGate = (
  issues: IssueCollector,
  gate: Gate,
  bounds: MapBounds,
  adjacency: Record<string, unknown[]>,
): void => {
  checkNonEmptyName(issues, gate.name.en, 'gate', gate.id, `${gate.id} name`);

  if (gate.status === 'missing_coordinate') {
    if (gate.coordinate) {
      issues.push({
        code: 'CONTRADICTORY_STATUS',
        severity: 'error',
        entityType: 'gate',
        entityId: gate.id,
        message: `${gate.id} is marked missing_coordinate but has a coordinate.`,
      });
    }
    return;
  }

  checkCoordinate(issues, gate.coordinate, bounds, 'gate', gate.id, `${gate.id} coordinate`);
  if (!gate.coordinate) return;

  const isFieldBlocked = gate.connectorStatus === 'ground_truth_required';
  const connected = hasAnyGraphConnection(adjacency, gate.id);

  if (isFieldBlocked) {
    issues.push({
      code: 'FIELD_DATA_BLOCKED_GATE',
      severity: 'warning',
      entityType: 'gate',
      entityId: gate.id,
      message: `${gate.id} is an acknowledged field-data blocker (connectorStatus: ground_truth_required) — expected, not a bug.`,
    });

    if (gate.userFacingBehavior.normalSearch === 'searchable' || gate.userFacingBehavior.routeSelection === 'enabled') {
      issues.push({
        code: 'CONTRADICTORY_FIELD_BLOCKER_EXPOSURE',
        severity: 'error',
        entityType: 'gate',
        entityId: gate.id,
        message: `${gate.id} is ground_truth_required but is still searchable/routable to normal users.`,
      });
    }
    return;
  }

  if (!connected) {
    issues.push({
      code: 'UNEXPECTED_DISCONNECTED_DESTINATION',
      severity: 'error',
      entityType: 'gate',
      entityId: gate.id,
      message: `${gate.id} has no graph connector and is not marked as a field-data blocker (connectorStatus: verified_by_geometry) — this is an unexpected break, not an acknowledged one.`,
    });
  }

  if (gate.userFacingBehavior.normalSearch === 'searchable' && !connected) {
    issues.push({
      code: 'SEARCHABLE_BUT_UNROUTABLE',
      severity: 'error',
      entityType: 'gate',
      entityId: gate.id,
      message: `${gate.id} is searchable but has no graph connector.`,
    });
  }
};

const checkBlock = (
  issues: IssueCollector,
  block: Block,
  bounds: MapBounds,
  adjacency: Record<string, unknown[]>,
): void => {
  checkNonEmptyName(issues, block.name.en, 'block', block.id, `${block.id} name`);
  checkCoordinate(issues, block.center, bounds, 'block', block.id, `${block.id} center`);

  (['c1', 'c2', 'c3', 'c4'] as const).forEach((corner) => {
    checkCoordinate(issues, block.corners[corner], bounds, 'block', block.id, `${block.id}.corners.${corner}`);
    checkCoordinate(issues, block.entryPoints[corner], bounds, 'block', block.id, `${block.id}.entryPoints.${corner}`);
  });

  if (!block.polygon || block.polygon.length < 3) {
    issues.push({
      code: 'MALFORMED_POLYGON',
      severity: 'error',
      entityType: 'block',
      entityId: block.id,
      message: `${block.id} polygon must have at least 3 points.`,
    });
  }

  const entryNodeIds = getBlockEntryNodeIds(block.id);
  const connectedEntryCount = entryNodeIds.filter((nodeId) => hasAnyGraphConnection(adjacency, nodeId)).length;
  if (connectedEntryCount === 0) {
    issues.push({
      code: 'UNEXPECTED_DISCONNECTED_DESTINATION',
      severity: 'error',
      entityType: 'block',
      entityId: block.id,
      message: `${block.id} has no connected entry node — every one of its 4 entry points is unreachable from the pedestrian graph. Blocks have no field-data-blocker exception.`,
    });
  }
};

const checkRasta = (issues: IssueCollector, rasta: Rasta, bounds: MapBounds): void => {
  checkNonEmptyName(issues, rasta.name.en, 'rasta', rasta.id, `${rasta.id} name`);

  rasta.points.forEach((point) => {
    checkNonEmptyName(issues, point.name.en, 'rastaPoint', point.id, `${point.id} name`);
    checkCoordinate(issues, point.coordinate, bounds, 'rastaPoint', point.id, `${point.id} coordinate`);
  });

  const pointIds = new Set(rasta.points.map((point) => point.id));
  for (const segment of rasta.segments) {
    for (const pointId of segment.pointIds) {
      if (!pointIds.has(pointId)) {
        issues.push({
          code: 'ORPHAN_SEGMENT_REFERENCE',
          severity: 'error',
          entityType: 'rasta',
          entityId: rasta.id,
          message: `${rasta.id} segment '${segment.id}' references point '${pointId}', which does not exist on this rasta.`,
        });
      }
    }
  }
  for (const junction of rasta.junctions) {
    for (const pointId of [junction.fromPointId, junction.toPointId]) {
      if (!pointIds.has(pointId)) {
        issues.push({
          code: 'ORPHAN_JUNCTION_REFERENCE',
          severity: 'error',
          entityType: 'rasta',
          entityId: rasta.id,
          message: `${rasta.id} junction references point '${pointId}', which does not exist on this rasta.`,
        });
      }
    }
  }
};

const checkSpecialRoute = (issues: IssueCollector, route: SpecialRoute, bounds: MapBounds): void => {
  checkNonEmptyName(issues, route.name.en, 'specialRoute', route.id, `${route.id} name`);
  route.points.forEach((point) => {
    checkNonEmptyName(issues, point.name.en, 'specialRoutePoint', point.id, `${point.id} name`);
    checkCoordinate(issues, point.coordinate, bounds, 'specialRoutePoint', point.id, `${point.id} coordinate`);
  });
};

const checkCentralPoint = (issues: IssueCollector, point: CentralPoint, bounds: MapBounds): void => {
  checkNonEmptyName(issues, point.name.en, 'centralPoint', point.id, `${point.id} name`);
  checkCoordinate(issues, point.coordinate, bounds, 'centralPoint', point.id, `${point.id} coordinate`);
};

export const validateV2Dataset = (input: V2DatasetInput = defaultV2DatasetInput()): ValidationReport => {
  const issues = new IssueCollector();
  const seenIds = new Map<string, { entityType: ValidationEntityType; entityId: string }>();
  const seenAliases = new Map<string, { entityType: ValidationEntityType; entityId: string }>();

  for (const gate of input.gates) {
    trackId(seenIds, issues, gate.id, 'gate', gate.id);
    gate.aliases.forEach((alias) => trackAlias(seenAliases, issues, alias, 'gate', gate.id));
    checkGate(issues, gate, input.bounds, input.graphAdjacency);
  }

  for (const block of input.blocks) {
    trackId(seenIds, issues, block.id, 'block', block.id);
    block.aliases.forEach((alias) => trackAlias(seenAliases, issues, alias, 'block', block.id));
    checkBlock(issues, block, input.bounds, input.graphAdjacency);
  }

  for (const rasta of input.rastas) {
    trackId(seenIds, issues, rasta.id, 'rasta', rasta.id);
    rasta.aliases.forEach((alias) => trackAlias(seenAliases, issues, alias, 'rasta', rasta.id));
    rasta.points.forEach((point) => trackId(seenIds, issues, point.id, 'rastaPoint', point.id));
    checkRasta(issues, rasta, input.bounds);
  }

  for (const route of input.specialRoutes) {
    trackId(seenIds, issues, route.id, 'specialRoute', route.id);
    route.aliases.forEach((alias) => trackAlias(seenAliases, issues, alias, 'specialRoute', route.id));
    route.points.forEach((point) => trackId(seenIds, issues, point.id, 'specialRoutePoint', point.id));
    checkSpecialRoute(issues, route, input.bounds);
  }

  for (const point of input.centralPoints) {
    trackId(seenIds, issues, point.id, 'centralPoint', point.id);
    checkCentralPoint(issues, point, input.bounds);
  }

  const all = issues.all();
  const errors = all.filter((issue) => issue.severity === 'error');
  const warnings = all.filter((issue) => issue.severity === 'warning');
  const info = all.filter((issue) => issue.severity === 'info');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    summary: {
      gates: input.gates.length,
      blocks: input.blocks.length,
      rastas: input.rastas.length,
      rastaPoints: input.rastas.reduce((sum, rasta) => sum + rasta.points.length, 0),
      specialRoutes: input.specialRoutes.length,
      specialRoutePoints: input.specialRoutes.reduce((sum, route) => sum + route.points.length, 0),
      centralPoints: input.centralPoints.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: info.length,
    },
  };
};
