# Release notes and changelog

## 0.1.0 client-delivery candidate 2 (private; supersedes `delivery-21d1ed4`, whose files are kept as history)

Same SDK version and the same executable navigation source as `21d1ed40` (routing, controller, UI and map code are unchanged: the 91,506 golden and 2,400 differential comparisons
are untouched). What changed is everything around them that a client touches:

- **Venue pack tool** `tools/venue-pack/venue-pack.cjs` (`compile`, `verify`, `app-assets`) and the invented `examples/synthetic-venue`: a client builds a verified pack without our
  repository. Reuses the repository's deterministic compiler; adds graph/place checks, friendly errors, checksums and a pin file ([VENUE_PACK_TOOL.md](VENUE_PACK_TOOL.md)).
- **One Expo config plugin** (`"@muslim-ummah/offline-navigation"`) and a **Metro helper** (`…/metro`), replacing the four hand-copied pieces (the Android config-changes and font-layout
  plugins, the expo-location and MapLibre plugin entries, the language declarations, the Metro asset line). Two new package exports: `./app.plugin.js` and `./metro`. The Android
  font fix still refuses any React Native other than 0.81.5.
- **`@muslim-ummah/ios-location-precision`**: the iOS accuracy reader is now an installable package (same Swift code as before) instead of a folder to copy.
- **Complete draft Urdu and Roman Urdu** for all 89 screen strings (26 host-shipped, 63 SDK-team drafts), with automated placeholder, script, completeness and fallback checks.
  Still pending native-speaker review; not production translations.
- **Delivery archive**: written by a pure-Node deterministic TAR writer (no AppleDouble or PAX metadata, fixed order, owner, mode and time) and audited with a raw TAR parser; the
  archive is named for its source commit and records the one it supersedes.
- **Verification**: the delivered archive was unpacked outside any repository and exercised end to end (`client-acceptance.mjs`: venue tool, `npm ci`, headless journey, 63 consumer tests, plugin prebuild for both platforms, four production exports including a client-compiled pack); an Android release build of the delivered example ran a full offline journey on the emulator. iOS native build was blocked on the build machine (see the compatibility matrix).
- **Documentation**: [QUICK_START.md](QUICK_START.md), [VENUE_PACK_TOOL.md](VENUE_PACK_TOOL.md); corrected package-reproduction command (`npm run pack:sdk -- <dir>`, not `npm pack`);
  bare React Native steps written out and marked not natively validated.

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
- Exact PostCSS 8.5.32 and Metro 0.83.8 build-tool overrides address six advisory sources without upgrading Expo/RN/MapLibre or changing native product code. Both deliberately exceed their parents' old ranges; bounded real-Metro/parser/API regressions and final standalone production exports validate compatibility. Remaining low/moderate build-tool risks are documented, not hidden by audit suppression.
- The original REG-01 scenarios passed three unchanged focused runs and a full 222-suite / 2,367-test regression. No scenario, assertion or timeout was weakened. Historical host-pressure causation remains unproven; final post-dependency validation is separately recorded.
- SDK runtime/API, navigation safety fixes, pack trust/refusal policy, Karachi connectivity, PMTiles and routing goldens remain unchanged. SDK SHA-256 stays `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`.
- This implementation session authored the release corrections. Focused independent final acceptance and external/device/field gates remain pending; no unrestricted production GO is claimed.

### Known issues

See [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md) §Known limitations.

## 0.1.1 (candidate 3, private; source and Jest evidence unless stated)

- Pack: optional `venue-geometry` and `place-catalog` resources (manifest still version 1; old packs load unchanged). The Karachi preset pack is `karachi-ijtema@1.1.0` (internal only); the synthetic pack is `synthetic-demo-venue@1.1.0`. Karachi `1.0.0` and its pin are unchanged.
- Safety: the venue-data checker now fails swapped, `(0, 0)`, non-finite and out-of-venue coordinates (bounds are the venue's own), checks translations per place, and separates errors, warnings and review items.
- Blocks: corners are geometry; the four corner-derived graph nodes are labelled `LEGACY_UNVERIFIED` access aliases; no verified entrance exists yet. The destination marker is the block centre and the route end is a separate, labelled marker.
- Gates 18 and 19 stay known but unreachable: the SDK explains this in English, Urdu and Roman Urdu (draft) instead of drawing a route. No connector was invented.
- Intake: `venue-pack import` and `merge` (Excel, CSV, GeoJSON) in front of the unchanged compiler.
- Copy: 24 new strings (draft Urdu and Roman Urdu, not reviewed); the original 89 are unchanged. Three of them belong to the arrival fix below.
- Native-acceptance fixes (found on the Android emulator and iOS simulator): (1) arrival at a block-edge destination no longer says "You have arrived at Block N": the final step and the arrival card say the walker reached the edge of the block, which is not a verified entrance (optional copy `routeStep.arriveAtEdge`, `arrival.provisionalTitle`, `arrival.provisionalSubtitle`); (2) a destination that can never be routed to (Gate 18/19, a place with no location) now offers no "Navigate with my location" and no "Try again", only the explanation.
- Not done here: no field survey exists, so no tent, ilaqa or facility has a location and no access point is verified; native Android and iOS acceptance of this candidate is recorded in the delivery report with its exact status.
