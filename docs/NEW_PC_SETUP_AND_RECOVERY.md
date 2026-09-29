# New-PC Setup and Recovery

How to resume this project on a fresh computer from GitHub alone. Written 2026-09-29 for the migration off the original development Mac. Versions below are what that machine actually had; the repo pins none of Node, JDK or the Android SDK, so a different version is untested, not forbidden.

Status facts live in `docs/PROJECT_STATUS.md`. The AI continuation brief is `docs/AI_CONTINUATION_HANDOFF.md`. Engineering rules are `AGENTS.md`.

## A. Clone and authenticate

The repository is **private** (`ghilmanITM360/offline-map`); its default branch is the canonical `integration/ijtema-clean-baseline`.

```bash
gh auth login          # or configure a git credential with repo scope
git clone https://github.com/ghilmanITM360/offline-map.git
cd offline-map
git status --short --branch   # expect: integration/ijtema-clean-baseline
```

## B. Fetch every branch you need

```bash
git fetch origin --prune
git branch -r
```

| Work | Remote branch | PR |
|---|---|---|
| NAV-004 V1 background-resume GPS | `fix/nav-004-v1-resume-freshness` | #172 |
| Android 12+ splash pin | `fix/android12-splash-pin` | #173 |
| #139 process-death tests + design | `test/139-process-death-characterization` | #174 |
| #115 evidence-ledger reconciliation | `docs/115-evidence-ledger-reconciliation` | #175 |
| Physical-device checklist | `docs/device-acceptance-checklist` | #176 |
| Download Map WIP snapshot (do not merge) | `wip/download-map-preserved-for-pc-migration` | #178 (draft) |
| This guide + AI handoff | `docs/new-pc-migration-handoff` | draft |

Resume one with an isolated worktree (AGENTS.md: one worktree per task):

```bash
git worktree add ../offline-map-nav004 origin/fix/nav-004-v1-resume-freshness
cd ../offline-map-nav004 && git switch -c fix/nav-004-v1-resume-freshness --track origin/fix/nav-004-v1-resume-freshness
```

The Download Map snapshot is based on `0aef45d`, not on canonical, so its PR shows as conflicting. It is a backup: canonical already contains a completed superset. Read PR #178 before touching it.

## C. Toolchain (versions on the original machine)

| Tool | Version used |
|---|---|
| Node.js / npm | 25.2.1 / 11.6.2 (no `engines`, `.nvmrc` or `.tool-versions` in the repo) |
| JDK | OpenJDK 17.0.19 (Homebrew `openjdk@17`) on `PATH`; `JAVA_HOME` unset. JDK 26 was also installed but was not what the recorded builds used |
| Gradle | 8.14.3 (wrapper, `android/gradle/wrapper/gradle-wrapper.properties`); do not install Gradle separately |
| Android SDK | `~/Library/Android/sdk`; platforms `android-34`, `android-36`; build-tools 34.0.0, 35.0.0, 36.0.0, 36.1.0, 37.0.0; NDK `27.1.12297006` |
| Expo / React Native / React | `expo ~54.0.34` / `react-native 0.81.5` / `react 19.1.0` |
| Reanimated / Worklets | `react-native-reanimated ~4.1.1` / `react-native-worklets 0.5.1` |
| Native config | New Architecture on, Hermes on (`android/gradle.properties`) |
| Emulator used | AVD `Ijtema_API_36_Play` (API 36) |

`ANDROID_HOME` was not set globally; it was passed on the build command. Set it (or write `sdk.dir` into `android/local.properties`, which is git-ignored) on the new machine:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"        # macOS default; adjust per OS
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

## D. Install dependencies

```bash
npm ci        # uses package-lock.json; do not use `npm install` for a verification run
```

Do not reuse a copied `node_modules`. A stale one was seen missing `expo-asset` and broke the HomeScreen Jest suites. In a new git worktree run `npm ci` there, or symlink to a freshly installed copy.

## E. Configuration files (all git-ignored, none are in GitHub)

| File | Needed for | Content |
|---|---|---|
| `.env` (or `.env.local`) | Maps rendering in a build | copy from `.env.example` |
| `android/local.properties` | Gradle finding the SDK | `sdk.dir=<path to your Android SDK>` |

`.env.example` documents these variable names: `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`, `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH`, `EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL`, `EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC`.

