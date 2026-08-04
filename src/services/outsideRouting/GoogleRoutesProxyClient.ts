import type {
  GateRouteOutcome,
  NormalizedOutsideRoute,
  NormalizedWalkingStep,
  OutsideProviderAttempt,
  OutsideWalkingManeuver,
  OutsideWalkingRouteRequest,
} from '../../models/outsideRouting';
import { assertCompleteCandidateSet, assertOutsideWalkingRouteRequest } from './OutsideRouteValidation';
import {
  GOOGLE_ROUTES_PROXY_PATH,
  type GoogleRoutesProxyRequestBody,
} from './GoogleRoutesProxyContract';

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

export interface GoogleRoutesProxyClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImplementation;
}

const DEFAULT_TIMEOUT_MS = 4_000;
const MANEUVERS = new Set<OutsideWalkingManeuver>([
  'depart',
  'continue',
  'slight-left',
  'slight-right',
  'turn-left',
  'turn-right',
  'u-turn',
  'arrive',
  'unknown',
]);

function failure(code: Extract<OutsideProviderAttempt, { status: 'failure' }>['failure']['code'], retryable: boolean): OutsideProviderAttempt {
  return { status: 'failure', failure: { provider: 'google', code, retryable } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function coordinate(value: unknown): { latitude: number; longitude: number } | null {
  if (!isRecord(value) || !finiteNumber(value.latitude) || !finiteNumber(value.longitude)) return null;
  if (value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180) return null;
  return { latitude: value.latitude, longitude: value.longitude };
}

function step(value: unknown): NormalizedWalkingStep | null {
  if (!isRecord(value)) return null;
  const stepCoordinate = coordinate(value.coordinate);
  if (
    typeof value.id !== 'string' ||
    typeof value.maneuver !== 'string' ||
    !MANEUVERS.has(value.maneuver as OutsideWalkingManeuver) ||
    !finiteNumber(value.distanceM) ||
    value.distanceM < 0 ||
    !(value.durationSeconds === null || (finiteNumber(value.durationSeconds) && value.durationSeconds >= 0)) ||
    !stepCoordinate ||
    typeof value.instruction !== 'string' ||
    !(value.roadName === undefined || typeof value.roadName === 'string')
  ) return null;

  return {
    id: value.id,
    maneuver: value.maneuver as OutsideWalkingManeuver,
    distanceM: value.distanceM,
    durationSeconds: value.durationSeconds,
    coordinate: stepCoordinate,
    instruction: value.instruction,
    roadName: value.roadName,
  };
}

function routedOutcome(
  value: Record<string, unknown>,
  request: OutsideWalkingRouteRequest,
): GateRouteOutcome | null {
  if (typeof value.gateId !== 'string' || !Array.isArray(value.routes) || value.routes.length === 0) return null;
  const routes: NormalizedOutsideRoute[] = [];
  for (const [index, rawRoute] of value.routes.entries()) {
    if (!isRecord(rawRoute)) return null;
    if (
      typeof rawRoute.routeId !== 'string' ||
      !finiteNumber(rawRoute.distanceM) ||
      rawRoute.distanceM < 0 ||
      !(rawRoute.durationSeconds === null || (finiteNumber(rawRoute.durationSeconds) && rawRoute.durationSeconds >= 0)) ||
      !Array.isArray(rawRoute.coordinates) ||
      !Array.isArray(rawRoute.steps) ||
      !Array.isArray(rawRoute.warnings)
    ) return null;
    const coordinates = rawRoute.coordinates.map(coordinate);
    const steps = rawRoute.steps.map(step);
    if (coordinates.some((item) => !item) || steps.some((item) => !item) || rawRoute.warnings.some((item) => typeof item !== 'string')) {
      return null;
    }
    routes.push({
      schemaVersion: 1,
      candidateId: `${request.token.requestId}:google:${value.gateId}:${index}`,
      requestId: request.token.requestId,
      requestVersion: request.token.requestVersion,
      provider: 'google',
      gateId: value.gateId,
      distanceM: rawRoute.distanceM,
      durationSeconds: rawRoute.durationSeconds,
      coordinates: coordinates as Array<{ latitude: number; longitude: number }>,
      steps: steps as NormalizedWalkingStep[],
      roadFollowing: true,
      distanceKind: 'walking-route',
      warnings: (rawRoute.warnings as string[]).map((text) => ({ code: 'provider-warning', text })),
      fallbackReason: null,
      fallbackHistory: [],
    });
  }
  return { status: 'routed', gateId: value.gateId, routes };
}

function normalizeResponse(raw: unknown, request: OutsideWalkingRouteRequest) {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.requestId !== request.token.requestId || raw.requestVersion !== request.token.requestVersion) {
    return null;
  }
  if (!Array.isArray(raw.outcomes)) return null;
  const outcomes: GateRouteOutcome[] = [];
  for (const value of raw.outcomes) {
    if (!isRecord(value) || typeof value.status !== 'string') return null;
    if (value.status === 'unreachable') {
      if (typeof value.gateId !== 'string' || value.reason !== 'no-route') return null;
      outcomes.push({ status: 'unreachable', gateId: value.gateId, reason: 'no-route' });
      continue;
    }
    if (value.status !== 'routed') return null;
    const outcome = routedOutcome(value, request);
    if (!outcome) return null;
    outcomes.push(outcome);
  }
  return {
    requestId: request.token.requestId,
    requestVersion: request.token.requestVersion,
    provider: 'google' as const,
    outcomes,
  };
}

function safeBaseUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl?.trim()) return null;
  try {
    const parsed = new URL(baseUrl);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export class GoogleRoutesProxyClient {
  private readonly baseUrl: string | null;
  private readonly fetchImpl: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: GoogleRoutesProxyClientOptions = {}) {
    this.baseUrl = safeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async computeRoutes(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt> {
    if (!this.baseUrl) return failure('proxy-unconfigured', true);
    try {
      assertOutsideWalkingRouteRequest(request);
    } catch {
      return failure('invalid-request', false);
    }
    if (request.signal.aborted) return failure('cancelled', false);

    const controller = new AbortController();
    let externalCancelled = false;
    let timedOut = false;
    const cancel = () => {
      externalCancelled = true;
      controller.abort();
    };
    request.signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    const body: GoogleRoutesProxyRequestBody = {
      schemaVersion: 1,
      requestId: request.token.requestId,
      requestVersion: request.token.requestVersion,
      mode: 'WALK',
      origin: request.origin,
      gates: request.gates.map(({ gateId, routeTargetCoordinate }) => ({ gateId, routeTargetCoordinate })),
    };

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${GOOGLE_ROUTES_PROXY_PATH}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) return failure('rate-limited', true);
        if (response.status >= 500) return failure('provider-server-error', true);
        if (response.status >= 400) return failure('invalid-request', false);
        return failure('proxy-unavailable', true);
      }
      const candidateSet = normalizeResponse(await response.json(), request);
      if (!candidateSet) return failure('malformed-response', false);
      try {
        assertCompleteCandidateSet(request, candidateSet);
      } catch {
        return failure('malformed-response', false);
      }
      return { status: 'success', candidateSet };
    } catch {
      if (externalCancelled || request.signal.aborted) return failure('cancelled', false);
      if (timedOut) return failure('timed-out', true);
      return failure('proxy-unavailable', true);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', cancel);
    }
  }
}
