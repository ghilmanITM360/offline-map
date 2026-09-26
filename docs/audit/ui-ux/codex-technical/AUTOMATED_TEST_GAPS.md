# Automated Test Coverage and Gaps

## Commands executed

All commands ran against `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:components -- --runInBand` | PASS: 55 suites, 597 tests, 0 snapshots |
| `npm test` | PASS: all configured script suites |
| `npm run test:all-gates-v2` | PASS assertions: 18 cases, 16 passed, 2 explicitly BLOCKED for Gate 18/19 physical truth |
| `npm run test:outside-street-gate-selection-cost-v2` | PASS |
| `npm run test:core-provider-routing-contract-v2` | PASS; emitted Gate 01 sanity-cap warning |
| `npm run test:reroute-v2` | PASS |

## Coverage classes

- Pure utilities/services: extensive Jest and script coverage for routing graph, geometry, search, configuration, persistence and provider ordering.
- ViewModels: focused coverage exists for Home, Directions, navigation GPS freshness/progress/reroute identity/arrival reset, Permission and overlays.
- Components: 55-suite Jest set covers Home, LocationSheet, Directory rows/screen, map labels, layers, navigation chrome/layers and outside-route UI.
- Integration-like source scripts: many `scripts/test-*.ts` suites inspect cross-module contracts and exercise route data.
- Emulator tests: no committed automated emulator suite was found. This audit uses manual trusted-build emulator evidence.
- Physical-device/field tests: none found as executable automated tests; Gate 18/19 are correctly marked blocked by scripts.

## Material gaps

1. No rendered component test found for Welcome, Permission screen, Download Map, Settings, Help, About or App Guide.
2. No direct test found for CustomDrawer, LocationTutorialTooltip, UserLocationMarker or ErrorBoundary.
3. Source/Jest checks do not verify Android TalkBack utterances, focus traversal, dynamic live-region announcements, real touch geometry, IME behavior, or scaled-font clipping.
4. Current-location tests mock Expo Location; they do not prove Android emulator `geo fix` reaches the Expo subscription.
5. Reroute scripts/ViewModel tests verify algorithms and state transitions, not genuine native GPS delivery on an unmodified APK.
6. Route-preview component tests do not establish Google Maps SDK rendering, key restriction behavior, or actual bottom-sheet composition on Android.
7. Arrival/reset tests verify state logic; full start→walk→arrival→Done→second journey remains runtime dependent.
8. Several source-contract scripts are regex/static checks. Passing them can become misleading if interpreted as rendered behavior.
9. Test run warnings: overlapping React `act()` warnings in CameraManager tests; expected Splash unmount warnings; missing Jest map key/env logs; Node-only scripts log AsyncStorage `window is not defined` hydration fallback while still passing.
10. Routing advisory: 26 street edges exceed the 250 m human-review threshold; assertions pass, but the warning remains data-review evidence, not a runtime failure.

Passing automation is classified `AUTOMATED TEST VERIFIED`, never emulator/device/field verified.
