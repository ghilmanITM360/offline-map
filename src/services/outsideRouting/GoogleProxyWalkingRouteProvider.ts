import type {
  OutsideProviderAttempt,
  OutsideWalkingRouteProvider,
  OutsideWalkingRouteRequest,
} from '../../models/outsideRouting';
import {
  GoogleRoutesProxyClient,
  type GoogleRoutesProxyClientOptions,
} from './GoogleRoutesProxyClient';
import { resolveOutsideRouteMobileConfig } from './OutsideRouteConfigService';

export class GoogleProxyWalkingRouteProvider implements OutsideWalkingRouteProvider {
  readonly id = 'google' as const;
  private readonly client: GoogleRoutesProxyClient;

  constructor(options: GoogleRoutesProxyClientOptions = {}) {
    const mobileConfig = resolveOutsideRouteMobileConfig({
      EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL: process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL,
      EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC,
    });
    this.client = new GoogleRoutesProxyClient({
      ...options,
      baseUrl: options.baseUrl ?? mobileConfig.googleProxyBaseUrl,
      timeoutMs: options.timeoutMs ?? mobileConfig.googleProxyTimeoutMs,
    });
  }

  routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt> {
    return this.client.computeRoutes(request);
  }
}
