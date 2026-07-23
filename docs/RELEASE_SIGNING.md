# Android Release Signing — Setup Guide

Status quo: `android/app/build.gradle` already contains the resolution logic for a real
production signing config (added in commit `a08601d`; see `docs/SECURITY_AUDIT.md` C3 for the
original finding). **No production keystore exists in this repo, and none should ever be
committed.**

`android/app/build.gradle` also has a fail-safe gate: running an actual release-artifact task
(`assembleRelease`, `bundleRelease`, or anything that depends on them, e.g. `installRelease`)
**without a configured production keystore now hard-fails the build** instead of silently
signing with the debug keystore. `npm run android:release:apk` / `:aab` will fail with:

```
Refusing to run release-artifact task(s) [:app:assembleRelease]: no production keystore is configured
(android/keystore.properties or ANDROID_RELEASE_* env vars are missing/incomplete). Building now would
silently sign the release artifact with the public debug keystore.
Fix: configure a real release keystore — see docs/RELEASE_SIGNING.md.
Intentional debug-signed release-shaped build for local testing only: re-run with
-PallowInsecureReleaseSigning=true (or ALLOW_INSECURE_RELEASE_SIGNING=true).
```

until you complete the one-time setup below. This doc is the actionable "do this once"
checklist. It does not redesign the mechanism — just tells you how to feed it real values.

Everyday dev/debug workflows (`./gradlew assembleDebug`, `npm run android`, `npm run ios`, and
verification-only tasks that happen to have "Release" in their name like `lintRelease` or
`testReleaseUnitTest`) are **not** affected by this gate and keep working with zero keystore
configured, as before.

### Intentional debug-signed release-shaped build (local testing only)

If you deliberately want a `release`-variant build (minified, `release` build type flags) for
local testing, without a production keystore, opt in explicitly:

```bash
./gradlew assembleRelease -PallowInsecureReleaseSigning=true
# or
ALLOW_INSECURE_RELEASE_SIGNING=true ./gradlew assembleRelease
```

This still signs with the debug keystore and still prints a loud warning — it just doesn't fail
the build. **Never distribute the resulting artifact to users, testers, or the Play Store** — it
carries the well-known public debug credentials (`storePassword`/`keyPassword: android`,
`keyAlias: androiddebugkey`). Use it only for things like verifying R8/minify behavior locally.

## How the resolution chain works (already implemented, no code changes needed)

`android/app/build.gradle` resolves release signing credentials in this order, per field
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`):

1. `android/keystore.properties` (gitignored file, if present)
2. `ANDROID_RELEASE_STORE_FILE` / `ANDROID_RELEASE_STORE_PASSWORD` / `ANDROID_RELEASE_KEY_ALIAS`
   / `ANDROID_RELEASE_KEY_PASSWORD` environment variables

If all four values resolve (from either source, mixed is fine), `hasReleaseSigningConfig` is
`true`, `buildTypes.release` uses `signingConfigs.release`, and the build is signed with your
real key. If any value is missing, Gradle prints a `WARNING: No production keystore
configured...` message and falls back to `signingConfigs.debug` — builds still succeed, but are
not release-signed.

## One-time setup (~5 minutes)

### 1. Generate a real release keystore

Run this **outside the repo working tree**, or immediately move the output somewhere gitignored
(`android/app/` is fine — it's covered by `.gitignore`'s `*.keystore`/`*.jks` rules, except the
intentionally-tracked `debug.keystore`):

```bash
keytool -genkeypair -v \
  -keystore release.keystore \
  -alias karachi-ijtema-release \
  -keyalg RSA -keysize 2048 -validity 10000
```

You will be prompted for a store password, a key password (can match the store password), and
identity details (name/org/etc — these go into the certificate, not security-sensitive, but use
real values). **Choose strong, unique passwords and store them in a password manager or secrets
vault.** There is no recovery if this file or its passwords are lost — you would not be able to
publish updates to the same Play Store listing under the same app identity ever again.

Move the resulting `release.keystore` into `android/app/` (or any path you prefer — the path is
configurable, see below).

### 2. Wire the credentials in — pick ONE of these two options

**Option A — `keystore.properties` file (recommended for local/manual builds):**

```bash
cp android/keystore.properties.example android/keystore.properties
```

Edit `android/keystore.properties` and fill in the real values:

```properties
storeFile=release.keystore
storePassword=<your real store password>
keyAlias=karachi-ijtema-release
keyPassword=<your real key password>
```

`storeFile` is resolved relative to `android/app/`, so if you placed the keystore there, just the
filename is enough. This file is already gitignored (`.gitignore` → `android/keystore.properties`)
— **never commit it.**

**Option B — environment variables (recommended for CI):**

```bash
export ANDROID_RELEASE_STORE_FILE=/absolute/path/to/release.keystore
export ANDROID_RELEASE_STORE_PASSWORD='<your real store password>'
export ANDROID_RELEASE_KEY_ALIAS=karachi-ijtema-release
export ANDROID_RELEASE_KEY_PASSWORD='<your real key password>'
```

Store these in your CI provider's encrypted secrets store, not in a committed script or `.env`
(the app's `.env` is for Expo public runtime vars, not build-time signing secrets — keep them
separate). `ANDROID_RELEASE_STORE_FILE` should be an absolute path or resolvable from wherever
Gradle runs; on CI this is usually a path the secret keystore is decoded/written to just before
the build step.

### 3. Verify it took effect

```bash
npm run android:release:apk
```

The `WARNING: No production keystore configured...` line should no longer print. To confirm the
resulting APK is actually signed with your key (not debug), check the SHA-1:

```bash
keytool -list -v -keystore android/app/release.keystore -alias karachi-ijtema-release
```

### 4. Follow-up: restrict the Google Maps API key to this SHA-1

Per `docs/SECURITY_AUDIT.md` C1/C3: once you have a real release SHA-1, go to Google Cloud
Console → APIs & Services → Credentials → the Android Maps key → Application restrictions →
Android apps, and add `com.aicrafted.karachiijtema` with this SHA-1. Do this only after
completing the steps above — restricting against the debug keystore's well-known SHA-1 provides
no real protection.

## What is NOT covered here (owner action items, not automatable)

- Actually generating and safely storing the real keystore file + passwords — this is a
  long-lived secret and a deliberate human decision, not something an automated pass should do.
- Rotating/restricting the Google Maps API key in Google Cloud Console (package name + SHA-1 +
  API restriction) — cannot be verified or performed from this repo; the Console is the only
  source of truth for key restriction state.
- iOS release signing (provisioning profiles / certificates) — out of scope for this doc, not
  covered by the Android `build.gradle` mechanism described here.
