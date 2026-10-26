# Security and validation report — SDK 0.1.0 release candidate

## Verdict

**NO-GO for an unrestricted production release. GO for a controlled pilot / client integration under the outstanding-acceptance
list below.** Nothing here is physical-device, real-GPS or field evidence. No mandatory safety or security blocker is hidden: every
open item is listed.

## Evidence by level (separate, never merged)

| Level | Result |
| --- | --- |
| Static (tsc app + scripts, eslint) | pass |
| Unit/integration (Jest) | 214 suites / 2,199 tests pass; the full `npm test` chain (2,400 seeded A\* differential comparisons, 91,506 golden route pairs, every `test:*` script) exits 0 at the C5.3 checkpoint; routing sources and goldens were not modified |
| Plain-Node headless | 83 checks; the headless entrypoint loads with no React/React Native |
| Tarball | contents allowlist, byte-reproducible (two packs), isolated runtime, declarations, shared peers pass |
| Independent consumer install | fresh `npm install` of the `.tgz`, `tsc`, 45 Jest tests in 5 suites (Expo file-system adapter with a native-strict test double and kill-at-every-step sweeps, bundled-pack runtime, on-device self-test harness, the app, the location adapter), Android and iOS production bundles (both ship every pack file) pass; one React, one React Native, one MapLibre |
| iOS simulator (iPhone 17 Pro, iOS 26.2) | native offline map, route, Manual Guide, explicit Live (simulated and device source), arrival, archive recovery, background/foreground, RTL, dark theme, AX5 layout; **continuous device-location updates not proven** |
| Android emulator (API 36 arm64) | native offline map, route, Manual Guide, explicit Live (simulated and emulator GPS), arrival, permission prompt/deny, RTL, font scale 2.0, insets; **C5.3:** fresh install of the pack-driven consumer, bundled Karachi pack verified and served, venue switch, on-device pack self-test 10/10 (release APK `df54ad82…b0c`) |
| Physical device | **none** |
| Real GPS walking | **none** |
| Whole-device airplane mode | **none** (a simulator HTTP block is not airplane mode) |
| Accessibility (VoiceOver/TalkBack) | **none** beyond structural Jest checks |
| Security review | self-review below; no external review |
| Field survey (gates 18/19) | **none**; blocked on surveyed connectivity |

Artifacts and their SHA-256 are in `CHECKSUMS.txt`/`manifest.json` of the delivery bundle. Raw evidence (logs, screenshots, APK, hashes)
is outside the repository under `~/Documents/offline-map-audits/…/`.

**Pack platform integration (C5.3), what the native runs established.** iOS simulator (iPhone 17 Pro, iOS 26.2): fresh install, cold launch,
bundled packs copied through staging and verified (every on-device file hashes to the repository pin), Karachi directory, route (Gate 01
to Gate 02, 111 m) on the real basemap, explicit Live to arrival, venue switch, and a bit-flipped and a deleted resource repaired at the
next start; the on-device pack self-test passes 10/10 (replace/rename semantics, interrupted replacement, install → update → rollback
across restarts, changed and deleted resource, update with a missing file, interrupted staging, pins, storage pressure, two venues).
Native runs found a defect Jest could not: expo-file-system refuses to read a packaged asset in place on iOS ("Missing permission for
uri" inside the app bundle), so the first build failed closed with both packs unavailable; the fix copies to app storage and reads
there. Not established: real airplane mode, a physical device, storage-full conditions beyond the simulated free-space check, and
Android corrupt-file recovery (release APK is not debuggable; the same logic is covered by the on-device self-test and Jest).

## Security notes

- **No network by construction:** the map style has no glyphs, sprite or remote URL; the SDK contains no network client, analytics or
  telemetry; the basemap is read from app-private storage. (The sample Android manifest still contains `INTERNET` from the Expo
  template; remove it if your app has no network features.)
- **Least privilege (sample app):** location (coarse+fine) only; storage, overlay and vibrate blocked; no background location, no iOS
  "Always" strings, no background modes.
- **Integrity of the basemap:** size + SHA-256 against the manifest, partial files never trusted, corrupt/missing files replaced from
  the bundle (iOS-verified). SHA-256 is integrity, **not publisher authenticity**.
- **Packs:** the manifest parser rejects duplicate keys, `__proto__`, non-finite numbers, traversal/absolute/device-name/bidi paths and
  collisions; the compiler refuses symlinks and undeclared files and re-verifies its own output; the loader validates graph and place
  data; the manager is atomic and recoverable (headless-, Jest- and on-device-tested). Bundled packs are trusted by a manifest digest
  pinned in the build (integrity and consistency, **not** publisher authenticity). No signing keys exist: imported or remote packs are
  refused (`signature-required`). Do not fabricate keys.
- **Live safety:** Live starts only from `requestLive()`; precise location is required; fixes must be fresh and timestamped; cached
  fixes are ignored; weak fixes freeze progress; arrival is latched; a denial never auto-starts Live.
- **Supply chain:** the tarball is private and unsigned; dependencies are the app's own; `DEPENDENCY_SECURITY_STATUS.md` records the
  repository's audit status (re-run `npm audit` in your own tree).
- **Privacy:** no coordinates leave the device; the iOS precision module returns an enum only.

## Known limitations (complete list)

1. No physical-device, real-GPS, airplane-mode, accessibility-reader or field evidence (above).
2. iOS continuous location: the simulator symptom (one callback, then silence) is explained and fixed in the reference adapter
   (expo-location ends the watch on the first transient `kCLErrorLocationUnknown`; the adapter now restarts it; 25 of 25 simulated fixes
   reached the SDK across two errors, arrival reached; see `docs/sdk/C3_IOS_CONTINUOUS_LOCATION.md`). **Unproven on a physical iPhone.**
3. iOS precision needs a host native check (provided as sample code); without it Live is refused honestly.
4. The Ijtema host does not delegate to the SDK controller (`docs/sdk/C4_PARITY_MATRIX.md`). Outside-venue routing exists only as an injected, validated provider; no Ijtema provider is wired yet and none of the C4.2 additions has native evidence.
5. Pack signing, import/download and a delivery channel do not exist. Packs are bundled and digest-pinned only. The pack runtime hashes
   every bundled file in pure JavaScript at each start (~1 MB across the two sample packs): cold start on the iOS simulator takes several
   seconds and the on-device self-test about ten; a native hasher or a verified-once marker is the upgrade path. The compiled pack lists the
   owner-supplied survey data with redistribution terms not recorded in the repository (owner action).
6. Only English copy ships; Urdu/Roman Urdu need reviewed text. The basemap has no dark palette. iOS AX5 panel height and Android
   dark-system theming (`expo-system-ui`) are open. The directory scrolls under the Android navigation bar by design.
7. The second sample venue is synthetic (the first is the real Karachi pack); the Android emulator needs `-gpu host`; Android corrupt-file
   recovery was not exercised on a device (release APK not debuggable; the on-device self-test covers it on the real filesystem).
8. Physical Gate 18/19 connectivity is surveyed-only and untouched.

## Outstanding acceptance before an unrestricted release

Physical iOS + Android devices with real walking; whole-device airplane mode from a cold start; VoiceOver/TalkBack and AX5/large-font
passes; reviewed Urdu and Roman Urdu copy; iOS continuous-update proof on a physical iPhone; a surveyed venue and field survey; external security review
and a signing/publishing decision by the owner.
