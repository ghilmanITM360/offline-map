import assert from 'node:assert/strict';

import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

type OutcomeStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'NOT ROUTABLE';

interface Outcome {
  gateId: string;
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

assert.equal(
  IJTEMA_GATES.find((gate) => gate.id === 'GATE_19')?.connectorStatus,
  'ground_truth_required',
  'Gate 19 must remain blocked pending physical ground truth',
);

for (const gate of IJTEMA_GATES) {
  const label = gate.name.en;
  const connectorReport = gateConnectorById.get(gate.id);

  if (gate.routingStatus !== 'routable' || !gate.coordinate) {
    const outcome: Outcome = {
      gateId: gate.id,
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
      gateId: gate.id,
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
      gateId: gate.id,
      label,
      status: 'FAIL',
      reason: 'Gate is graph-connected but no reachable block was found.',
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  const outcome: Outcome = {
    gateId: gate.id,
    label,
    status: 'PASS',
    reason: `Reachable blocks ${reachableCount}/${IJTEMA_BLOCKS.length}; shortest route -> ${bestRoute.blockId} (${bestRoute.totalDistance}m).`,
  };
  outcomes.push(outcome);
  printOutcome(outcome);
}

assert.deepEqual(
  outcomes.filter((outcome) => outcome.status === 'PASS').map((outcome) => outcome.gateId).sort(),
  [
    'GATE_01',
    'GATE_02',
    'GATE_03',
    'GATE_04',
    'GATE_05',
    'GATE_07',
    'GATE_08',
    'GATE_12',
    'GATE_13',
    'GATE_14',
    'GATE_15',
    'GATE_16',
    'GATE_17',
    'GATE_20',
    'GATE_21',
    'GATE_22',
  ],
  'Only the exact approved gate set may pass routing regression',
);

assert.deepEqual(
  outcomes.filter((outcome) => outcome.status === 'BLOCKED').map((outcome) => outcome.gateId).sort(),
  ['GATE_18', 'GATE_19'],
  'Only Gates 18 and 19 may remain blocked',
);

assert.deepEqual(
  outcomes.filter((outcome) => outcome.status !== 'PASS' && outcome.status !== 'BLOCKED'),
  [],
  'Every supplied gate must be accounted for by the exact PASS or BLOCKED set',
);

printSummary('test-all-gates-v2', outcomes);
