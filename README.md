# Karachi Ijtema Offline Navigation

Offline-first React Native / Expo (Android-first) app for pedestrian navigation to and inside the Karachi Ijtema ground.

- **One map-first screen.** A single MapLibre map renders a bundled OpenStreetMap-derived PMTiles basemap with the venue (blocks, gates, rastas, Shahr-e-Pindal, facilities) drawn on top. There is no Google Maps SDK, no map API key and no tile download: the map needs no network.
- **The Directory is the one place chooser.** A tap on a place means "take me here".
- **Two honest modes.** Live Navigation needs a fresh, precise GPS fix. The Route Guide works from a chosen start and destination with no location at all and never pretends to know where you are.
- **Routing works offline.** Internal pedestrian routing and the outside-venue OSM fallback run on bundled graphs. A Google walking-routes proxy is an optional, not-yet-deployed enhancement (#123).
- **Languages:** English, Roman Urdu and Urdu (right-to-left); see `src/i18n`.

Canonical branch: **`integration/ijtema-clean-baseline`** (`main` trails it; never start from `main`). Current status, test totals and open issues live in [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md), not here.

## Quick start

Requires Node 24 (CI uses 24.14.0) and, for Android, the Android SDK.

```bash
npm install                  # postinstall runs patch-package
cp .env.example .env         # optional: feature flags + optional walking-route proxy URL; no secrets
npx expo start -c            # Metro dev server
npm run android              # dev build on a device/emulator (expo run:android)
```

Dev builds fetch JavaScript from Metro, so they are not proof of offline behavior. For an offline acceptance build use a release build:

```bash
cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true   # test-signed with the public debug key; never distributable
```

More in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Common commands

```bash
npm run typecheck            # app + scripts
npm run lint
npm run test:components      # Jest (src/__tests__)
npm test                     # routing / data / contract script suite (scripts/test-*.ts)
npm run data:check           # venue-data validation + manifest drift
npm run test:offline-basemap # bundled basemap archive / provenance
```

Exact validation required before handoff, and what each suite proves: [`docs/TESTING.md`](docs/TESTING.md).

## Documentation map

| Doc | Read it for |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Shared engineering contract for every contributor and agent (governs). `CLAUDE.md` adds Claude-specific notes |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Map-first `HomeScreen`, MVVM ownership, services, stores, data flow, i18n layer |
| [`docs/PRODUCT_AND_USER_FLOWS.md`](docs/PRODUCT_AND_USER_FLOWS.md) | What the user sees and can do: Directory, Directions sheet, Route Guide vs Live Navigation, arrival, recovery, Share, settings |
| [`docs/NAVIGATION_AND_ROUTING.md`](docs/NAVIGATION_AND_ROUTING.md) | Outside-routing policy, gate selection, reroute, journey state, what is real vs external |
| [`docs/OFFLINE_MAP_AND_DATA.md`](docs/OFFLINE_MAP_AND_DATA.md) | Bundled basemap, attribution, venue data, maintenance workflow, GIS gaps |
| `docs/LOCALIZATION.md` | _(reserved: language catalogs, RTL and translation workflow; added with the localization work)_ |
| [`docs/TESTING.md`](docs/TESTING.md) | Commands, evidence levels, emulator procedure, device and field acceptance checklist |
| [`docs/DATA_PRIVACY_RETENTION.md`](docs/DATA_PRIVACY_RETENTION.md) | What is stored on the device, for how long, how to clear it |
| [`docs/RELEASE_SECURITY_PRIVACY.md`](docs/RELEASE_SECURITY_PRIVACY.md) | Secrets boundary, signing, permissions, dependency exceptions |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setup, builds, branch/worktree/PR rules, CI, adding strings |
| [`docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`](docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md) | Honest limits and what only the owner can do |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Current snapshot: baseline, open field/device/external issues |
| [`docs/adr/`](docs/adr/) | Decision records (0001: offline MapLibre renderer) |
| [`docs/audit/`](docs/audit/) | Dated historical evidence; superseded by `PROJECT_STATUS.md` where they differ |

## Evidence levels

Every verification claim carries one of: SOURCE/RUNTIME, EMULATOR, PHYSICAL DEVICE REQUIRED, FIELD REQUIRED (definitions in `AGENTS.md`). Passing Jest or typecheck is never described as device or field verification.
