import type { OutsideRouteRequestToken } from '../../models/outsideRouting';

export interface OutsideRouteRequestHandle {
  token: OutsideRouteRequestToken;
  signal: AbortSignal;
  canCommit(): boolean;
  finish(): void;
}

export interface OutsideRouteRequestCoordinatorOptions {
  requestIdFactory?: () => string;
}

let generatedRequestSequence = 0;

function defaultRequestId(): string {
  generatedRequestSequence += 1;
  const createdAt = Date.now().toString(36);
  return `outside-${createdAt}-${generatedRequestSequence.toString(36)}`;
}

export class OutsideRouteRequestCoordinator {
  private readonly requestIdFactory: () => string;
  private active: { key: string; controller: AbortController; handle: OutsideRouteRequestHandle } | null = null;
  private requestVersion = 0;

  constructor(options: OutsideRouteRequestCoordinatorOptions = {}) {
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestId;
  }

  begin(requestKey: string): OutsideRouteRequestHandle {
    if (this.active?.key === requestKey && !this.active.controller.signal.aborted) return this.active.handle;
    this.cancelCurrent();
    this.requestVersion += 1;
    const controller = new AbortController();
    const token = {
      requestId: this.requestIdFactory(),
      requestVersion: this.requestVersion,
    };
    let handle: OutsideRouteRequestHandle;
    handle = {
      token,
      signal: controller.signal,
      canCommit: () => this.active?.handle === handle && !controller.signal.aborted,
      finish: () => {
        if (this.active?.handle === handle) this.active = null;
      },
    };
    this.active = { key: requestKey, controller, handle };
    return handle;
  }

  cancelCurrent(): void {
    this.active?.controller.abort();
    this.active = null;
  }
}
