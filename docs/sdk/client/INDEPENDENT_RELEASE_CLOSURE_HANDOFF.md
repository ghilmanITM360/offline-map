# Focused independent release-closure verification

SDK 0.1.0, 1 November 2026, issue #393. The implementation author is Codex; this handoff does **not** grant independent final acceptance. Use the delivery manifest for exact final source and CHECKSUMS for payload identities. The attached author evidence/report provides executed command logs and whole-archive SHA-256 (an archive cannot contain its own checksum).

## Review scope

- Preserve 16 original independently verified SOURCE/RUNTIME findings at `923a604be161c749bd5bf50d8fdd8c036ba4bcbb`; no SDK runtime/API, routing, pack loader, native/GIS or golden source changed.
- DELIV-01 packaging fix: `91de2d15728c4a8fae1f39827a55856a6935b04a`. Check all 12 formerly missing packfiles from both venues, not just a checkout-generated consumer. The first former omission was `assets/packs/karachi-ijtema/pack.manifest.json.packfile`.
- SUP-01 correction: `7726d9135f51f70561efbc40eb3eb3bfc4628153`. PostCSS 8.5.32 / image-size 2.0.4 published overrides preserve exact used APIs. The old ICNS parser exhausted bounded child memory; fixed ICNS/JXL reject promptly through actual Metro while a healthy PNG works. Old PostCSS read an external canary source map; fixed traversal/no-from cases reject it while normal maps/plugins work. No unsupported API adapter or local security backport.
- REG-01: original LocationsDirectoryScreen remount and DirectoryRecentManagement clear/remove scenarios passed unchanged in three focused 57-test runs and a full 222-suite / 2,367-test run. Final post-dependency full suite also passed 222 / 2,367. No timeout inflation, skipped tests or weakened assertions. Historical pressure was observed; causality remains unproven.

## Exact graph expectations

Root lock `b8b23e8003766ba4c7595a5b986372f1bc31b5a51bdeb8c059984c7a4fc781ba`:57 affected entries,6 low / 51 moderate / 0 high / 0 critical,4 distinct sources.

Consumer lock `f1ff922f8ca397475717512d8de34441427ae979c895b7f2af7ff09cb6523645`:43 entries,6 low / 37 moderate / 0 high / 0 critical,3 sources. Both audits exit 1. Raw current counts can change with advisory metadata: record observed data, not these numbers by assumption.

Every initial advisory and selected version/parent constraint is in DEPENDENCY_AUDIT_SNAPSHOT.json. Remaining sources are deepmerge/glob/minimatch,plus root-only uuid. Documented controlled-build exceptions remain conditional; engineering assessment is not external security approval. The old four patches remain shell-quote 1.12.0, node-forge 1.4.2, undici 6.29.1, source-map-js 1.2.2.

## Small sufficient reproduction

Use Node 24 on the approved Mac, existing checkout read-only and a fresh bounded consumer directory. Do not create a Git worktree/branch/clone. Preserve original evidence/reproducers. No native rebuild is needed for these packaging/tooling changes.

```sh
node scripts/sdk-package/test-bundle.mjs /absolute/final-delivery.tgz /private/tmp/fresh-sdk-review
# Enter the unpacked examples/expo-consumer, with no parent node_modules link or NODE_PATH.
npm ci --ignore-scripts --no-audit --no-fund --prefer-offline
./node_modules/.bin/tsc --noEmit -p .
./node_modules/.bin/jest --ci --runInBand --watchman=false
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform android --output-dir export-android --dump-sourcemap --max-workers 1
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform ios --output-dir export-ios --dump-sourcemap --max-workers 1
node /absolute/checkout/scripts/test-dependency-security.mjs "$PWD"
npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000
```

Expect 63 consumer tests in 6 suites, both exports exit 0, all 12packfile+PMTiles hashes exported, original shipped files/lock unchanged, all nonvirtual source-map entries resolved within the consumer, one React/RN/MapLibre and no implementation source imports/aliases. Do not inject assets or run a compiler inside the delivered app. The supplied script tests installed dependencies from the given consumer; it does not alias SDK runtime source.

Source evidence includes application/scripts typecheck, ESLint 0 errors (2 pre-existing warnings), full npmtest including 10 security checks,83 headless / 8 exports checks,2,400 differential comparisons,91,506 unchanged golden route pairs, compiled package runtime/declarations and two byte-identical SDK packs. Reviewer should confirm relevant evidence and impacted regressions, rather than reopen the whole original 17-finding audit. The archive verifier tests our trusted generated delivery; it is not a general hostile-archive extraction sandbox.

## Identity/native boundaries

SDK remains `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`. Archive/manifest/checksum identities belong to the attached final artifact record.

APK A `e59518b918b84e0db1aeb356724a603a98517538cc5c5fc65526ada23c9a257b` predates inset fix; B `bdfe5c92d9593f0661a7f10c7bf70d920aa5d86f4e3531be896aef074b1865ce` is corrected. Android 18 PASS / 2 BLOCKED spans A plus targeted B, not a full B rerun. Earlier iOS executable record belongs to 4f9a4d2 / eab28 SDK, not final d722. No physical acceptance follows from Jest/Metro/emulator evidence.

Controlled pilot remains pending independent acceptance. Production NO-GO: physical J01–J18/walking/continuous iPhone GPS, cold whole-device airplane launch, VoiceOver/TalkBack, reviewed Urdu/Roman Urdu, venue rights/Gate18–19 survey, external security, signing and authorized distribution remain owner/external gates. No external publication occurred.
