# Release signing and distribution

Three different things are easy to confuse. Only the first has been done.

| Step | Status | Who decides |
| --- | --- | --- |
| **Private delivery of the SDK tarball and sample sources to a client** | Prepared (`scripts/sdk-package/bundle.mjs`). Nothing has been sent anywhere. | Owner, per recipient |
| **Publishing the package to a registry** | Not done. The package is `"private": true`. | Owner (name, registry, access, provenance) |
| **Signing and distributing a host application** (Play Store / App Store / enterprise) | Not done and not possible from this repository. | Owner, with the production signing keys |

## The reference Android APK is a debug-signed sample

The preserved reference APK (`com.example.sdkconsumer`) verifies as an APK v2 signature, but the certificate is the Android **debug** certificate
(`CN=Android Debug`, SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). This is expected for a sample built from the Expo template and is **not** a defect of the SDK
source, which ships no signing material. It is also not evidence of a production-signed build:

- The sample APK and the iOS simulator build exist to prove behaviour, not to be installed by end users. Do not distribute them.
- A host application needs its own application id, its own **production** signing (Android upload key / Play App Signing; iOS distribution certificate and provisioning profile), and
  owner-controlled custody of those keys. No production key was created, requested or guessed here, and no key is, or should be, committed to the repository.
- `android/app/debug.keystore` in the repository is the standard development keystore used by debug builds; it signs nothing that should leave a developer machine.
- Remove the sample manifest's `INTERNET` permission (an Expo-template leftover) from any app that has no network feature, and decide the backup policy (`allowBackup`) deliberately.

## Pack authenticity

Offline packs are integrity-checked (size and SHA-256) and the bundled ones are pinned to a manifest digest shipped in the app. **A hash is not publisher authenticity.** Imported or
downloaded packs stay refused (`signature-required`) until the owner approves a signing scheme and key custody; no key was fabricated. See `SECURITY_AND_VALIDATION_REPORT.md`.
