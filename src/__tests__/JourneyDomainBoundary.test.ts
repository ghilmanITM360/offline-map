// B2b: the shared journey domain must stay headless. Static import/clock scan plus direct domain calls.
import fs from 'fs';
import path from 'path';
import { evaluateLocationCapability } from '../../packages/offline-navigation/src/domain/journey/LocationCapability';
import { evaluateNavigationStart, resolveStartActionKind } from '../../packages/offline-navigation/src/domain/journey/NavigationStartPolicy';
import { consumeIntent, decideAutoLive, retireIntent } from '../../packages/offline-navigation/src/domain/journey/DestinationJourneyPolicy';

const DOMAIN = path.join(__dirname, '../../packages/offline-navigation/src/domain');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
const files = walk(DOMAIN);

describe('shared domain stays headless', () => {
  test('imports only relative domain modules (no react, expo, zustand, host src, i18n)', () => {
    for (const file of files) {
      const specs = [...fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        expect({ file: path.relative(DOMAIN, file), spec, ok: spec.startsWith('./') || spec.startsWith('../') }).toMatchObject({ ok: true });
        const resolved = path.resolve(path.dirname(file), spec);
        expect({ file: path.relative(DOMAIN, file), spec, inside: resolved.startsWith(DOMAIN) }).toMatchObject({ inside: true });
      }
    }
  });

  test('journey and geo modules never read the wall clock or randomness', () => {
    for (const file of files.filter((f) => /\/(journey|geo)\//.test(f))) {
      expect({ file, hit: /Date\.now|new Date\(|Math\.random|performance\.now/.test(fs.readFileSync(file, 'utf8')) }).toMatchObject({ hit: false });
    }
  });
});

describe('domain decisions run with plain data and an injected clock', () => {
  const NOW = 5_000_000;
  const fix = { latitude: 24.9, longitude: 67, accuracy: 10, observedAtMs: NOW - 1_000 };
  const permission = { granted: true, canAskAgain: true, precision: 'fine' as const, servicesState: 'enabled' as const };

  test('capability + auto-live + start gate agree on a fresh precise fix and flip together on expiry', () => {
    for (const [now, live] of [[NOW, true], [NOW + 29_001, false]] as const) {
      const cap = evaluateLocationCapability({ permission, liveFix: fix, nowMs: now });
      expect(decideAutoLive({ isNavigating: false, servicesState: 'enabled', capabilityMode: cap.mode })).toBe(live ? 'eligible' : 'ineligible');
      expect(evaluateNavigationStart({ startSource: 'live_gps', coordinate: fix, precision: 'fine', nowMs: now }).canStart).toBe(live);
      expect(resolveStartActionKind({ startSource: 'live_gps', liveFix: fix, permission: { granted: true, precision: 'fine' }, nowMs: now }).kind)
        .toBe(live ? 'start' : 'use_location');
    }
  });

  test('intent transitions are pure: inputs are not mutated and stale ids are refused', () => {
    const intent = Object.freeze({ id: 3, destinationId: 'A', autoLive: 'eligible' as const });
    expect(consumeIntent(intent, 2)).toBeNull();
    expect(consumeIntent(null, 3)).toBeNull();
    expect(consumeIntent(intent, 3)).toEqual({ id: 3, destinationId: 'A', autoLive: 'consumed' });
    expect(retireIntent({ ...intent, autoLive: 'consumed' }, 3)).toBeNull();
    expect(retireIntent(intent, 3)?.autoLive).toBe('consumed');
    expect(intent.autoLive).toBe('eligible');
  });
});
