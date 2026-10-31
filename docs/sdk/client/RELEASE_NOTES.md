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
- `arrivalBottomInset` (new, optional, defaults to `bottomInset`): the arrival sheet is a Modal that draws under the Android navigation bar, so a host whose own bar clears the system bar (and passes `bottomInset={0}`) needs a separate inset for it. Found on the Android emulator: the sample's Done button was overlapped by the three-button bar.
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

### Changes after the independent audit (same 0.1.0 candidate)

- **Live safety:** overlapping foreground resumes, replayed or out-of-order GPS fixes, reentrant subscriber commands and a slow one-step Live start can no longer leak a watcher, revive a lost signal, crash or commit a stale fix; an outside route must start at the walker and end at the chosen destination.
- **Packs:** a pointer write that fails after it committed no longer deletes the active pack; malformed pointers delete nothing and `repairPointer()` rebuilds from verified directories; the committed manifest and files are re-verified before activation; the Node reference adapter never follows a link.
- **Routing:** any opaque node id routes (including `toString`); cheapest weighted route even with discounted edges (`heuristicScale` is exported); admissible but inconsistent estimates stay optimal; duplicate seed ids and shared street connectors keep their own costs. Published routes are unchanged.
- **Platform:** a recovered map load clears the unavailable warning; iOS VoiceOver gets GPS-loss, recovery, reroute and instruction announcements (`useSafetyAnnouncements`, optional `copy.live.gpsRecovered`); the arrival card stacks its buttons and scrolls at large text.
- **Supply chain:** the tarball carries the Apache-2.0 `LICENSE`; the delivery bundle ships a resolved consumer `package-lock.json` and a generated dependency/licence inventory; four advisory packages were patched inside their declared ranges.
- Details: [../CODEX_AUDIT_REMEDIATION.md](../CODEX_AUDIT_REMEDIATION.md). Corrected Android APK B has targeted arrival-inset emulator evidence. The aggregate historical 18 PASS / 2 BLOCKED spans pre-fix APK A plus targeted B checks; it is not a complete rerun on B. Physical-device acceptance remains pending. See [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) for full hashes and the earlier iOS artifact boundary.

### Release closure — 1 November 2026

- Packaging correction `91de2d15728c4a8fae1f39827a55856a6935b04a`: ships all 12 authoritative compiler-generated pack assets; archive-level regression checks actual unpacked contents, pins, checksums and AppleDouble exclusion. The example delivery includes the real Karachi and synthetic demo packs; venue data is not embedded in the SDK tarball itself.
- Exact PostCSS 8.5.32 and image-size 2.0.4 build-tool overrides address six advisory sources without upgrading Expo/RN/MapLibre or changing native product code. Both deliberately exceed their parents' old ranges; bounded real-Metro/parser/API regressions and final standalone production exports validate compatibility. Remaining low/moderate build-tool risks are documented, not hidden by audit suppression.
- The original REG-01 scenarios passed three unchanged focused runs and a full 222-suite / 2,367-test regression. No scenario, assertion or timeout was weakened. Historical host-pressure causation remains unproven; final post-dependency validation is separately recorded.
- SDK runtime/API, navigation safety fixes, pack trust/refusal policy, Karachi connectivity, PMTiles and routing goldens remain unchanged. SDK SHA-256 stays `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`.
- This implementation session authored the release corrections. Focused independent final acceptance and external/device/field gates remain pending; no unrestricted production GO is claimed.

### Known issues

See [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) §Known limitations.
