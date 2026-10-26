# Release notes and changelog

## 0.1.0 (release candidate, private)

### Included

- Headless engine: offline A\* and a multi-venue graph contract, route steps, route progress with a continuity window, location
  capability rules, `NavigationController` (Manual Guide, explicit Live, GPS-loss handling, guarded reroute, latched arrival),
  `NavigationSession` (one trip's lifetime).
- Offline pack manifest parser/verifier and pack manager (staging, atomic activation, rollback, recovery, pinning) over injected ports; incremental
  SHA-256 (`createSha256`, `sha256Hex`), a filesystem-backed `PackStore` over a small `PackFileSystem` port (`createFileSystemPackStore`), and
  `parsePackVenueData` (graph and place files to a `VenueDataSource`).
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

### Added with the pack platform integration (C5)

- `scripts/sdk-pack/compile.ts`: deterministic pack compiler. `scripts/sdk-pack/karachi.ts`: the real `karachi-ijtema@1.0.0` pack (tracked
  PMTiles archive, the repository's V2 graph, places, gates and names), byte-reproducible and pinned. Gates 18/19 stay unconnected.
- Node and Expo `PackFileSystem` adapters; a pack-driven Expo consumer (two bundled packs, startup order install → recover → open, journey
  pin, on-device pack self-test). Imported/remote packs remain refused (no signing scheme or key exists).

### Added in the final fix cycle (C6; Jest, iOS simulator and Android emulator evidence)

- **Large text:** from a system font scale of 1.3 the directory heading scrolls with its list and the Manual Guide's Previous / Next and Live's End navigation are pinned under the scrolling content; headings cap at 1.8x. Found and fixed on the iPhone at AX5: stacked step buttons used `flex: 1` in a column and collapsed, so the large text overflowed onto the rows below.
- **Appearance:** `theme.colorScheme` and a local dark basemap (`BASEMAP_COLORS_DARK`, `DEFAULT_MAP_COLORS_DARK`, no network reference) that restyle the map in place (no remount, no camera move). The sample app has System / Light / Dark.
- **Entry-gate chooser** inside `NavigationScreen` (optional `copy.entryGate`; driven by the outside-route provider's gates; Gates 18/19 never appear).
- **Camera browsing:** a deliberate pan or zoom while Live stops the follow; Recenter, a new route or phase follows again.
- **Faster, still byte-exact verification:** a leaner SHA-256 (about 30% faster under Hermes) and an optional `digestFile` port (the example uses `expo-crypto`): warm start of the two sample packs 1,460 ms → about 200 ms on the iOS simulator.
- `bottomInset` now applies to the panel as well as the arrival sheet; `RouteGuideCard` is split into `RouteGuideStep`, `RouteGuideStepper`, `RouteGuideLinks` (the card is unchanged).
- Sample app: language picker (reviewed-pending Urdu / Roman Urdu), appearance picker, `expo-system-ui`, startup measurement tool.

### Fixed during native acceptance (all covered by tests)

- Map adapter reserved the panel's height twice, shrinking the route to a speck on Android (default bottom padding 300 → 56).
- RTL double flipping: bidi-mirrored chevron glyphs replaced by drawn, `ltr`-pinned icons; `textAlign` no longer paired with an RTL
  `writingDirection`.
- iOS Urdu Dynamic Type hang (B7R-3F): JS-level `Text` re-key; preserved.

### Not included

- Venue data, tiles and place names. Reviewed Urdu / Roman Urdu copy.
- Street routing itself. Outside-venue routing is an injected `OutsideRouteProvider` (the SDK validates and tracks the host's route). The
  Ijtema host still has its own navigation authority and does **not** yet delegate to this controller (see `docs/sdk/C4_PARITY_MATRIX.md`).
- Pack signing (an Ed25519 verifier, keys, rotation), archive extraction, download/import and a delivery channel. Imported/remote packs are
  therefore not accepted anywhere; only packs shipped inside the app, pinned by manifest digest, are used.
- Background location, speech/voice instructions (the Ijtema host's *Voice instructions* switch is not part of the SDK), a gesture-detent bottom sheet.
- A published registry package, signing or notarisation. Nothing was published or delivered externally.

### Known issues

See [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) §Known limitations.
