import type {
  OutsideProviderAttempt,
  OutsideWalkingRouteProvider,
  OutsideWalkingRouteRequest,
} from '../../models/outsideRouting';
import {
  GoogleRoutesProxyClient,
  type GoogleRoutesProxyClientOptions,
} from './GoogleRoutesProxyClient';

export class GoogleProxyWalkingRouteProvider implements OutsideWalkingRouteProvider {
  readonly id = 'google' as const;
  private readonly client: GoogleRoutesProxyClient;

  constructor(options: GoogleRoutesProxyClientOptions = {}) {
    this.client = new GoogleRoutesProxyClient(options);
  }

  routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt> {
    return this.client.computeRoutes(request);
  }
}
