# Karachi Ijtema Offline Navigation

Offline-first React Native app for internal walking navigation inside the Karachi Ijtema ground.

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
