# Security and validation report — SDK 0.1.0

Release-closure update: **1 November 2026**, release-closure issue #393. Current results supersede older C5/C6/remediation totals; historical native evidence is separated below.

## Release status

Author-side final-source engineering validation completed for the selected dependency graph. Standalone delivered-consumer acceptance and exact artifact identities are recorded in the attached final handoff. DELIV-01 engineering acceptance completed at `91de2d15728c4a8fae1f39827a55856a6935b04a`; REG-01's unchanged scenarios passed three focused runs and a full 222-suite / 2,367-test run. PostCSS 8.5.32 and Metro 0.83.8 are selected with executable security/API regressions. Fresh final-source results and final delivered lock identities are recorded in the closure handoff; this report must not imply independent acceptance of author-created corrections.

**Controlled pilot: pending focused independent acceptance. Unrestricted production: NO-GO.** No physical-device, real-GPS walking, whole-device airplane-mode or audible VoiceOver/TalkBack acceptance is claimed.

## Current source and package evidence

- Independent 31 October audit at `923a604be161c749bd5bf50d8fdd8c036ba4bcbb`: 16 of 17 original actionable findings independently PASS at SOURCE/RUNTIME. SUP-01 required a current disposition; DELIV-01 and REG-01 were additional software gates. The original reproducers and evidence are preserved.
- DELIV-01 fixed by `91de2d1`: actual archive contains all 12 compiler-generated `.packfile` assets and pinned shared PMTiles; standalone consumer clean install, TypeScript, 6 suites / 63 tests, Android/iOS production Metro exports passed without asset injection or implementation aliases. Original corrected delivery has 71 payload files and no AppleDouble metadata.
- REG-01 first 1 November baseline: original two suites 57/57 tests passed; two unchanged warm repeats also passed. Full suite 222/222 suites, 2,367/2,367 tests passed. No timeout, assertion, component or test source changed. Host pressure was observed, but its causal role in historical timeouts remains unproven. The final run after both dependency corrections also passed all 222 suites / 2,367 tests.
- SDK tarball remains `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`; runtime, routing algorithms, APIs, GIS and golden data are unchanged. Packaging checks reproduce it twice and verify headless runtime, declarations, exports, allowlist and Apache-2.0 text.
- SUP-01 root final lock SHA `760e0aac4cf4651554a55b59f6be196697e579c7ae8a5413e336ac852b92b80b`: fresh audit **57 affected entries (6 low, 51 moderate, 0 high, 0 critical), 4 distinct sources**, exit 1. The original corrected consumer was 45 entries / 9 sources before these overrides; the separately resolved final consumer lock is `64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68`: **43 affected entries (6 low, 37 moderate, 0 high, 0 critical), 3 distinct sources**, audit exit 1. The delivery must match this exact reviewed lock; acceptance verifies that identity. Graph-entry counts can change through propagated labels; six source advisories were removed by the two published corrections.
- Full [advisory disposition](DEPENDENCY_ADVISORY_DISPOSITION.md) accounts for every GHSA/CVE, call path, parent range, exploitation prerequisite and remaining conditional exception. No audit output is suppressed. Non-dev lockfile entries include build tooling and are not handset runtime inventory.

## Historical native evidence — retained, not rebuilt for packaging/tooling

| Artifact | Recorded SHA-256 | Scope |
| --- | --- | --- |
| APK A, `android/sdkconsumer-release.apk` | `e59518b918b84e0db1aeb356724a603a98517538cc5c5fc65526ada23c9a257b` | Pre-arrival-inset correction. Earlier Android scenarios were exercised on this build. |
| APK B, `android/run3/sdkconsumer-release-e49ed1b.apk` | `bdfe5c92d9593f0661a7f10c7bf70d920aa5d86f4e3531be896aef074b1865ce` | Corrected arrival inset, SDK d722 package. Targeted correction evidence at 100%/200% text and three-button/gesture navigation. |
| Earlier iOS simulator executable (identity record only; executable not retained) | `18933dab8721f92f31e9b9dc501dcf8db5bf074f6d7ffa8621976854cfa5a96b` | Source `4f9a4d2`, SDK `eab28df2b74887767ecca7eb4f8846c97d3e22268b03bec4a2d7babb3c01e819`; predates e49ed1b/d722. Do not label it the final SDK simulator binary. |

