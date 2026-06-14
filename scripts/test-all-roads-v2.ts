import { IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import { IJTEMA_RASTAS } from '../src/data/ijtema/rastas';
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

const connectedGateIds = IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors
  .filter((report) => report.connected)
  .map((report) => report.gateId);

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

for (const rasta of IJTEMA_RASTAS) {
  let reachableGateCount = 0;
  let bestRoute:
    | {
        gateId: string;
        totalDistance: number;
      }
    | undefined;

  for (const gateId of connectedGateIds) {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'gate', gateId },
      destination: { type: 'rasta', rastaId: rasta.id },
    });

    if (!route) continue;

    reachableGateCount += 1;
    if (!bestRoute || route.totalDistance < bestRoute.totalDistance) {
      bestRoute = {
        gateId,
        totalDistance: route.totalDistance,
      };
    }
  }

  if (!bestRoute) {
    const outcome: Outcome = {
      label: rasta.name.en,
      status: 'BLOCKED',
      reason: 'No connected official gate reaches this rasta.',
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  const outcome: Outcome = {
    label: rasta.name.en,
    status: 'PASS',
    reason: `Reachable from ${reachableGateCount}/${connectedGateIds.length} connected gates; best start ${bestRoute.gateId} (${bestRoute.totalDistance}m).`,
  };
  outcomes.push(outcome);
  printOutcome(outcome);
}

printSummary('test-all-roads-v2', outcomes);
