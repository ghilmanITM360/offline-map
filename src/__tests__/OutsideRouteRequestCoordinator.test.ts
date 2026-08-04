import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';

describe('OutsideRouteRequestCoordinator', () => {
  test('new request aborts previous and only latest handle may commit', () => {
    const ids = ['request-a', 'request-b'];
    const coordinator = new OutsideRouteRequestCoordinator({ requestIdFactory: () => ids.shift() ?? 'extra' });

    const first = coordinator.begin('destination-a');
    const second = coordinator.begin('destination-b');

    expect(first.signal.aborted).toBe(true);
    expect(first.canCommit()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.canCommit()).toBe(true);
    expect(first.token).toEqual({ requestId: 'request-a', requestVersion: 1 });
    expect(second.token).toEqual({ requestId: 'request-b', requestVersion: 2 });
  });

  test('repeated active request key coalesces instead of creating uncontrolled work', () => {
    const idFactory = jest.fn(() => 'request-one');
    const coordinator = new OutsideRouteRequestCoordinator({ requestIdFactory: idFactory });
    const first = coordinator.begin('same-input');
    const second = coordinator.begin('same-input');

    expect(second).toBe(first);
    expect(idFactory).toHaveBeenCalledTimes(1);
    expect(first.signal.aborted).toBe(false);
  });

  test('cancel and finish prevent later state commits', () => {
    const coordinator = new OutsideRouteRequestCoordinator({ requestIdFactory: () => 'opaque-request' });
    const cancelled = coordinator.begin('cancelled');
    coordinator.cancelCurrent();
    expect(cancelled.signal.aborted).toBe(true);
    expect(cancelled.canCommit()).toBe(false);

    const finished = coordinator.begin('finished');
    expect(finished.canCommit()).toBe(true);
    finished.finish();
    expect(finished.canCommit()).toBe(false);
  });

  test('request identity contains no coordinate or request-key text', () => {
    const coordinator = new OutsideRouteRequestCoordinator({ requestIdFactory: () => 'opaque-42' });
    const handle = coordinator.begin('24.9600,67.0100:GATE_05');
    expect(handle.token.requestId).toBe('opaque-42');
    expect(handle.token.requestId).not.toContain('24.9600');
    expect(handle.token.requestId).not.toContain('GATE_05');
  });
});
