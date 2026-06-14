import { V2PlaceAdapter, V2Place } from '../src/services/V2PlaceAdapter';
import { RoutingDestinationV2, RoutingServiceV2, RoutingStartV2 } from '../src/services/RoutingServiceV2';

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

const startFromPlace = (place: V2Place): RoutingStartV2 => {
  if (place.sourceKind === 'block') return { type: 'block', blockId: place.id };
  if (place.sourceKind === 'gate') return { type: 'gate', gateId: place.id };
  if (place.sourceKind === 'rasta') return { type: 'rasta', rastaId: place.id };
  return { type: 'special_route', routeId: place.id };
};

const destinationFromPlace = (place: V2Place): RoutingDestinationV2 => {
  if (place.sourceKind === 'block') return { type: 'block', blockId: place.id };
  if (place.sourceKind === 'gate') return { type: 'gate', gateId: place.id };
  if (place.sourceKind === 'rasta') return { type: 'rasta', rastaId: place.id };
  return { type: 'special_route', routeId: place.id };
};

const places = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true });
const outcomes: Outcome[] = [];

for (const startPlace of places) {
  const groupedOutcomes: Outcome[] = [];

  for (const destinationPlace of places) {
    const label = `${startPlace.name} -> ${destinationPlace.name}`;

    if (startPlace.id === destinationPlace.id) {
      const outcome: Outcome = {
        label,
        status: 'SKIPPED',
        reason: 'same_origin_and_destination',
      };
      outcomes.push(outcome);
      groupedOutcomes.push(outcome);
      continue;
    }

    if (startPlace.isStartRoutable === false || startPlace.isRoutable === false) {
      const outcome: Outcome = {
        label,
        status: 'NOT ROUTABLE',
        reason: startPlace.unavailableReason ?? `${startPlace.name} is not a routable start.`,
      };
      outcomes.push(outcome);
      groupedOutcomes.push(outcome);
      continue;
    }

    if (destinationPlace.isRoutable === false) {
      const outcome: Outcome = {
        label,
        status: 'NOT ROUTABLE',
        reason: destinationPlace.unavailableReason ?? `${destinationPlace.name} is not routable.`,
      };
      outcomes.push(outcome);
      groupedOutcomes.push(outcome);
      continue;
    }

    try {
      const route = RoutingServiceV2.calculateRoute({
        start: startFromPlace(startPlace),
        destination: destinationFromPlace(destinationPlace),
      });

      if (!route) {
        const outcome: Outcome = {
          label,
          status: 'BLOCKED',
          reason: 'No graph path between start and destination.',
        };
        outcomes.push(outcome);
        groupedOutcomes.push(outcome);
        continue;
      }

      if (route.instructions.length === 0 || route.nodes.length < 2) {
        const outcome: Outcome = {
          label,
          status: 'FAIL',
          reason: 'Route returned without enough path detail.',
        };
        outcomes.push(outcome);
        groupedOutcomes.push(outcome);
        continue;
      }

      outcomes.push({
        label,
        status: 'PASS',
        reason: `${route.totalDistance}m`,
      });
    } catch (error) {
      const outcome: Outcome = {
        label,
        status: 'FAIL',
        reason: error instanceof Error ? error.message : String(error),
      };
      outcomes.push(outcome);
      groupedOutcomes.push(outcome);
    }
  }

  if (groupedOutcomes.length > 0) {
    console.log(
      JSON.stringify(
        {
          start: startPlace.name,
          outcomes: groupedOutcomes.map((outcome) => ({
            label: outcome.label,
            status: outcome.status,
            reason: outcome.reason,
          })),
        },
        null,
        2,
      ),
    );
  }
}

printSummary('test-all-routing-combinations-v2', outcomes);
