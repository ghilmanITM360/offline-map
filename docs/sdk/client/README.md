# Muslim Ummah Offline Navigation SDK — client guide (release candidate)

`@muslim-ummah/offline-navigation` 0.1.0 is a private, unsigned React Native package for **offline walking navigation inside a
venue**: routing over the venue's own graph, a Manual Guide that needs no GPS, explicit Live navigation from the user's real
position, reroute and arrival handling, a ready-made screen, and an optional offline MapLibre map. It ships no venue data, no
tiles, no network client and no analytics.

> **Status: release candidate with outstanding acceptance.** Everything below was verified in Jest, plain Node, Metro production
> bundles and on one iOS simulator and one Android emulator. **No physical device, real-GPS walk, whole-device airplane-mode run or
> field survey has been done.** See [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) before shipping.

## What you get

| Entry point | Needs | What it is |
| --- | --- | --- |
| `@muslim-ummah/offline-navigation` | nothing (plain JS) | Headless domain: `createNavigationController`, offline A\*, route steps, route progress, location-capability rules, pack manifest/manager. No React, no React Native, no GPS or clock of its own. |
| `@muslim-ummah/offline-navigation/ui` | React, React Native | `NavigationProvider`, hooks, the ready-made `NavigationScreen`, leaf cards, `createDefaultNavigationTheme`, optional `ENGLISH_NAVIGATION_SCREEN_COPY`, the iOS-safe `Text`. |
| `@muslim-ummah/offline-navigation/maplibre` | + `@maplibre/maplibre-react-native` 11.x | `createMapLibreNavigationMap`: the offline basemap + route + walker map for `NavigationScreen`. Only app that install MapLibre should import it. |
| `@muslim-ummah/offline-navigation/session` | nothing | `createNavigationSession` (one trip's lifetime guard). |
| `@muslim-ummah/offline-navigation/app.plugin.js` | Expo (build time) | The single Expo config plugin: foreground location, MapLibre, languages, and the two Android settings the journey needs. Listed in `app.json` as `"@muslim-ummah/offline-navigation"`. |
| `@muslim-ummah/offline-navigation/metro` | Metro (build time) | `withOfflineNavigation(config)`: registers the basemap and venue-pack file types as assets. |

Companion library: `@muslim-ummah/ios-location-precision` (a tiny Expo native module that reads iOS full/reduced accuracy; needed only for iOS Live). Client tool: `tools/venue-pack/venue-pack.cjs` ([VENUE_PACK_TOOL.md](VENUE_PACK_TOOL.md)).

Peers: `react >=19.1.0`, `react-native >=0.81.0`, optional `@maplibre/maplibre-react-native >=11.5.0 <12`. The SDK never bundles
React, React Native or MapLibre; your app owns exactly one copy of each.

## What the host owns (the SDK deliberately does not)

The venue (`VenueDataSource`), place names (`describePlace`), all copy and translations, the theme, safe areas and system bars,
the basemap file and its installation, the location adapter (permission, precision, fixes), the app-lifecycle adapter and the
lifetime of the controller. The SDK decides the journey; you supply the world.

## Start here

[QUICK_START.md](QUICK_START.md) is the one onboarding path: verify the delivery, install, apply the native configuration, compile your venue pack, configure
location, mount the screen, build, run an offline journey. The working app is [`examples/expo-consumer`](../../../examples/expo-consumer) (it installs the packed
`.tgz` files and nothing else); an invented venue to practise on is [`examples/synthetic-venue`](../../../examples/synthetic-venue). Then run the checklist:
[CLIENT_CHECKLIST_AND_QA.md](CLIENT_CHECKLIST_AND_QA.md).

## Document map

- [QUICK_START.md](QUICK_START.md) — the eight-step path.
- [VENUE_PACK_TOOL.md](VENUE_PACK_TOOL.md) — build and verify your venue pack; input layout, spec, checks, errors.
- [API_REFERENCE.md](API_REFERENCE.md) — controller, provider/hooks, screen, theme, copy, map adapter.
- [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) — Expo development build, bare React Native iOS and Android, MapLibre and offline basemap, location/GPS adapters and permissions.
- [LOCALIZATION_THEME_RTL.md](LOCALIZATION_THEME_RTL.md) — languages, RTL, light/dark/system, font scaling, accessibility.
- [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md) — complete draft Urdu and Roman Urdu wording for every screen string, its source, and what a native speaker must still review.
- [ERRORS_RECOVERY_TROUBLESHOOTING.md](ERRORS_RECOVERY_TROUBLESHOOTING.md) — every blocker/error state and what to do; known traps.
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) — exact versions that were exercised.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — what 0.1.0 contains and does not.
- [CLIENT_CHECKLIST_AND_QA.md](CLIENT_CHECKLIST_AND_QA.md) — client checklist and independent QA instructions.
- [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) — evidence by level, security notes, known limitations, go/no-go.
- [DEPENDENCY_ADVISORY_DISPOSITION.md](DEPENDENCY_ADVISORY_DISPOSITION.md) — every npm advisory: reachability, patch, decision.
- [LICENSES_AND_NOTICES.md](LICENSES_AND_NOTICES.md) — licence text, notices, third-party inventory, data rights.
- [RELEASE_SIGNING_AND_DISTRIBUTION.md](RELEASE_SIGNING_AND_DISTRIBUTION.md) — delivery vs publishing vs host signing; the debug-signed sample APK.
- [../CODEX_AUDIT_REMEDIATION.md](../CODEX_AUDIT_REMEDIATION.md) — independent-audit findings, fixes and retest instructions.
- [../OFFLINE_PACK_SPEC.md](../OFFLINE_PACK_SPEC.md) — offline venue-pack manifest and recovery rules.

© OpenStreetMap contributors: the sample basemap is derived from OpenStreetMap (ODbL). Keep the attribution visible; the map
adapter does.
