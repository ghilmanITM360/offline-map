// Headless checks for the navigation controller: the real compiled domain, in plain Node, on the synthetic venue.
import { strict as assert } from 'node:assert';
import { createNavigationController, type RouteFinder } from '../../packages/offline-navigation/src/domain/navigation';
import { findBestVenuePath } from '../../packages/offline-navigation/src/domain/venue';
import { createSyntheticVenue } from './syntheticVenue';

export const navigationChecks = async (asyncCheck: (name: string, fn: () => void | Promise<void>) => Promise<void>): Promise<void> => {
  const venue = createSyntheticVenue();

  await asyncCheck('navigation controller: destination, manual origin, route, Manual Guide steps and Exit run in plain Node', () => {
    const c = createNavigationController({ venue });
    c.selectDestination('annex');
    assert.equal(c.getState().presentation, 'NEEDS_START');
    c.selectOrigin('lobby');
    const ready = c.getState();
    assert.equal(ready.presentation, 'MANUAL_GUIDE_READY');
    assert.deepEqual(ready.route?.steps.map((s) => s.kind), ['depart', 'turn_right', 'arrive']);
    assert.equal(c.startGuide(), true);
    assert.equal(c.nextStep(), true);
    assert.equal(c.getState().stepIndex, 1);
    c.exit();
    assert.equal(c.getState().phase, 'browsing');
    assert.equal(c.getState().route, null);
  });

  await asyncCheck('navigation controller: a result that arrives after Exit never commits', async () => {
    let settle: (() => void) | undefined;
    const findRoute: RouteFinder = ({ graph, startIds, goalIds }) =>
      new Promise((resolve) => { settle = () => resolve(findBestVenuePath(graph, startIds, goalIds)); });
    const c = createNavigationController({ venue, findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    assert.equal(c.getState().loadState, 'loading');
    c.exit();
    settle!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(c.getState().phase, 'browsing');
    assert.equal(c.getState().route, null);
  });

  await asyncCheck('navigation controller: hostile place ids are state, never exceptions', () => {
    const c = createNavigationController({ venue });
    for (const id of ['__proto__', 'constructor', 'toString', '']) {
      c.selectDestination(id);
      assert.equal(c.getState().error, 'unknown_place');
      assert.equal(c.getState().phase, 'browsing');
    }
  });
};