Android's historical **18 PASS / 2 BLOCKED** is aggregate evidence spanning APK A plus targeted retesting on B. It does **not** establish that all 18 scenarios were rerun on B. The blocked scenarios are release-build map-unavailable recovery and at-rest corruption. The arrival bottom-inset correction has emulator evidence; no physical Android, TalkBack or field result follows.

Earlier iOS simulator runs establish historical offline map, simulated Live/arrival, pack self-test/corruption repair and layout behavior for their recorded source/packages. They do not establish the final d722 native binary or physical continuous iPhone GPS. Final SDK source carrying the inset fix is `e49ed1b13810e120c97d2d589fa8aaacee8dc4e1`. No native-affecting product source changed during release closure, so no fresh native build was required.

Historical remediation notes report 222 suites / 2,363 tests; the later audited source `923a604` contains 2,367 tests and independently recorded 2,362 passes / 5 timeouts. Those totals refer to different checkpoints. Current completed regression totals above must not be substituted into the older native reports.

Raw evidence and exact commands are in owner audit storage: `codex-independent-sdk-qa/20261027-081859/retest-20261031/` (independent) and `offline-sdk-release-closure-2026-10-31/resume-20261101/` (implementation). Final delivery `manifest.json`/`CHECKSUMS.txt` identify its exact source and payload.

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
5. Pack signing, import/download and a delivery channel do not exist. Packs are bundled and digest-pinned only. **Startup hashing (C6):** every
   bundled file is still hashed at each start, but by the platform's SHA-256 (`expo-crypto`) through the store's optional `digestFile` port (files
   up to 8 MiB; larger files and any failure fall back to the SDK's bounded-memory JS hash). Measured on the iPhone 17 Pro simulator, warm start of the
   two sample packs: 1,460 ms before, about 200 ms now; Android emulator (API 36 arm64): 919 ms (JS hash, rewritten) against 84 ms. A verified-once marker was
   deliberately **not** added: it would trust a path/size/time match instead of the bytes. Corruption (flipped bytes, a deleted file) is still detected and
   repaired from the packaged copy at the next start (iOS simulator). The compiled pack lists the owner-supplied survey data with redistribution terms
   not recorded in the repository (owner action).
6. Only English copy ships; the sample app's Urdu / Roman Urdu are host-shipped wording reused only where the English matches word for word (26 of 88
   strings, listed in [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md), **pending owner review**); every other string stays English, so an Urdu screen mixes
   scripts (and trailing punctuation of English text is placed by the right-to-left paragraph). Dark basemap, System/Light/Dark and AX5 handling exist (C6) at simulator/emulator level
   only. On Android the forced-Dark window keeps the system's light navigation bar (dark icons, readable). **A live system font-size change on Android recreates the activity**
   (the journey is lost and the new window can show text frames sized for the old scale); change the size and restart the app. iOS follows a live change.
7. There is no speech output in SDK 0.1.0: no voice control is shown anywhere. The *Voice instructions* switch that exists in the original Ijtema host
   Settings is that host's (workstream B).
8. The second sample venue is synthetic (the first is the real Karachi pack); the Android emulator needs `-gpu host`; Android corrupt-file
   recovery was not exercised on a device (release APK not debuggable; the on-device self-test covers it on the real filesystem).
9. Physical Gate 18/19 connectivity is surveyed-only and untouched. The entry-gate chooser is driven by the host's outside-route provider; the sample app has no
   street router, so it never shows one (Jest covers it against the real Karachi gates).

## Outstanding acceptance before an unrestricted release

Physical iOS + Android devices with real walking; whole-device airplane mode from a cold start; VoiceOver/TalkBack and AX5/large-font
passes; reviewed Urdu and Roman Urdu copy; iOS continuous-update proof on a physical iPhone; a surveyed venue and field survey; external security review
and a signing/publishing decision by the owner.