- **Google Maps Android key: must be transferred or re-created out of band.** The original machine has a real key in `.env` and `.env.local`. Never put it in Git, a PR, an issue, chat or a release. Move it with a password manager, or create a new key in Google Cloud Console restricted to package `com.aicrafted.karachiijtema` and the signing-certificate SHA-1 you will use (see `docs/RELEASE_SECURITY_PRIVACY.md`). It is client-visible by design, so restrict it; it must not be reused for Google Routes.
- **Google Routes proxy:** only a base URL belongs in the mobile app (`EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL`). The proxy is not deployed (#123). No Routes credential exists or belongs on the phone.
- **Signing:** the only keystore in the project is the public Android debug keystore already tracked at `android/app/debug.keystore`. **No production keystore or upload key exists on the old machine**, so there is nothing to transfer; production signing is owner task #48.
- The recorded testing APK was built with no Maps key (manifest key slot empty), and V2 navigation does not need one.

## F. Validation (run before any handoff, per AGENTS.md)

```bash
npm run typecheck
npm run lint
npm test
npm run test:components -- --runInBand
git diff --check
# routing changes additionally:
npm run test:all-gates-v2
npm run test:outside-street-gate-selection-cost-v2
npm run test:core-provider-routing-contract-v2
npm run test:reroute-v2
```

Measured totals per commit are in `docs/AI_CONTINUATION_HANDOFF.md`; do not reuse a total on a commit where you did not measure it.

## G. Build a standalone testing APK

Release bundle, no Metro, debug-signed. Testing only; not Play-signable.

```bash
cd android
ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew assembleRelease -PallowInsecureReleaseSigning=true
# output: android/app/build/outputs/apk/release/app-release.apk
shasum -a 256 app/build/outputs/apk/release/app-release.apk
```

The earlier full build from a clean tree took about 7 minutes. Record commit, command, time and checksum with the APK (AGENTS.md). Do not commit APKs. Reanimated 4.1.x clean builds depend on the `libworklets.so` mirror already merged via PR #165.

Install and check on an emulator or phone:

```bash
adb install -r app-release.apk            # first install pass: adb uninstall com.aicrafted.karachiijtema first
adb shell am start -n com.aicrafted.karachiijtema/.MainActivity
```

## H. Retrieve the latest tested APK

A private pre-release holds the last verified APK (canonical `4b17fcb`, **without** PRs #172–#176):

```bash
gh release download testing-apk-4b17fcb --pattern '*.apk'
shasum -a 256 karachi-ijtema-4b17fcb-debugsigned.apk
# expected b99cbe34af376938d0bdcc83a3d829dc3088843a6837fd3daec6b5309137d98e
```

Emulator captures for the splash fix (PR #173) are in the private pre-release `evidence-splash-emulator-2026-09-29`. Neither release is public or a production release.

## I. Issue #177 references

`gh issue view 177` shows the full spec. Its five reference images are GitHub attachments inside the issue (`github.com/user-attachments/assets/...`), so they need an authenticated browser session or `gh auth token`; there are no local-only references. Nothing about #177 has been implemented.

## J. Known environment problems

- macOS has no `timeout`; zsh does not word-split unquoted variables, and unquoted globs such as `--include=*.ts` error, so quote patterns.
- `gh pr edit` can fail with a Projects (classic) deprecation error. Use `gh api -X PATCH repos/ghilmanITM360/offline-map/pulls/N -F body=@file.md`. `gh pr create` works.
- `gh release create --target` needs a full 40-character SHA.
- CI (`canonical-checks.yml`) is JS-only (typecheck, lint, Jest, whitespace). Its whitespace step uses a shallow fetch and can report "no merge base" when PRs merge back to back; re-run it rather than treating it as a code failure. CI does not build or test the Android app.
- React Native Testing Library `renderHook` and `unmount` are async in this repo: use `await act(async () => hook.unmount())`.
- `expo prebuild --clean` regenerates `android/` and would delete the `values-v31` splash resources added by PR #173. The `android/` tree is committed and hand-maintained; do not regenerate it blindly.
- Emulator mock GPS is not field evidence. `am kill` and `am force-stop` behave differently; report them separately (see `docs/DEVICE_ACCEPTANCE_CHECKLIST.md` once #176 is merged).
- The old machine also has untracked, superseded leftovers (`builds/` with two July 2026 APKs, `android-runtime-artifacts/` with September emulator captures). They are not needed; rebuild instead.

## K. What still needs a human decision or a device

See `docs/AI_CONTINUATION_HANDOFF.md` (sections "Owner decisions" and "Acceptance status"). In short: #139 option A or B; review and merge of #172–#176; a physical-phone run of the device checklist; the #46 venue walk.
