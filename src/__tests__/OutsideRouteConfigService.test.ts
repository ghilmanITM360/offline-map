import { readFileSync } from 'node:fs';
import { resolveOutsideRouteMobileConfig } from '../services/outsideRouting/OutsideRouteConfigService';

describe('outside route mobile configuration', () => {
  test('clean environment keeps Google proxy optional and uses bounded timeout', () => {
    expect(resolveOutsideRouteMobileConfig({})).toEqual({
      googleProxyBaseUrl: undefined,
      googleProxyTimeoutMs: 4_000,
      enableGoogleDiagnosticProxy: false,
    });
  });

  test('reads only mobile-safe proxy URL and does not define a web-service credential', () => {
    const config = resolveOutsideRouteMobileConfig({
      EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL: ' https://routing.example.test/ ',
    });
    expect(config.googleProxyBaseUrl).toBe('https://routing.example.test/');
    expect(config.enableGoogleDiagnosticProxy).toBe(false);
    expect(config).not.toHaveProperty('apiKey');
    expect(config).not.toHaveProperty('credential');
  });

  test('requires the exact explicit diagnostic opt-in', () => {
    expect(resolveOutsideRouteMobileConfig({
      EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL: 'https://routing.example.test',
      EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC: 'true',
    }).enableGoogleDiagnosticProxy).toBe(true);
    expect(resolveOutsideRouteMobileConfig({
      EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC: '1',
    }).enableGoogleDiagnosticProxy).toBe(false);
  });

  test('.env.example enables OSM street routing and leaves proxy deployment optional', () => {
    const entries = Object.fromEntries(
      readFileSync('.env.example', 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    expect(entries.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH).toBe('true');
    expect(entries).toHaveProperty('EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL', '');
    expect(entries.EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC).toBe('false');
    expect(Object.keys(entries)).not.toContain('EXPO_PUBLIC_GOOGLE_ROUTES_API_KEY');
  });
});
