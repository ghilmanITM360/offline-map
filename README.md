# Karachi Ijtema Offline Navigation

Offline-first React Native app for internal walking navigation inside the Karachi Ijtema ground.

## Current documentation

Start with [Project Status](docs/PROJECT_STATUS.md) for actual readiness and remaining gates. Phase A stabilization is incomplete; SDK/Muslim Ummah work has not started.

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Approved user journey](docs/PRODUCT_AND_USER_FLOWS.md)
- [Offline basemap](docs/OFFLINE_BASEMAP.md) and [routing](docs/OFFLINE_NAVIGATION_AND_ROUTING.md)
- [Persistence and recovery](docs/DATA_RETENTION.md)
- [Executed UX-01–28 evidence](docs/UX_ACCEPTANCE_EVIDENCE.md)
- [Security boundaries](docs/RELEASE_SECURITY_PRIVACY.md) and [dependency triage](docs/DEPENDENCY_SECURITY_STATUS.md)
- [Known limitations and owner actions](docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md)

Translations live in `src/i18n/messages`; views use `useI18n`, with English/Roman Urdu LTR and Urdu RTL. Add every key to all three catalogs; catalog completeness and hardcoded-string ratchet tests guard regressions. Whole journey localization/accessibility is still unfinished.

Required source checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:components -- --runInBand`, `git diff --check`. Routing changes also require the four commands in [AGENTS.md](AGENTS.md). Source tests do not certify native GPS, device accessibility or venue walking.

## Map

The map is fully offline: MapLibre renders a vector basemap bundled in the app (no Google Maps SDK, no API key, no network). See `docs/OFFLINE_BASEMAP.md` and `docs/adr/0001-offline-visual-map-renderer.md`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Optional: create a local env file (only feature flags and the optional walking-route proxy URL live here; no secrets):

```bash
cp .env.example .env
```

## Run Development Server

```bash
npx expo start -c
```

## Native builds

After native config changes, rebuild Android:

```bash
npx expo prebuild --clean
npx expo run:android
```

For an offline acceptance build use a release build (a debug build fetches JavaScript from Metro):

```bash
cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true
```
