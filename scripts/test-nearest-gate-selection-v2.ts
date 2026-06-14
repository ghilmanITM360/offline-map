import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';
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

  if (!gate.coordinate) {
    const outcome: Outcome = {
      label,
      status: 'NOT ROUTABLE',
      reason: gateUnavailableReason(gate.id),
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  const coordinate = {
    latitude: gate.coordinate.lat,
    longitude: gate.coordinate.lng,
  };
  const nearestGate = EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser(gate.coordinate);
  const resolvedStart = EntryGateRoutingService.resolveRouteStartForUser(coordinate, { forceOutside: true });

  if (!connectorReport?.connected) {
    if (nearestGate?.id === gate.id || resolvedStart.gate?.id === gate.id) {
      const outcome: Outcome = {
        label,
        status: 'FAIL',
        reason: 'Disconnected gate was selected as nearest official entry gate.',
      };
      outcomes.push(outcome);
      printOutcome(outcome);
      continue;
    }

    const outcome: Outcome = {
      label,
      status: 'BLOCKED',
      reason: `${connectorReport?.warning ?? 'No valid graph connector for this gate.'} Selected ${resolvedStart.gate?.name.en ?? nearestGate?.name.en ?? 'no alternative gate'} instead.`,
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  if (nearestGate?.id !== gate.id) {
    const outcome: Outcome = {
      label,
      status: 'FAIL',
      reason: `Nearest gate helper selected ${nearestGate?.id ?? 'none'} instead of ${gate.id}.`,
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  if (
    resolvedStart.startType !== 'nearest_official_gate' ||
    resolvedStart.gate?.id !== gate.id ||
    resolvedStart.candidateNodes[0] !== gate.id
  ) {
    const outcome: Outcome = {
      label,
      status: 'FAIL',
      reason: `Outside start resolver returned ${resolvedStart.gate?.id ?? 'none'} / ${resolvedStart.startType}.`,
    };
    outcomes.push(outcome);
    printOutcome(outcome);
    continue;
  }

  const outcome: Outcome = {
    label,
    status: 'PASS',
    reason: 'Outside nearest-gate helper resolves this connected gate to itself.',
  };
  outcomes.push(outcome);
  printOutcome(outcome);
}

printSummary('test-nearest-gate-selection-v2', outcomes);
