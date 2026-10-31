# Client integration checklist and independent QA

## A. Integration checklist (tick before you ship)

**Install**
- [ ] Tarball installed; `npm ls react react-native` shows one version each; no Metro aliases/resolvers for the SDK.
- [ ] `@maplibre/maplibre-react-native` 11.5.0 installed once; config plugin listed; Release build opens a map offline.
- [ ] `pmtiles` registered as a Metro asset extension; archive size and SHA-256 recorded in your own manifest.

**Data**
- [ ] A surveyed `VenueDataSource` (not `demoVenue.ts`); node coordinates inside the archive's bounds; place names reviewed.
- [ ] Attribution "© OpenStreetMap contributors" visible on the map screen (the adapter keeps it).

**Language and theme**
- [ ] Every language you ship is in `copy` (type-checked), reviewed by a native speaker; `ur` in iOS `CFBundleLocalizations`.
- [ ] `isRTL` passed to screen and theme; chevrons and alignment checked in RTL; light and dark checked.

**Location and privacy**
- [ ] Location adapter reviewed against [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §6; prompt only from the explicit Live request.
- [ ] iOS precision reader supplied (or Live is knowingly Manual-only on iOS).
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
2. Test the actual delivery archive: `node scripts/sdk-package/test-bundle.mjs /absolute/delivery.tgz /private/tmp/fresh-unpack`. This checks all 12 packfiles, pinned manifests/resources, inventory/checksums and metadata exclusion from the unpacked archive.
3. Enter that unpacked `examples/expo-consumer`. Run `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline`, `./node_modules/.bin/tsc --noEmit -p .`, and `./node_modules/.bin/jest --ci --runInBand --watchman=false` (6 suites / 63 tests). Do not run an asset generator or copy any assets into the consumer. The shipped lock, SDK and pack bytes must remain unchanged.
4. From the delivered consumer, run both real exports with `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform android --output-dir export-android --dump-sourcemap --max-workers 1`, then the equivalent `ios` command. Every nonvirtual source-map source must resolve inside this consumer; all pack asset hashes must appear in exports. No NODE_PATH, source alias, parent node_modules link or implementation import is permitted. The repository consumer driver is not a substitute for these tests.
5. Run `node /absolute/checkout/scripts/test-dependency-security.mjs /absolute/unpacked/examples/expo-consumer`; it resolves dependencies inside the supplied consumer and tests patched PostCSS plus actual Metro image parsing. Re-audit both exact locks using the command in [DEPENDENCY_ADVISORY_DISPOSITION.md](DEPENDENCY_ADVISORY_DISPOSITION.md); report nonzero audit exits and remaining low/moderate advisories truthfully.
6. REG-01: the unchanged LocationsDirectoryScreen and DirectoryRecentManagement suites use default timeouts. Implementation evidence includes three 57-test focused passes and a clean full 222-suite / 2,367-test run, plus final-source validation. Review exact raw JSON and scenario durations; do not infer physical behavior or environmental causation from these results.
7. Final routing evidence must show 2,400 differential and 91,506 unchanged golden comparisons, headless/exports/package checks and artifact reproducibility. No golden regeneration. A reviewer can choose relevant impacted checks rather than redo the original 17-finding audit.

## C. Owner/client gates before distribution

- [ ] Accept the documented build-input operating conditions and obtain independent security acceptance for the final lock/binary.
- [ ] Review all 12 packfiles plus shared PMTiles hashes against pins; confirm two-venue isolation and default refusal of imported/remote packs.
- [ ] Confirm the current artifact manifest/source commit; distinguish historical APK A from corrected B and the earlier iOS simulator package.
- [ ] Complete physical J01–J18, walking GPS/continuous iPhone updates, whole-device cold airplane launch, VoiceOver/TalkBack, reviewed Urdu/Roman Urdu, venue data rights, supported Gate 18/19 survey, signing and authorized distribution.
