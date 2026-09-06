import { evaluateArrivalFixV2, sanitizeArrivalAccuracyM } from '../services/V2NavigationRuntimeService';
import { ARRIVAL_THRESHOLD_METERS } from '../constants/navigation';

// Pure-function deterministic matrix for the arrival accuracy policy (fast-path <=15,
// moderate-path (15,25] requires two consecutive qualifying fixes, >25 never qualifies).
// Exercises the exact boundary/invalid values called out in the NEW-04 acceptance brief
// without needing a rendered hook for each case — evaluateArrivalFixV2/sanitizeArrivalAccuracyM
// are the same pure functions NavigationViewModelV2's real per-fix effect calls.
describe('V2 arrival accuracy policy (pure)', () => {
  const withinThreshold = 10;
  const outsideThreshold = ARRIVAL_THRESHOLD_METERS + 50;

  function evaluate(accuracyM: number | undefined | null, distanceM: number, hasPendingCorroboration: boolean) {
    return evaluateArrivalFixV2({
      distanceToDestinationM: distanceM,
      accuracyM: sanitizeArrivalAccuracyM(accuracyM),
      hasPendingCorroboration,
      arrivalThresholdM: ARRIVAL_THRESHOLD_METERS,
    });
  }

  test.each([15, 10, 1])('fast-path accuracy=%d arrives on a single fix', (accuracy) => {
    expect(evaluate(accuracy, withinThreshold, false)).toEqual({ arrived: true, pendingCorroboration: false });
  });

  test.each([16, 20, 25])('moderate-path accuracy=%d needs two consecutive qualifying fixes', (accuracy) => {
    expect(evaluate(accuracy, withinThreshold, false)).toEqual({ arrived: false, pendingCorroboration: true });
    expect(evaluate(accuracy, withinThreshold, true)).toEqual({ arrived: true, pendingCorroboration: false });
  });

  test.each([26, 90, 1000])('accuracy=%d beyond the moderate ceiling never arrives, even with corroboration', (accuracy) => {
    expect(evaluate(accuracy, withinThreshold, false)).toEqual({ arrived: false, pendingCorroboration: false });
    expect(evaluate(accuracy, withinThreshold, true)).toEqual({ arrived: false, pendingCorroboration: false });
  });

  test.each([undefined, null, 0, -1, -50, NaN, Infinity])(
    'invalid accuracy=%p sanitizes to Infinity and never qualifies, even with corroboration',
    (accuracy) => {
      expect(sanitizeArrivalAccuracyM(accuracy as number | undefined | null)).toBe(Infinity);
      expect(evaluate(accuracy as number | undefined | null, withinThreshold, false)).toEqual({
        arrived: false,
        pendingCorroboration: false,
      });
      expect(evaluate(accuracy as number | undefined | null, withinThreshold, true)).toEqual({
        arrived: false,
        pendingCorroboration: false,
      });
    },
  );

  test('a fast-path-accuracy fix outside the arrival radius does not qualify', () => {
    expect(evaluate(10, outsideThreshold, false)).toEqual({ arrived: false, pendingCorroboration: false });
  });
});
