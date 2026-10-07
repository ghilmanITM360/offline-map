# Development

Local setup, builds, the contribution rules and CI. `AGENTS.md` is the governing contract for every contributor, human or AI; this file is the how-to. Verification commands and evidence levels: [`TESTING.md`](TESTING.md).

## Setup

```bash
npm install                  # Node 24 (CI pins 24.14.0); postinstall runs patch-package
cp .env.example .env         # optional; only feature flags and the optional walking-route proxy URL, no secrets
npx expo start -c            # Metro
```

`.env` is gitignored (only `.env.example` is tracked) and is loaded by `app.config.js`. Never put a secret, a signing credential or a Google Routes credential in `.env` or any `EXPO_PUBLIC_*` variable (`RELEASE_SECURITY_PRIVACY.md`). Variables read by the app:

| Variable | Default | Effect |
|---|---|---|
| `EXPO_PUBLIC_USE_IJTEMA_V2_MAP` / `_ROUTING` / `_NAVIGATION` | on when unset | V2 runtime; `false` is the emergency v1 rollback path |
| `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH` | on when unset | Road-following outside leg over the bundled street graph (else beeline gate selection) |
| `EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL` | empty | Optional walking-routes proxy base URL (proxy not deployed, #123) |
| `EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC` | `false` | Adds the proxy leg ahead of OSM/direct guide only when `true` |
| `EXPO_PUBLIC_OFFLINE_MAP_POC` | unset | `1` mounts the isolated MapLibre POC harness instead of the app (development only) |

## Build and run on Android

The map uses a native MapLibre module, so the app needs a native build, not Expo Go. The `android/` project is committed (the checked-in manifest is the source of truth for permissions); after native config changes rebuild it:

```bash
npx expo prebuild --clean    # only when native config changes; review the android/ diff, the committed project carries hand edits
npm run android              # expo run:android: debug build, JavaScript from Metro (not offline proof)
```

Release build for acceptance (JavaScript bundled, works offline):

```bash
cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true                                       # all ABIs (APK: android/app/build/outputs/apk/release/app-release.apk)
cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true -PreactNativeArchitectures=arm64-v8a   # arm64 only, faster
```

`npm run android:release:apk`, `android:install:release` and `android:release:aab` are the same Gradle tasks without the opt-out flag, so they refuse to run until a production keystore is configured. The insecure flag signs with the public debug key: testing only, never distributable. After integration, build a fresh release APK from the intended final commit and record its commit, build command, timestamp and SHA-256 (on the tracking issue) before device testing; ignore old APK/build outputs. iOS has never been built or run.

## Rules (from `AGENTS.md`)

- **Canonical branch is `integration/ijtema-clean-baseline`; `main` trails it.** Verify `git status --short --branch` and HEAD before starting; PRs target the canonical branch.
- **One isolated branch and worktree per task**: verify source ref, target branch, target path and `git worktree list` first; do not modify a dirty integration worktree while implementing isolated work.
- **Issue-first, plan-first, skill-first**: work traces to an issue; non-trivial changes get a short plan; use a relevant skill instead of improvising its process.
- **One concern per PR.** No bundled cleanups, dependency bumps or drive-by refactors.
- **Stage explicit paths and make focused commits**; no generated files or unrelated local changes. Do not push, merge, rebase, reset, clean, delete branches/worktrees or run other destructive git operations without owner approval.
- **No guessing:** no fabricated GIS (gate coordinates, graph edges, distances), no fabricated legal text, no fake signing/cloud state.
- **Evidence levels:** label every verification claim SOURCE/RUNTIME, EMULATOR, PHYSICAL DEVICE REQUIRED or FIELD REQUIRED, and never claim higher than you ran.
- Keep provider ordering and complete-route cost out of Views and ViewModels; Views render and forward actions only (`ARCHITECTURE.md`).
- Documentation: update the doc that owns the topic in the same PR as the behavior; keep status numbers only in `PROJECT_STATUS.md`.

## CI

`.github/workflows/canonical-checks.yml` runs on every PR to, and push to, the canonical branch: `npm ci`, `npm run test:walking-proxy`, `npm run typecheck`, `npm run lint`, `npm run test:components`, `npm test`, then `git diff --check origin/<base>...HEAD`. It is SOURCE-level only: no emulator, device or field check, and it never substitutes for them. A skipped job means an earlier step failed. The whitespace step needs the PR branch to contain the base tip (it reports "no merge base" otherwise): merge the canonical branch into the PR branch. Whether a red run blocks merge depends on repository branch protection, which the owner controls.

## Adding or changing user-visible text

All user-facing copy lives in the localization catalogs, one file per area in `src/i18n/messages/` (`about`, `arrival`, `common`, `directions`, `directory`, `drawer`, `errors`, `help`, `map`, `navigation`, `onboarding`, `place`, `places`, `recovery`, `routeGuide`, `settings`). To add a string:

1. Add the key `<area>.<name>` to the area file under **all three** locales (`en`, `ur-Latn` Roman Urdu, `ur` Urdu script). A missing locale is a TypeScript error. Use `{name}` placeholders (identical in every locale) and, for counts, define `<key>_one` and `<key>_other` and call `tn(key, count)`.
2. A new area is a new file using `defineMessages`, registered in `MESSAGE_AREAS` in `src/i18n/messages/index.ts`. A key may exist in only one area.
3. In a component use `const { t } = useI18n()` (so it re-renders on language change); in non-React code use `t()` from `src/i18n`. Do not interpolate with template strings; pass params.
4. Run the guards:

```bash
node --import tsx scripts/hardcoded-strings.ts        # lists user-visible English still hard-coded in source, per file
npx jest src/__tests__/Localization.test.ts src/__tests__/HardcodedStrings.test.ts
```

`HardcodedStrings.test.ts` fails if any file exceeds its count in `src/__tests__/hardcodedStrings.baseline.json`. After moving a string into a catalog, lower the baseline with `node --import tsx scripts/hardcoded-strings.ts --write` (it must only ever go down). Do not translate venue names ad hoc: `src/i18n/venueNames.ts` is the seam. Shared plain-language route sentences live in `src/utils/routeCopy.ts`; `UserFacingCopyGuard.test.ts` keeps developer jargon (flag names, provider ids) out of user copy.

## Working on data

Venue data and the street graph have a validated, hash-pinned maintenance flow: [`OFFLINE_MAP_AND_DATA.md`](OFFLINE_MAP_AND_DATA.md) (`npm run data:check`, `npm run data:manifest`). The basemap is rebuilt with `scripts/offline-map/` (`brew install osmium-tool tippecanoe pmtiles`; same doc).
