# Expo consumer of the packed SDK

A tiny Expo app that uses `@muslim-ummah/offline-navigation` the way an outside app would: installed from the packed `.tgz`
(`file:./sdk.tgz`), with its own React and React Native, a stock Metro config, and nothing from this repository's source.

It is driven by `npm run test:sdk-consumer -- <fresh directory outside the repo>` from the repository root, which packs the
SDK, copies this folder next to the tarball, installs, then runs `tsc`, the Jest flows and production Android and iOS bundles.
Do not run `npm install` here: `sdk.tgz` only exists in that copy.

What the host owns, and this app shows: the venue (`demoVenue.ts`, synthetic), place names, the map (`SketchMap.tsx`, a
stand-in for MapLibre), the location service (`simulatedLocation.ts`, a stand-in for `expo-location`), language, theme and
safe area. The ready-made `NavigationScreen` owns the journey.

Not proven here: native builds, a simulator or device, a real map or real GPS. The Jest and bundle checks are JS-only.
