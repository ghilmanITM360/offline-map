# Client integration checklist and independent QA

## A. Integration checklist (tick before you ship)

**Install**
- [ ] Delivery archive checksum and `CHECKSUMS.txt` verified; both tarballs installed; `npm ls react react-native` shows one version each; no Metro aliases/resolvers for the SDK.
- [ ] `@maplibre/maplibre-react-native` 11.5.0 installed once; the SDK plugin (`"@muslim-ummah/offline-navigation"`) is the only location/MapLibre plugin entry; Release build opens a map offline.
- [ ] `metro.config.js` uses `withOfflineNavigation` (registers `pmtiles` and `packfile`); archive size and SHA-256 recorded in your pack.
- [ ] On Android, RN is 0.81.5 or `androidFontScaleFix` is knowingly `false`.

**Data**
- [ ] A surveyed venue compiled with `venue-pack compile` (not `examples/synthetic-venue`, not `demoVenue.ts`); `verify --pin` passes on the machine that ships it; node coordinates inside the archive's bounds; place names reviewed; no warnings left unexplained (`--strict`).
- [ ] Attribution "© OpenStreetMap contributors" visible on the map screen (the adapter keeps it).

**Language and theme**
- [ ] Every language you ship is in `copy` (type-checked), reviewed by a native speaker (the shipped Urdu / Roman Urdu are drafts); `ur` in the plugin's `languages`.
- [ ] `isRTL` passed to screen and theme; chevrons and alignment checked in RTL; light and dark checked.

**Location and privacy**
- [ ] Location adapter reviewed against [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §6; prompt only from the explicit Live request.
- [ ] `@muslim-ummah/ios-location-precision` installed and passed as `readIOSPrecision` (or Live is knowingly Manual-only on iOS).
- [ ] Foreground only: no Always strings, no background modes, no background location permission.
- [ ] Android manifest reviewed (`blockedPermissions`; decide about `INTERNET` for an app with no network features).

**Lifecycle**
- [ ] Controller created once, `dispose()`d by the host; `lifecycle` wired to `AppState`.
- [ ] Safe-area insets used; system-bar icons visible; last controls clear the Android navigation bar.

**Acceptance still required from you**
- [ ] Physical iOS and Android devices; real walking with real GPS inside the venue (inside and at the edges).
- [ ] Whole-device airplane mode with a cold start (no network at any point).
- [ ] VoiceOver and TalkBack passes; AX5 / font scale 2.0 on small screens.
- [ ] Venue field survey (graph accuracy, entrances, gates) — the SDK cannot certify your data.

## B. Focused independent verification of release closure

The original 16 SOURCE/RUNTIME findings passed independent retest at `923a604be161c749bd5bf50d8fdd8c036ba4bcbb`. Their SDK runtime source is unchanged; reopen only if a relevant change warrants it. Release closure was implemented by Codex, so its author-side results are not independent approval. Use the exact source/artifact identities and commands in the final handoff.

1. Preserve original audits/reproducers. Review only the packaging correction, dependency disposition/overrides and REG-01 evidence. Do not create a worktree/branch/clone or repeat native builds for packaging/tooling-only changes.
2. Test the actual delivery archive: `node scripts/sdk-package/test-bundle.mjs /absolute/delivery.tgz /private/tmp/fresh-unpack`. It reads the archive with the raw TAR parser (so metadata entries that `tar -t` hides are seen), requires exactly the declared files with correct sizes and SHA-256, checks all 12 packfiles and pinned manifests, and runs the shipped venue tool on the shipped example.
3. For the full independent-client run, use `node scripts/sdk-package/client-acceptance.mjs /absolute/delivery.tgz /private/tmp/fresh-client <archive sha256>`. It unpacks only the archive outside any repository, then does what [QUICK_START.md](QUICK_START.md) says: compile the synthetic venue with the shipped tool, `npm ci` the example from its shipped lock, run a headless journey on the client-compiled pack, type-check, run the example's Jest suites, prebuild both native projects through the plugin, reject invalid plugin options, add the compiled pack to the app, and export Android and iOS production bundles containing it. Do not run an asset generator or copy any assets into the example by hand.
4. By hand, in the unpacked `examples/expo-consumer`: `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline`, `npm run typecheck`, `npm test` (the suites and tests are counted in the run output). Then `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm run export:android -- --max-workers 1` and `export:ios`. Every nonvirtual source-map source must resolve inside this example; all pack asset hashes must appear in the exports. No NODE_PATH, source alias, parent node_modules link or implementation import is permitted.
5. Run `node /absolute/checkout/scripts/test-dependency-security.mjs /absolute/unpacked/examples/expo-consumer`; it resolves dependencies inside the supplied consumer and tests patched PostCSS plus actual Metro image parsing. Re-audit both exact locks using the command in [DEPENDENCY_ADVISORY_DISPOSITION.md](DEPENDENCY_ADVISORY_DISPOSITION.md); report nonzero audit exits and remaining low/moderate advisories truthfully.
6. REG-01: the unchanged LocationsDirectoryScreen and DirectoryRecentManagement suites use default timeouts. Implementation evidence includes three 57-test focused passes and a clean full 222-suite / 2,367-test run, plus final-source validation. Review exact raw JSON and scenario durations; do not infer physical behavior or environmental causation from these results.
7. Final routing evidence must show 2,400 differential and 91,506 unchanged golden comparisons, headless/exports/package checks and artifact reproducibility. No golden regeneration. A reviewer can choose relevant impacted checks rather than redo the original 17-finding audit.

## C. Owner/client gates before distribution

- [ ] Accept the documented build-input operating conditions and obtain independent security acceptance for the final lock/binary.
- [ ] Review all 12 packfiles plus shared PMTiles hashes against pins; confirm two-venue isolation and default refusal of imported/remote packs.
- [ ] Confirm the current artifact manifest/source commit; distinguish historical APK A from corrected B and the earlier iOS simulator package.
- [ ] Complete physical J01–J18, walking GPS/continuous iPhone updates, whole-device cold airplane launch, VoiceOver/TalkBack, reviewed Urdu/Roman Urdu, venue data rights, supported Gate 18/19 survey, signing and authorized distribution.
