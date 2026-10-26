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

Peers: `react >=19.1.0`, `react-native >=0.81.0`, optional `@maplibre/maplibre-react-native >=11.5.0 <12`. The SDK never bundles
React, React Native or MapLibre; your app owns exactly one copy of each.

## What the host owns (the SDK deliberately does not)

The venue (`VenueDataSource`), place names (`describePlace`), all copy and translations, the theme, safe areas and system bars,
the basemap file and its installation, the location adapter (permission, precision, fixes), the app-lifecycle adapter and the
lifetime of the controller. The SDK decides the journey; you supply the world.

## Five-minute path

1. Install the tarball and peers: [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md).
2. Copy the working app in [`examples/expo-consumer`](../../../examples/expo-consumer) (it installs the packed `.tgz`, nothing from
   this repository).
3. Replace the synthetic venue with your surveyed `VenueDataSource` and your basemap archive.
4. Run the integration checklist: [CLIENT_CHECKLIST_AND_QA.md](CLIENT_CHECKLIST_AND_QA.md).

## Document map

- [API_REFERENCE.md](API_REFERENCE.md) — controller, provider/hooks, screen, theme, copy, map adapter.
- [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) — Expo development build, bare React Native iOS and Android, MapLibre and offline basemap, location/GPS adapters and permissions.
- [LOCALIZATION_THEME_RTL.md](LOCALIZATION_THEME_RTL.md) — languages, RTL, light/dark/system, font scaling, accessibility.
- [ERRORS_RECOVERY_TROUBLESHOOTING.md](ERRORS_RECOVERY_TROUBLESHOOTING.md) — every blocker/error state and what to do; known traps.
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) — exact versions that were exercised.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — what 0.1.0 contains and does not.
- [CLIENT_CHECKLIST_AND_QA.md](CLIENT_CHECKLIST_AND_QA.md) — client checklist and independent QA instructions.
- [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) — evidence by level, security notes, known limitations, go/no-go.
- [../OFFLINE_PACK_SPEC.md](../OFFLINE_PACK_SPEC.md) — offline venue-pack manifest and recovery rules.

© OpenStreetMap contributors: the sample basemap is derived from OpenStreetMap (ODbL). Keep the attribution visible; the map
adapter does.
