import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
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

for (const block of IJTEMA_BLOCKS) {
  const entryReports = IJTEMA_NAVIGATION_GRAPH_V2_REPORT.blockEntryConnectors.filter((report) => report.blockId === block.id);
  const selectedByEntry = new Map<string, Set<string>>();
  let routeCount = 0;

  for (const gateId of connectedGateIds) {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'gate', gateId },
      destination: { type: 'block', blockId: block.id },
    });

    if (!route) continue;
    routeCount += 1;

    if (!route.destinationEntryNodeId) {
      const outcome: Outcome = {
        label: `${block.name.en} / route from ${gateId}`,
        status: 'FAIL',
        reason: 'Route reached block without resolved destination entry node.',
      };
      outcomes.push(outcome);
      printOutcome(outcome);
      continue;
    }

    const selected = selectedByEntry.get(route.destinationEntryNodeId) ?? new Set<string>();
    selected.add(gateId);
    selectedByEntry.set(route.destinationEntryNodeId, selected);
  }

  for (const report of entryReports) {
    const label = `${block.name.en} / ${report.entryId}`;

    if (!report.connected) {
      const outcome: Outcome = {
        label,
        status: 'BLOCKED',
        reason: report.warning ?? 'Entry has no valid graph connector.',
      };
      outcomes.push(outcome);
      printOutcome(outcome);
      continue;
    }

    if (routeCount === 0) {
      const outcome: Outcome = {
        label,
        status: 'BLOCKED',
        reason: 'No connected official gate reaches this block.',
      };
      outcomes.push(outcome);
      printOutcome(outcome);
      continue;
    }

    const selectedGateIds = Array.from(selectedByEntry.get(report.entryId) ?? []).sort();
    if (selectedGateIds.length === 0) {
      const outcome: Outcome = {
        label,
        status: 'SKIPPED',
        reason: 'Connected entry never selected by any connected official gate route.',
      };
      outcomes.push(outcome);
      printOutcome(outcome);
      continue;
    }

    const outcome: Outcome = {
      label,
      status: 'PASS',
      reason: `Selected by ${selectedGateIds.join(', ')}.`,
    };
    outcomes.push(outcome);
    printOutcome(outcome);
  }
}

printSummary('test-block-entry-selection-v2', outcomes);
