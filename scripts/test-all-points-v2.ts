import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_CENTRAL_POINTS } from '../src/data/ijtema/centralPoints';
import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

type OutcomeStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'NOT ROUTABLE';

interface Outcome {
  label: string;
  status: OutcomeStatus;
  reason: string;
}

interface BatchSummary {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  notRoutable: number;
}

const printOutcome = (outcome: Outcome): void => {
  console.log(`${outcome.status} ${outcome.label}: ${outcome.reason}`);
};

const printSummary = (name: string, outcomes: Outcome[]): void => {
  const summary: BatchSummary = {
    total: outcomes.length,
    pass: outcomes.filter((outcome) => outcome.status === 'PASS').length,
    fail: outcomes.filter((outcome) => outcome.status === 'FAIL').length,
    blocked: outcomes.filter((outcome) => outcome.status === 'BLOCKED').length,
    skipped: outcomes.filter((outcome) => outcome.status === 'SKIPPED').length,
    notRoutable: outcomes.filter((outcome) => outcome.status === 'NOT ROUTABLE').length,
  };

  console.log(JSON.stringify({ name, ...summary }, null, 2));

  if (summary.fail > 0) {
    process.exitCode = 1;
  }
};

const outcomes: Outcome[] = [];

for (const point of IJTEMA_CENTRAL_POINTS) {
  const coordinate = {
    latitude: point.coordinate.lat,
    longitude: point.coordinate.lng,
  };
  const startResolution = EntryGateRoutingService.resolveRouteStartForUser(coordinate);

  if (startResolution.mode !== 'inside') {
    const outcome: Outcome = {
      label: point.name.en,
      status: 'FAIL',
      reason: `Expected inside start mode but got ${startResolution.mode}.`,
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  if (startResolution.candidateNodes[0] !== point.id) {
    const outcome: Outcome = {
      label: point.name.en,
      status: 'FAIL',
      reason: `Expected snap to ${point.id} but got ${startResolution.candidateNodes[0] ?? 'none'}.`,
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  let reachableBlockCount = 0;
  let bestRoute:
    | {
        blockId: string;
        totalDistance: number;
      }
    | undefined;

  for (const block of IJTEMA_BLOCKS) {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'inside_coordinate', coordinate },
      destination: { type: 'block', blockId: block.id },
    });

    if (!route) continue;

    reachableBlockCount += 1;
    if (!bestRoute || route.totalDistance < bestRoute.totalDistance) {
      bestRoute = {
        blockId: block.id,
        totalDistance: route.totalDistance,
      };
    }
  }

  if (!bestRoute) {
    const outcome: Outcome = {
      label: point.name.en,
      status: 'BLOCKED',
      reason: 'Inside graph point could not reach any block.',
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  const outcome: Outcome = {
    label: point.name.en,
    status: 'PASS',
    reason: `Reachable blocks ${reachableBlockCount}/${IJTEMA_BLOCKS.length}; shortest route -> ${bestRoute.blockId} (${bestRoute.totalDistance}m).`,
  };
  outcomes.push(outcome);
  printOutcome(outcome);
}

printSummary('test-all-points-v2', outcomes);
