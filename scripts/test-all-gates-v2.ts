import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';

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

const gateConnectorById = new Map(
  IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors.map((report) => [report.gateId, report]),
);

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

const gateUnavailableReason = (gateId: string): string => {
  const place = V2PlaceAdapter.getPlaceById(gateId, { includeUnavailableGates: true });
  return place?.unavailableReason ?? `${gateId} is not routable.`;
};

const outcomes: Outcome[] = [];

for (const gate of IJTEMA_GATES) {
  const label = gate.name.en;
  const connectorReport = gateConnectorById.get(gate.id);

  if (gate.routingStatus !== 'routable' || !gate.coordinate) {
    const outcome: Outcome = {
      label,
      status: 'NOT ROUTABLE',
      reason: gateUnavailableReason(gate.id),
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  if (!connectorReport?.connected) {
    const outcome: Outcome = {
      label,
      status: 'BLOCKED',
      reason: connectorReport?.warning ?? 'No valid graph connector for this gate.',
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  let reachableCount = 0;
  let bestRoute:
    | {
        blockId: string;
        totalDistance: number;
      }
    | undefined;

  for (const block of IJTEMA_BLOCKS) {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'gate', gateId: gate.id },
      destination: { type: 'block', blockId: block.id },
    });

    if (!route) continue;

    reachableCount += 1;
    if (!bestRoute || route.totalDistance < bestRoute.totalDistance) {
      bestRoute = {
        blockId: block.id,
        totalDistance: route.totalDistance,
      };
    }
  }

  if (!bestRoute) {
    const outcome: Outcome = {
      label,
      status: 'FAIL',
      reason: 'Gate is graph-connected but no reachable block was found.',
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  const outcome: Outcome = {
    label,
    status: 'PASS',
    reason: `Reachable blocks ${reachableCount}/${IJTEMA_BLOCKS.length}; shortest route -> ${bestRoute.blockId} (${bestRoute.totalDistance}m).`,
  };
  outcomes.push(outcome);
  printOutcome(outcome);
}

printSummary('test-all-gates-v2', outcomes);
