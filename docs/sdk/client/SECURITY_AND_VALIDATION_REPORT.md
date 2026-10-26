# Security and validation report — SDK 0.1.0 release candidate

## Verdict

**NO-GO for an unrestricted production release. GO for a controlled pilot / client integration under the outstanding-acceptance
list below.** Nothing here is physical-device, real-GPS or field evidence. No mandatory safety or security blocker is hidden: every
open item is listed.

## Evidence by level (separate, never merged)

| Level | Result |
| --- | --- |
| Static (tsc app + scripts, eslint) | pass |
| Unit/integration (Jest) | 207 suites / 2,096 tests pass; routing differential (2,400 seeded A\* comparisons) and 91,506 golden route pairs passed unchanged in the full `npm test` chain at the C1d-2 checkpoint; routing sources and goldens have not been touched since (the later changes are UI, map-adapter and consumer only), but that chain was not re-run on this exact build: re-run it (`npm test`) in QA |
| Plain-Node headless | 82 checks; the headless entrypoint loads with no React/React Native |
| Tarball | contents allowlist, byte-reproducible (two packs), isolated runtime, declarations, shared peers pass |
| Independent consumer install | fresh `npm install` of the `.tgz`, `tsc`, 22 Jest tests, Android and iOS production bundles pass; one React, one React Native, one MapLibre |
| iOS simulator (iPhone 17 Pro, iOS 26.2) | native offline map, route, Manual Guide, explicit Live (simulated and device source), arrival, archive recovery, background/foreground, RTL, dark theme, AX5 layout; **continuous device-location updates not proven** |
| Android emulator (API 36 arm64) | native offline map, route, Manual Guide, explicit Live (simulated and emulator GPS), arrival, permission prompt/deny, RTL, font scale 2.0, insets |
| Physical device | **none** |
| Real GPS walking | **none** |
| Whole-device airplane mode | **none** (a simulator HTTP block is not airplane mode) |
| Accessibility (VoiceOver/TalkBack) | **none** beyond structural Jest checks |
| Security review | self-review below; no external review |
| Field survey (gates 18/19) | **none**; blocked on surveyed connectivity |

Artifacts and their SHA-256 are in `CHECKSUMS.txt`/`manifest.json` of the delivery bundle. Raw evidence (logs, screenshots, APK, hashes)
is outside the repository under `~/Documents/offline-map-audits/…/`.

## Security notes

- **No network by construction:** the map style has no glyphs, sprite or remote URL; the SDK contains no network client, analytics or
  telemetry; the basemap is read from app-private storage. (The sample Android manifest still contains `INTERNET` from the Expo
  template; remove it if your app has no network features.)
- **Least privilege (sample app):** location (coarse+fine) only; storage, overlay and vibrate blocked; no background location, no iOS
  "Always" strings, no background modes.
- **Integrity of the basemap:** size + SHA-256 against the manifest, partial files never trusted, corrupt/missing files replaced from
  the bundle (iOS-verified). SHA-256 is integrity, **not publisher authenticity**.
- **Packs:** the manifest parser rejects duplicate keys, `__proto__`, non-finite numbers, traversal/absolute/device-name/bidi paths and
  collisions; the manager is atomic and recoverable (headless-tested). No signing keys exist and no platform adapters ship, so
  imported or remote packs must not be accepted. Do not fabricate keys.
- **Live safety:** Live starts only from `requestLive()`; precise location is required; fixes must be fresh and timestamped; cached
  fixes are ignored; weak fixes freeze progress; arrival is latched; a denial never auto-starts Live.
- **Supply chain:** the tarball is private and unsigned; dependencies are the app's own; `DEPENDENCY_SECURITY_STATUS.md` records the
  repository's audit status (re-run `npm audit` in your own tree).
- **Privacy:** no coordinates leave the device; the iOS precision module returns an enum only.

## Known limitations (complete list)

1. No physical-device, real-GPS, airplane-mode, accessibility-reader or field evidence (above).
2. iOS: `watchPositionAsync` delivered only its first callback on the simulator and later simulated locations produced no updates;
   continuous iOS live following is **unproven** (simulator limitation or adapter/Expo issue, undetermined).
3. iOS precision needs a host native check (provided as sample code); without it Live is refused honestly.
4. The Ijtema host does not delegate to the SDK controller (`docs/sdk/C4_PARITY_MATRIX.md`). Outside-venue routing exists only as an injected, validated provider; no Ijtema provider is wired yet and none of the C4.2 additions has native evidence.
5. Pack platform adapters, compiler, signing keys and delivery channel do not exist; the bundled Karachi pack manifest is not written.
6. Only English copy ships; Urdu/Roman Urdu need reviewed text. The basemap has no dark palette. iOS AX5 panel height and Android
   dark-system theming (`expo-system-ui`) are open. The directory scrolls under the Android navigation bar by design.
7. The sample venue is synthetic; the Android emulator needs `-gpu host`; Android corrupt-archive recovery was not exercised (release
   APK not debuggable).
8. Physical Gate 18/19 connectivity is surveyed-only and untouched.

## Outstanding acceptance before an unrestricted release

Physical iOS + Android devices with real walking; whole-device airplane mode from a cold start; VoiceOver/TalkBack and AX5/large-font
passes; reviewed Urdu and Roman Urdu copy; iOS continuous-update proof; a surveyed venue and field survey; external security review
and a signing/publishing decision by the owner.
