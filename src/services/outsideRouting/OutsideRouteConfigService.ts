export const DEFAULT_GOOGLE_PROXY_TIMEOUT_MS = 4_000;

export interface OutsideRouteMobileConfig {
  googleProxyBaseUrl: string | undefined;
  googleProxyTimeoutMs: number;
}

export function resolveOutsideRouteMobileConfig(
  environment: Readonly<Record<string, string | undefined>>,
): OutsideRouteMobileConfig {
  const configuredUrl = environment.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL?.trim();
  return {
    googleProxyBaseUrl: configuredUrl || undefined,
    googleProxyTimeoutMs: DEFAULT_GOOGLE_PROXY_TIMEOUT_MS,
  };
}
