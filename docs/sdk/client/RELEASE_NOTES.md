# Release notes and changelog

## 0.1.0 (release candidate, private)

### Included

- Headless engine: offline A\* and a multi-venue graph contract, route steps, route progress with a continuity window, location
  capability rules, `NavigationController` (Manual Guide, explicit Live, GPS-loss handling, guarded reroute, latched arrival),
  `NavigationSession` (one trip's lifetime).
- Offline pack manifest parser/verifier and pack manager (staging, atomic activation, rollback, recovery, pinning) over injected ports.
- React Native UI: `NavigationProvider` and hooks, ready-made `NavigationScreen`, leaf cards, default light/dark theme with drawn
  icons, optional English copy, the iOS-safe `Text`.
- `/maplibre`: offline PMTiles map adapter (basemap, venue places, route, markers, walker, framing, follow, recenter, fallback,
  OSM attribution).
- Independent Expo consumer app and the driver that proves the packed artifact installs, type-checks, renders and bundles.

### Added after the C4 parity audit (source and Jest evidence only)

- `prepareLive()` / `confirmLive()` / `cancelLive()`: the host's candidate-route-then-Start flow, with a fresh-fix and 20 m drift check on
  confirm; `<NavigationScreen reviewLiveRoute>` (default on). `requestLive()` is unchanged.
- `OutsideRouteProvider` (outside-venue start and reroute, entry gate selection, direct guides never Live), `requestReroute()`, and a
  fresh-fix request on `resume()`. New blocker `route_outdated` (the copy contract gains `route_outdated`, `upgrade.preview`, `upgrade.start`).

### Fixed during native acceptance (all covered by tests)

- Map adapter reserved the panel's height twice, shrinking the route to a speck on Android (default bottom padding 300 → 56).
- RTL double flipping: bidi-mirrored chevron glyphs replaced by drawn, `ltr`-pinned icons; `textAlign` no longer paired with an RTL
  `writingDirection`.
- iOS Urdu Dynamic Type hang (B7R-3F): JS-level `Text` re-key; preserved.

### Not included

- Venue data, tiles and place names. Reviewed Urdu / Roman Urdu copy.
- Street routing itself. Outside-venue routing is an injected `OutsideRouteProvider` (the SDK validates and tracks the host's route). The
  Ijtema host still has its own navigation authority and does **not** yet delegate to this controller (see `docs/sdk/C4_PARITY_MATRIX.md`).
- Pack platform adapters (SHA-256 reader, filesystem `PackStore`, extraction, compiler, Ed25519 verifier), signing keys and a
  delivery channel. Imported/remote packs are therefore not accepted anywhere.
- Background location, speech/voice instructions, a dark basemap, a gesture-detent bottom sheet, `GateChooser` composition.
- A published registry package, signing or notarisation. Nothing was published or delivered externally.

### Known issues

See [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) §Known limitations.
