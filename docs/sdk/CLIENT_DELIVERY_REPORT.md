# Client delivery report — SDK 0.1.0, candidate 2 (3 November 2026)

The one authoritative record for the client-delivery pass. It supersedes the artifact identities and the package-reproduction command in
[SDK_0_1_0_ENGINEERING_HANDOFF.md](SDK_0_1_0_ENGINEERING_HANDOFF.md); that file and all earlier closure folders are kept unchanged as history.

## 1. Identity

| | |
| --- | --- |
| Branch | `feat/muslim-ummah-offline-navigation-sdk` |
| Starting point | local checkout `2d9fa73` (19 commits behind), fast-forwarded to the live remote `6308084bf080edbe39ae5876ec5c1757854dc3a7` (the reviewed HEAD named in the assignment) before any edit |
| Accepted executable source | `21d1ed40dc652f54670d49d3075b13d4c3be796d`. `git diff 21d1ed40 HEAD -- packages/offline-navigation/src` is empty; the host app's `src/` (non-test) is also unchanged, so routing, controller, UI and map behaviour, the 91,506 golden and the 2,400 differential comparisons are the accepted ones |
| Delivery built from | `b9cd118bba610bd229b1edc9d80c9af089ccc120` (`delivery-b9cd118`). Commits after it change only this report |
| Supersedes | `delivery-21d1ed4` (`87e17e33…71e5`) and SDK tarball `a2bb865d…71d4`, both kept as history |

| Artifact (candidate 2) | SHA-256 |
| --- | --- |
| **Delivery archive** `delivery-b9cd118.tgz` (85 files) | `28fe810b95bd279cb05bd69556b8690c3133cc3f4c445f42691f5f847b154069` |
| **SDK tarball** `muslim-ummah-offline-navigation-0.1.0.tgz` | `0ff4dfc4fe64f78d10bf81626d4da2368cb01cfb045f345064e60805b4a76c75` |
| iOS precision tarball `muslim-ummah-ios-location-precision-0.1.0.tgz` | `6ee10a9fb77ceeaf2266916b4979a694c6f7efba005165560d578cb13505551d` |
| Venue tool `tools/venue-pack/venue-pack.cjs` | `02cddf51010ce7ffd5615d0aa2db977ed4a4e9931db3531aa79d5ca5be35d746` |
| Example app `package-lock.json` | `6701877820dd515bb5ae124463de14a9e81ac77609ffeb618d84b05df2f56f5f` |
| Test-signed Android release APK built from the delivered example (not a deliverable) | `89cfd2a886f8de96103dc6f7c1857359baadd07d203940de70710a89974b0083` |

Reproducibility: two independent builds of the delivery gave the identical archive hash; the SDK tarball, iOS tarball and venue tool are each built twice inside every bundle run and must match.
Files are kept outside Git in `~/Documents/offline-map-audits/offline-sdk-client-delivery-2026-11-03/` (with `SHA256SUMS.txt`, logs and emulator screenshots).

## 2. Confirmed issues and what was done

| # | Finding | Verified how | Fix |
| --- | --- | --- | --- |
| A | No venue pack compiler in the delivery | `bundle.mjs` shipped only the app, packs and docs | `tools/venue-pack/venue-pack.cjs`: the repository's `compilePack` bundled with esbuild into one dependency-free Node 18+ file. Commands `compile` (graph and place checks, manifest, `pack.pin.json`, `SHA256SUMS.txt`), `verify [--pin]`, `app-assets`. `examples/synthetic-venue` is an invented model venue. Output must be a new folder; nothing is deleted or overwritten; symlinks refused. 20 Jest tests, plus a run from the unpacked archive |
| B | Native setup was four hand-copied pieces | `examples/expo-consumer` needed two plugin files, the expo-location and MapLibre entries, an Info.plist language list, a Metro line and a copied Swift module | One Expo plugin `"@muslim-ummah/offline-navigation"` (location, MapLibre, iOS languages, Android configChanges and font fix, option validation, missing-peer messages); `…/metro` helper; `@muslim-ummah/ios-location-precision` as an autolinked tarball. The Android font fix still stops on any RN other than 0.81.5 (`androidFontScaleFix: false` opts out). Bare React Native written out as manual steps and marked **not natively validated** |
| C | Archive carried metadata entries | Raw TAR parser run on the host `tar` output of a file with an extended attribute: `._pkg` and `pkg/._file.txt` (AppleDouble) with `COPYFILE_DISABLE` unset; with it set, PAX `x` headers and directory entries instead. The older `delivery-1a913b9-final.tgz` on this Mac parses as 89 PAX headers + 13 directories among 76 files. The accepted `delivery-21d1ed4.tgz` (reported 92 `._`) is stored on the other Mac and was **not** re-parsed here | `scripts/sdk-package/tar.mjs`: pure-Node deterministic ustar writer (sorted, fixed mode/owner/time, constant gzip header), raw reader and auditor. The bundle audits its own archive; no host `tar` is used. `test:sdk-archive` (8 checks incl. the macOS reproduction) is in `npm test` |
| D | `npm pack` given as the package reproduction command | A bare `npm pack` in `packages/offline-navigation` produces 62 TypeScript source files and no `dist/`; the artifact is compiled with rewritten exports | Handoff corrected in place with a marked correction; supported commands: `npm run pack:sdk -- <dir>` and `npm run sdk:bundle -- <dir>` |
| E | Stale hashes and version claims | Reviewed client docs | Supersession banners; compatibility matrix now separates declared peer ranges from tested versions and records bare RN as not validated; new Quick Start, plugin, venue-tool, API-export, release-note, checklist and localization text; the delivered docs are link-checked |
| F | 63 of 89 translation keys had no Urdu or Roman Urdu | `TRANSLATION_REVIEW.md` | `scripts/sdk-i18n/draft.ts`: draft wording for all 63; all 89 keys now complete in English, Urdu, Roman Urdu. Tests: completeness, placeholders, script, host-wording fidelity, arity, and English fallback for missing or empty entries. **Drafts, pending native review** |
| G | Found by the independent-client run | Adding a client pack whose file names differ failed `tsc` (inferred union type of the pack list) | `bundledPackTable.ts` types its list explicitly. The delivery is link-checked; `expo config --json` swallows plugin errors, so the check uses `expo prebuild` |

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` (app and scripts), `eslint .` | clean; 0 errors, 2 warnings (both pre-existing) |
| `npm test` chain (headless 83 checks, exports, archive, venue/street contracts, 2,400 differential, 91,506 golden, route suites, dependency security 14) | PASS, exit 0 |
| Jest component suites | first full run: 224 of 225 suites, 2,428 of 2,429 tests; the one failure was a 5 s timeout of `NavigationChromeV2` (host UI, untouched) while Gradle, an emulator and Jest ran together; it passes alone (76 ms). clean rerun with no competing load: **225 of 225 suites, 2,429 of 2,429 tests PASS** |
| Pack compiler and tool | `SdkPackCompiler`, `SdkPackOutputSafety`, `SdkVenuePackCli` (20), unchanged safe-output guards |
| Package | `test:sdk-package`: reproducible tarball, isolated plain-Node runtime, declarations, 7 exports |
| Repository consumer driver | PASS: 63 consumer tests, plugin prebuild for both platforms, iOS module autolinked, Android 769 / iOS 771 module bundles (same counts as before) |
| **Independent client** (`client-acceptance.mjs` on the final archive, unpacked with Node only, outside any repository) | **PASS, 13 steps**: raw audit clean and `CHECKSUMS.txt` verified; venue tool compiled the synthetic venue, verified its pin, refused to reuse an output folder; `npm ci` from the shipped lock with one React / React Native / MapLibre; headless journey on the client-compiled pack (preview, Manual Guide, same-place, unknown place, exit, fresh controller); app type-checks against shipped declarations; 63 tests / 6 suites; plugin result for Android (permissions, configChanges, font fix) and iOS (foreground text, languages, no background modes, module autolinked); invalid options rejected by name; Android and iOS production exports, as delivered and again with the client's compiled pack added (776 / 778 module sources, every pack asset present, nothing outside the app); no developer paths or keys in text files |
| Android native smoke (emulator API 36, release APK built from the delivered example) | PASS: offline directory, preview, Manual Guide, Live (simulated GPS) to arrival, Done, second journey, venue switch, Urdu / Roman Urdu draft text, airplane-mode cold start, on-device pack self-test 10 of 10, no crash. The smoked delivery (`af67de4`) differs from the final one in three documentation files only |
| iOS native | PC 1 (`Ghilmans-Laptop.local`): **BLOCKED (environment)**: prebuild and `pod install` pass and link `SdkLocationPrecision` from `node_modules`; `xcodebuild` cannot run because that Mac's Xcode 26.2 lacks the iOS 26.2 platform. **Superseded by PC 2 (section 7): built and run on an iOS 26.3 simulator, 5 of 5 native tests PASS** |

## 4. What a client must provide, what is automated, what is unsupported

- **Client provides:** surveyed venue data (nodes, corridors, places) and the right to redistribute it; an offline PMTiles basemap; reviewed permission and screen wording; Expo 54 / RN 0.81.5 development or release builds; physical-device, real-GPS, screen-reader and field acceptance.
- **Automated:** native configuration (one plugin, one Metro line), iOS precision linking, pack compile / verify / pin / checksums / app copy, archive integrity, language-table checks (English, Urdu, Roman Urdu completeness).
- **Unsupported / not validated:** Expo Go; bare React Native (manual steps only); React Native other than 0.81.5 for the Android font fix; Android < API 24 / iOS < 15.1; remote or imported packs (refused, no signing scheme); speech output; commercial protection, licensing or signing (none requested); production Urdu / Roman Urdu (drafts).
- **Owner decision flagged:** the example app still bundles the owner's Karachi sample pack, as the accepted delivery did. The archive is private and unpublished; redistribution rights for that data are an open owner gate, so remove `assets/packs/karachi-ijtema` and its table entry before any wider sharing.

## 5. Environment differences from the assignment text

This work ran on `Ghilmans-Laptop.local` in `/Users/ghilmankhan/workprojects/offline-map` (the checkout [AGENTS.md](../../AGENTS.md) names as canonical), not on `Users-MacBook-Pro.local` / `/Users/ghilmanislam360/GhilmanProjects/offline-map`. This checkout has two stashes (both preserved, not touched), not three, and no `.codex/` folder; the third stash and `.codex/` are on the other Mac. There is one worktree. A non-forced push is used; if the other Mac pushed in the meantime, it will be rejected rather than overwritten.

## 6. Open items (unchanged by this pass) and verdicts

Still pending and separate: physical Android and iOS devices with real GPS, whole-device airplane mode, audible VoiceOver / TalkBack, A27 / A29 / A34 variants and memory (inconclusive, no confirmed leak), native-reviewed Urdu / Roman Urdu, Gate 18/19 survey, venue-data rights, independent security and native-library review, production signing and distribution approval.

| Question | Verdict |
| --- | --- |
| Client-integration engineering for the agreed scope | **COMPLETE and verified** at the levels above; iOS native now verified on PC 2 (section 7). Narrower limitation: the tested bytes are PC 2's rebuild of the candidate-2 source; its tarball and archive hashes differ from the reported ones until compared on PC 1 |
| Controlled pilot | **NO-GO until the owner's approval**; the engineering preconditions in this report are met |
| Unrestricted production | **NO-GO** until the external gates above are satisfied |

## 7. PC 2 iOS native acceptance (4 November 2026, `Users-MacBook-Pro.local`)

PC 1's results above (13-step client acceptance, Android native, 225 suites / 2,429 tests, 91,506 goldens, iOS prebuild and autolinking, iOS build BLOCKED) are **independent evidence from another Mac and were not repeated**. Everything in this section is PC 2's own native result. Evidence stays outside Git in `~/Documents/offline-map-audits/ios-candidate2-pc2/` (unpacked delivery, built app, DerivedData, xcresult, logs, screenshots).

**Candidate identity on PC 2.** The delivery archive was not on this Mac, so it was rebuilt from `b9cd118` (`git checkout --detach b9cd118`, `node scripts/sdk-package/bundle.mjs`, branch restored afterwards; its built-in client acceptance reported PASS). Two untracked, git-ignored Finder `.DS_Store` files in `docs/` stopped the first attempt (the archive writer refuses metadata files, as designed) and were deleted; no tracked file changed.

| Artifact | PC 1 reported | PC 2 rebuilt | Match |
| --- | --- | --- | --- |
| Venue tool `venue-pack.cjs` | `02cddf51…d35` | `02cddf51010ce7ffd5615d0aa2db977ed4a4e9931db3531aa79d5ca5be35d746` | **identical** |
| SDK tarball | `0ff4dfc4…c76` | `859570a8fdfb17c51b80f5da9eda60f89653f0dee551e13b686fa7acf422ddad` | **different** |
| iOS precision tarball | `6ee10a9f…551d` | `90bb00296c09f03de4b968f4f7675eb1ea807070b6657ece468087b7cc4ccf73` | **different** |
| Delivery archive | `28fe810b…4069` | `bebcf0e2b4ac2ad0ec6621caf382b472f6f92f9dc842cbf6a350c7814b8a2bf1` | **different** |
| Example `package-lock.json` | `67018778…5f6` | `d08930c5bed3b438359131f15031292a53de1565c9e4bd485a1bd7cea10286f7` | different (it embeds the tarball integrity) |

The byte-identical hashes of the reported Candidate 2 were **not reproduced** on this Mac. The pure-JavaScript venue tool matches, so the source and esbuild are the same; the two tarballs come from `npm pack` (gzip). The most likely cause is the toolchain (PC 2: Node 25.2.1 / npm 11.6.2; the compatibility matrix records PC 1 as Node 24.14), but that was **not verified** (no second Node was available and none was downloaded). The iOS tarball's Swift module file is byte-identical to the tracked source (`1bd909c2…eb1b`). Consequently the bytes tested here are PC 2's rebuild of Candidate 2's source commit, not PC 1's archive. Candidate 1 was not used. Closing this gap needs one comparison on PC 1: list and hash the entries inside both tarballs (`gunzip -c … | shasum`), or rebuild with Node 24.14.

**Toolchain and simulator.** Xcode 26.2 (17C52), CocoaPods 1.16.2, iOS Simulator SDK 26.2. Simulator: task-owned `OfflineMap-SDK-iOS26`, UDID `BD24E31D-30F4-43C6-8986-784AAD3A5FB6`, iPhone 17, iOS 26.3.1 (23D8133), 402 x 874 pt, measured top safe inset 62 pt. `xcodebuild -showdestinations` lists it as a valid destination, so the PC 1 block does not apply here. No runtime was downloaded and no other project's simulator was touched.

**Build from the delivered files** (copied from the unpacked archive to a folder outside Git): `npm ci --ignore-scripts` from the shipped lock (841 packages), `expo prebuild --platform ios`, `pod install` (81 dependencies; `SdkLocationPrecision` installed from `../node_modules/@muslim-ummah/ios-location-precision/ios`, so no `modules/` copy), then `xcodebuild -configuration Release -destination id=BD24E31D…`: **BUILD SUCCEEDED**.

| Built app (`SDKConsumer.app`, `com.example.sdkconsumer`) | Value |
| --- | --- |
| Executable SHA-256 | `e4c390f6cabafba9276f48432096378d5a827fd80c4fe55578d085d846b20895` (x86_64 + arm64, minos 15.1) |
| `main.jsbundle` SHA-256 | `6f09ce42816e5b1d8122939cb0e52180805bc52d2cc45a4f42243285ee44ddd4` |
| Installed copy rehashed | both equal to the built files |

These differ from candidate 1's (`29962a58…`, `ad88c6c7…`) because they are a different build (SDK 0.1.0 candidate 2 sources, universal simulator binary); they are not comparable to it.

**Precision module.** `SdkLocationPrecision` is linked (51 matching symbols in the executable). Its runtime behaviour was exercised through the real path: with the location source switched to the device adapter, "Use my location" asks the module for `accuracyAuthorization`; with permission granted via `simctl privacy`, the SDK proceeded to "Your live route", offered "Start live navigation" and ran it (an absent or `none` result is refused as `precision_unknown`). Only the **full-accuracy** branch ran; the reduced-accuracy branch cannot be set on the simulator and stays BLOCKED, as for candidate 1.

**Functional run.** Harness `native-tests/ios-candidate2/` (new; derived from the iOS 26 cross-device harness with the class renamed, plus `test05` for venue switching and Roman Urdu). It measures the screen and safe area at run time and asserts frames against them (inside screen, below the top inset, at least 44 pt, no overlaps, real coordinate taps, scroll reachability). Location is the recorded venue-graph coordinates fed through `simctl location` at 1 Hz. Result: **`xcodebuild test` TEST SUCCEEDED, 5 tests, 0 failures, first run, 473 s**.

| # | Required case | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Cold launch, offline map rendering | PASS | `test01` (map element within 40 s; screenshots) |
| 2 | Directory and destination search | PASS | `test01` (search "02", Gate 02) |
| 3 | Manual origin, route preview | PASS | `test01` ("111 m walk") |
| 4 | Manual Guide Next / Previous | PASS | `test01`, `test02`, `test03` |
| 5 | Explicit Live Navigation | PASS | `test01` (End navigation present after "Start live navigation") |
| 6 | Linked iOS precision-module behaviour | PASS (full accuracy only) | see above |
| 7 | Simulated GPS movement and progress | PASS | `test01` (Gate 01, R6, R602, no early arrival) |
| 8 | Rerouting | PASS | `test01` ("Route updated from where you are.") |
| 9 | Arrival, Done, Exit | PASS | `test01` (Recenter and Done by coordinate touch, return to "Where to?") |
| 10 | Second journey without stale state | PASS | `test01` |
| 11 | Multi-venue switching | PASS | `test05` (karachi-ijtema to synthetic-demo-venue and back; no Gate 02 leaked into the second venue) |
| 12 | English, Urdu, Roman Urdu draft rendering | PASS | `test04` (Urdu RTL, mirrored Previous / Next, extra-large and AX5 text), `test05` (Roman Urdu directory and guide) |
| 13 | Light / Dark | PASS | `test03` (system and in-app) |
| 14 | Background / foreground recovery | PASS | `test02` (Guide and Live survive Home) |
| 15 | Safe-area controls, touch reachability | PASS | layout assertions in every test, arrival frames in `test01` |
| 16 | Offline behaviour | PASS at this level only | 100 host `lsof` samples during the run: zero sockets owned by `SDKConsumer`. Not airplane mode, not a network-less cold start |

Confirmed defects: **none**; no source, plugin or precision-module change was needed. The harness change is new files only; routing, GIS and historical test data are untouched. Harness SHA-256: `Candidate2Journey.swift` `556fa28633ea09deb4fa43e9e6b7167447a912207415beda28750757f7ec9671`, `run_candidate2.py` `a918fcbc89657312c8ce02a393cd65b34ab77a17f6276ba60dad04ecb3ff28ba`, `create_project.rb` `f3f49d7ec44b0648456b821ea40430cf9a8bc2830732033fb127c849afe84f89`. Test log SHA-256 `569a3e58…4ade`, network samples `f1780c16…4ab5`.

Limits of this evidence: iOS Simulator only, simulated GPS, one device model and OS version (iOS 26.3.1); the same simulated-GPS caveat applies as for candidate 1 and it is **not** physical-device acceptance. Urdu and Roman Urdu are still drafts.

## 8. Final verdict (PC 2, 4 November 2026)

**SDK 0.1.0 Candidate 2 — CLIENT INTEGRATION ENGINEERING COMPLETE**, for source `b9cd118`, with one narrower limitation: the exact SHA-256 values of PC 1's tarballs and archive were not reproduced on PC 2 (section 7), so the iOS result applies to PC 2's rebuild of that source and not byte-for-byte to PC 1's archive. Controlled pilot and production authorization stay **NO-GO** until physical-device, human accessibility and translation, data-rights, security and signing approvals exist.

## 9. Candidate 3 — SDK 0.1.1 (10 November 2026)

**Superseded for artifacts, native results and CI by section 10** (native acceptance on Android and iOS, two fixes, new delivery `delivery-b74aa4a`). The one closure record for the coordinate-safety, venue-geometry, catalog, intake and Karachi-preset pass. Sections 1-8 above remain the record for candidate 2 and are not edited.

**Where it ran.** The assignment named `Users-MacBook-Pro.local` / `/Users/ghilmanislam360/...`. It ran on `Ghilmans-Laptop.local` in `/Users/ghilmankhan/workprojects/offline-map`, the one checkout `AGENTS.md` authorizes for this branch. One worktree, no clone, no new branch; stashes (2) untouched. The branch was fast-forwarded `143ab61 -> f2ce28e` (PC 2's docs-only commit) before any edit. If PC 2 also wrote source from the same assignment, reconcile before pushing further.

**Source.** Deliveries were built from `71b26f5942db3bdfdfe05795d3849dac572f064a`; commits after it change only this report. 64 files changed; **no** change to `blocks.ts`, `gates.ts`, `graphBuilder.ts`, `rastas.ts`, `DATA_MANIFEST.json`, the golden fixtures, the PMTiles asset or `src/services` (`git diff --name-only` is empty for them).

### Artifacts (SHA-256)

| Artifact | SHA-256 |
| --- | --- |
| **Internal delivery** `delivery-71b26f5.tgz` (86 files; Karachi preset; not cleared for external distribution) | `996de1ad8751b71376d3f6184d49a182a6ba6f5f0c1b59fccda8a1af452dfce3` |
| **External-shareable delivery** `delivery-71b26f5-external.tgz` (78 files; synthetic data only) | `3474d1a39cfd9d553cf01b515a814bdcdb7170344d7e0ecb41ae3f9bd87d783f` |
| SDK tarball `muslim-ummah-offline-navigation-0.1.1.tgz` (144 members) | `a2fe457ed00c718c0d349d1156fc8f4fa46df93c86452c4952112ae6a059149c` |
| ...its uncompressed tar / member list | `971b0df13a8d47077d2a76c52c456fbd6648f6f1dd95f10197d187fb27ae7083` / `f7f15a9901a60d79e5ec418c1d8b5874feca8fde20a400f7c800ff50f5192f9b` |
| iOS precision tarball (unchanged from candidate 2) | `6ee10a9fb77ceeaf2266916b4979a694c6f7efba005165560d578cb13505551d` |
| Venue tool `tools/venue-pack/venue-pack.cjs` | `fbb5172fcb35fbb51e3995bbb5e2f5a88dc69ca1f42439f7dcdc7fdcff27ad9c` |
| Example app `package-lock.json` | `6340f346ddd787b83a5ddb297b6246b2d2745945d85f3f854ced5a6fa5d70beb` |
| Pack `karachi-ijtema@1.1.0` manifest (internal only) | `4eea9a74d95f9cd431750e8fd4a81a5bf733ccc341e6764239830319cbbfcec1` |
| Pack `synthetic-demo-venue@1.1.0` manifest | `7006cde90e71206c84a6c8434d2c59eefd60de084c4265f9a568e271b03bc69d` |
| Unchanged: `karachi-ijtema@1.0.0` / `synthetic-demo-venue@1.0.0` | `e248c373...03ad1` / `edd5367b...f7b0` |

Two independent internal builds gave the identical archive hash. Evidence (logs, both consumer `evidence.json`, both archives, `SHA256SUMS.txt`) is outside Git in `~/Documents/offline-map-audits/offline-sdk-candidate-3-2026-11-10/`.

**Why candidate 2's hashes differed between PCs.** `scripts/sdk-package/identity.mjs` shows the SDK `.tgz` is made by `npm pack` with a fixed gzip header, mtime `499162500`, empty owners, mode `644` and no AppleDouble entries, so the **tar and every member are deterministic**; the compressed bytes are not: the same tar gzipped by Node's zlib (level 9) and by system `gzip -9` gives two different `.tgz` hashes and one tar hash. The `.tgz` hash therefore depends on the compressor (Node's bundled zlib, npm's version). This is consistent with the PC 1 / PC 2 mismatch but **PC 2's artifact was not available, so the historical cause is not proven**. Policy: compare the tar hash and member list across machines; reproduce the `.tgz` hash only on the pinned toolchain (Node 24.14.0, zlib 1.3.1-e00f703, npm 11.9.0 here; CI pins Node 24.14.0).

### What was implemented (source and Jest unless stated)

- **Coordinate validation** (shared by `compile`, `verify`, the client tool): swapped lat/lng, `(0, 0)`, non-finite and out-of-venue coordinates are errors against the venue's own bounds (a London venue passes); translations per place; findings are error / warning / review and name file, record and field. Karachi's shipped data passes with no error.
- **Corners are not entrances.** Block outlines are validated simple counter-clockwise rings (all 42 are simple, contain their centre, and no two overlap). The four `B#_C1..C4` graph nodes stay (removing them would strand every block) but are labelled `LEGACY_UNVERIFIED`; no verified entrance exists.
- **Pin versus route end.** The destination marker is the block centre; the route end is a separate marker; arrival is judged at the route end; the preview says the route ends at the block boundary. Tested for all 42 blocks: for 39 of them the route from Gate 12 ends at a node other than the old pin `C1` (the earlier audit's finding is reproduced).
- **Gates 18 and 19** stay known and unreachable. The controller refuses them with `destination_unreachable` (and a pending place with `destination_not_located`): no search, no route, no Guide, no Live; no connector was invented.
- **Pack format** (SDK 0.1.1, manifest still version 1, old packs unchanged): optional `venue-geometry` (GeoJSON, `[lng, lat]`, closed CCW simple rings) and `place-catalog` (blocks, gates, ilaqas, tents, facilities; pending places have no coordinate or node; "not located", "unreachable" and "provisional" are distinct states). Cross-checked against the graph and place directory by `compile` and `verify`; the consumer re-hashes and strictly parses them at open and a bad one fails the open.
- **Geometry utilities** in one tested module (polygon validity, point-in-polygon, boundary distance, overlap, `inside / boundary / ambiguous / outside` assignment). The four older copies in the host app (`graphBuilder.ts`, `SnapToRoadService.ts`, `RoutingService.ts`, `EntryGateRoutingService.ts`) were **not** migrated: behaviour preservation was not demonstrated for them in this pass.
- **Intake** `venue-pack import` and `merge` in front of the unchanged compiler: `.xlsx` (dependency-free reader with size, entry, link, macro and encryption limits), UTF-8 CSV, GeoJSON; `Logitude` alias; four outcomes; stable ids; duplicates kept separate and flagged; placeholder keeps its id and is not offered in search; unreviewed translations labelled drafts; changes to verified gates and blocks recorded and never applied; a verified access point or walkable path adds no route; no overwrite of an existing folder; deterministic output. Tested on the real `Map data.xlsx` (100 rows -> 99 ilaqas kept, `IL-0048` excluded, 10 records flagged as 5 duplicate pairs, 0 coordinates, the file's hash unchanged) and on the client template (all nine sheets read).
- **Visuals and search.** `MapLibreNavigationMap` draws block fills and outlines, the selected block, rastas and special routes, gates (grey when unreachable), facilities and surveyed tents, selection by stable id, and labels as React Native text (offline, Urdu shaping, no glyph server). `NavigationScreen` lists every catalog place with category chips, finds a place in English, Urdu and Roman Urdu whatever language is shown, tells apart duplicate names, and says "Location not yet available" / "No verified route yet". 21 new strings (draft Urdu and Roman Urdu, unreviewed); the original 89 are unchanged.
- **Delivery.** Internal profile (Karachi preset 1.1.0 + synthetic 1.1.0) and external profile (synthetic only). CI: `.github/workflows/sdk-checks.yml` for the SDK branch (baseline workflow unchanged); its YAML parses and its branch filters are as intended, but it has **not run on GitHub** from this machine.

### Tests executed

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npx eslint` on all changed areas | clean (one pre-existing unused-import warning in `App.test.tsx`) |
| Full Jest (`--runInBand --ci`) | **234 suites / 2,524 tests passed** (baseline 225 / 2,429; +9 suites, +95 tests, all new) |
| `npm test` (112 scripts, incl. A* extraction 2,400 seeded comparisons, "303 nodes, 90300 routable + 1206 unreachable pairs == golden", "findBestVenuePath ... over 91506 pairs == golden", SDK headless 83 checks) | exit 0 |
| `test:sdk-exports`, `test:sdk-package`, `data:check` | pass |
| Consumer runtime tests in `examples/expo-consumer` | 51 passed in the repo; 67 in each isolated consumer |
| **Independent consumer, internal profile** (`consumer.mjs`: packed tarball, one React 19.1.0 / RN 0.81.5 / MapLibre 11.5.0, config plugin, prebuild for both platforms with the iOS precision module autolinked, `tsc`, Jest, production Hermes bundles) | pass; Android 779 modules, iOS 781 |
| **Independent consumer, external profile** | pass; Android 771, iOS 773; **0** Karachi pack files and none of `GATE_12`, `B12_C1`, `karachi-ijtema@`, `Block 12` in any exported file |
| Delivery verifier on both archives | PASS |

The golden fixture was **not** regenerated; no graph data changed.

### Native Android and iOS: NOT RUN for candidate 3 (superseded: run and recorded in section 10)

No native build or emulator/simulator run was made in this session, so **nothing native is claimed for 0.1.1**. Candidate 2's native results (section 3 and 7) describe candidate 2 and do not carry over to the new map layers, markers or controller change. This machine has `adb`, two Android AVDs, Xcode 26.2 and an iOS 26.2 simulator runtime (none booted), so this is a budget decision, not a proven environment blocker. Evidence level of everything above is SOURCE/RUNTIME VERIFIED plus a JS-only consumer install and bundle; the real MapLibre rendering of the polygons, `Marker` labels and tap selection is untested on a device. Required next: one Android debug/release build of the internal consumer and a focused journey (cold launch, rich map, search, preview, Guide, Live with simulated GPS, reroute, arrival, second journey, venue switch, Urdu and Roman Urdu), then the same on an iOS simulator.

### Not implemented, and why

- Migration of the four legacy point-in-polygon copies in the host app (behaviour not demonstrated unchanged).
- Arrival card wording is still the generic "You arrive at ..."; only the preview carries the provisional-access note.
- Native acceptance (above). A published GitHub run of `sdk-checks.yml`.

### Missing real-world inputs (nothing was invented)

A field survey: verified access points per block (or the walkable connectors that make them routable), surveyed tent, ilaqa and facility coordinates, the connectors for Gates 18 and 19, a venue boundary polygon (only a rectangle exists, so none was drawn), native-speaker review of every Urdu and Roman Urdu string and of all 60 Karachi Roman Urdu names that equal the English.

### Rights and release authorization

The Karachi preset and internal delivery are owner-controlled and **not cleared for external distribution**; the intake marks any candidate without a named distribution authority as internal-only. The external delivery contains synthetic venue data over the OpenStreetMap basemap (ODbL, attribution kept); the basemap clips the real Karachi area, which is public map data, not the owner's survey. Signature policy is unchanged: imported or remote packs are still refused and no signing scheme exists. **Not approved** for unrestricted production: physical-device, field, accessibility, translation, rights and signing approvals are still outstanding.

## 10. Candidate 3 native acceptance and delivery closure (10 November 2026)

Execution of the directive "final native acceptance and delivery closure". Host `Ghilmans-Laptop.local`, the authorized checkout, one worktree, both stashes preserved, no force push. Start: local, tracking and live HEAD were all `1f32f22118b911ed3e0108c6d4095daa6efe322b`; both section-9 archives re-hashed to the recorded values. Evidence stays outside Git in `~/Documents/offline-map-audits/offline-sdk-candidate-3-native-2026-11-10/` (APK, zipped iOS app, xcresults, screenshots, logs, driver scripts) and `.../offline-sdk-candidate-3-2026-11-10/`.

### 10.1 Defects found by native testing and fixed (both with a failing regression first)

| # | Defect | Fix | Regression |
| --- | --- | --- | --- |
| N1 | **Arrival wording overclaimed.** For a block-edge (`provisional`) destination the last step and the arrival card said "You have arrived at Block N", which reads as arrival at or inside the block although the route ends at a LEGACY_UNVERIFIED corner node. | When the catalog marks the destination `provisional`, the final step says "You have reached the edge of Block N" and the arrival card says "You have reached the block boundary / This is the edge of the block, not a verified entrance." Optional copy fields `routeStep.arriveAtEdge`, `arrival.provisionalTitle`, `arrival.provisionalSubtitle`; 3 new draft Urdu / Roman Urdu strings (113 total, unreviewed). | `SdkNavigationScreen` "arrival at a provisional (block-edge) destination ..." (failed before the change). Seen on Android (arrival card) and iOS (test06) after the fix. |
| N2 | **Invalid offers on an unroutable destination** (found on the Android emulator). Gate 18 and a pending place showed the right explanation but still offered "Navigate with my location" (which ended in a second, misleading "No walking route from your location was found.") and "Try again". | The preview offers no Live, no upgrade card, no entry-gate chooser and no Try again when the error is `destination_unreachable` or `destination_not_located`. | `SdkCatalogScreen` Gate 18 and pending-ilaqa cases (both failed before the change). Confirmed on Android (Gate 19, Demo Tent) and iOS (test07). |

No other software defect was found. Routing, the controller, goldens and every protected Karachi file are unchanged (`npm test`: 91,506-pair golden still equal; not regenerated).

### 10.2 Source and artifacts

Executable source commit **`b74aa4a2234551b7ddc8c61308106ee22357fe5d`** (commits `2a410f4`, `4ec7b85`, `b74aa4a` on top of `1f32f22`). The section-9 archives (`delivery-71b26f5*`) are superseded by:

| Artifact | SHA-256 |
| --- | --- |
| **Internal delivery** `delivery-b74aa4a.tgz` (86 files; Karachi preset; not cleared for external distribution) | `8100d50e643c5e5bdd797b7f7f73265cf12a92283521788aff03953ced816be0` |
| **External-shareable delivery** `delivery-b74aa4a-external.tgz` (78 files; synthetic data only) | `4451259d77c9a670a8158314d13dac2f84ec3f1412c47c34a6655d5fbd2d2737` |
| SDK tarball 0.1.1 | `5d5bdb3fec9290a29c13626914919a857670b6c1141ea3a25781f8322c13159b` |
| ...its uncompressed tar / member list | `28ba0447ac25640920b5a47c5afbaeb769bfba40c71e7346ca1e0e0738039f8e` / `11bcf3a3c08c1b79c9a0bd2432e4538edf6b65325fc944de19a71fd321f32690` |
| iOS precision tarball (unchanged) | `6ee10a9fb77ceeaf2266916b4979a694c6f7efba005165560d578cb13505551d` |
| Venue tool (unchanged) | `fbb5172fcb35fbb51e3995bbb5e2f5a88dc69ca1f42439f7dcdc7fdcff27ad9c` |
| Example app `package-lock.json` | `9ca5059514e99d1bae3842743d537e11d96e691b63b55ca1116cf8b314acd649` |
| Pack manifests (unchanged) | Karachi 1.1.0 `4eea9a74...cbec1`; synthetic 1.1.0 `7006cde9...bc69d`; Karachi 1.0.0 `e248c373...03ad1` |
| **Android Release APK** (arm64-v8a + x86_64, `com.example.sdkconsumer`, debug-keystore signed by the Expo template, not a release signature) | `15e337635b5f0d8a1684f875f4ca51ae77fd1d6bdcb22d8bafb98911a62f5a7b` |
| **iOS Release simulator app**: executable `SDKConsumer` / `main.jsbundle` / app folder as tar | `a6effbfff414e05527d5f16fd2bcdc76c182774e39deb22ebd95bfce1838a0ce` / `5fbf90dd64958bced27ac7c9cc0c60e2e90283095e6b617d3be3c7c344e26716` / `0c7a94d0d56c0f81a1803594c61b9977d8d604552d3b7cbf785c470dccb0b20a` |

Build input: both native apps were built from an isolated consumer folder produced by `consumer.mjs` from the SDK tarball `5d5bdb3f...`, the same bytes shipped in `delivery-b74aa4a`. Each delivery was built once in this session; the SDK, iOS and venue-tool tarballs are each built twice inside every bundle run and must match (they did). A second full internal rebuild to compare the archive hash was **not** repeated for this candidate.

### 10.3 Android native (Release APK, emulator)

Evidence level: **EMULATOR**. Device `sdk_gphone64_arm64` (AVD `Ijtema_API_36_Play`, Android 16 / API 36, arm64-v8a, `-gpu host`), clean install (`adb uninstall` first). No crash, ANR or FATAL in logcat for the app. Cold start 0.4 s. The shipped pack self-test on the device filesystem: 10 of 10 PASS.

| # | Item | Result |
| --- | --- | --- |
| 1-2 | Cold launch with offline assets; offline PMTiles basemap | **PASS** (also cold-launched in airplane mode: map and directory render; no established TCP connection on the whole device at that moment, not a per-app measurement) |
| 3 | 42 block outlines and centres | **PARTIAL**: outlines, labels and the selected block's centre marker were seen; the count of 42 was not counted on the device (asserted in Jest) |
| 4-6 | Selected-block highlight; gate and rasta overlays; route end vs block centre | **PASS** (visual: red block, centre marker and a separate route-end marker, rastas, gates, special routes, route line) |
| 7 | Search EN / Urdu / Roman Urdu | **PARTIAL**: English typed queries PASS; Urdu UI and Urdu names PASS (RTL, mirrored); Urdu-script and Roman Urdu *typed* queries were not entered on Android (`adb input text` cannot type Urdu); covered in Jest, Roman Urdu UI on iOS test05 |
| 8 | Category | **PASS**: chips filter; the synthetic venue shows Ilaqas and Tents chips (its only pending place is a Tent, no ilaqa row exists there) |
| 9 | Pending places cannot start navigation | **PASS** for the synthetic "Demo Tent" ("Location not yet available", then explanation only). **Karachi has no ilaqa data** (none imported), so no Karachi ilaqa could be tested natively |
| 10 | Gates 18/19 | **PASS after N2** (before the fix: failed, see 10.1) |
| 11-14 | Origin/destination, preview (902 m), Manual Guide, Next/Previous/Recenter | **PASS** |
| 15 | Explicit Live confirmation | **PASS** (two explicit steps; "Not now" returns to the guide) |
| 16 | Simulated walk to the endpoint | **PASS** (SDK demo walker, 21 steps) |
| 18-19 | Arrival; exit and second journey | **PASS** (arrival card shows the N1 wording) |
| 20 | Venue switch | **PARTIAL**: Karachi to synthetic and back verified on iOS (test05); on Android only Karachi to synthetic was run |
| 21 | Light / dark / large font | **PASS**: dark and light, font scale 2.0 on the Guide (all controls on screen), Urdu RTL |
| 22 | Pack integrity | **PASS** (pinned-digest status line, 10/10 on-device self-test) |

**Device-location path (tested separately from the SDK walker).** The app's own "Location source" switch selects the expo-location adapter. The real OS prompt appeared; **Approximate** was refused by the SDK with "Live navigation needs precise location, but only approximate location is allowed". Precise was then granted with `adb shell pm grant ...ACCESS_FINE_LOCATION` (the equivalent of the user raising it in Settings). Fixes were injected through the emulator console (`adb emu geo fix`, a script walking the real Gate 12 to Block 12 route at 12 m spacing and 1 Hz; **not** a GPX file replay and not a recorded real walk): "902 m left" at the start, 698 m after 20 fixes, then 70 m off route gave a genuine **"Route updated from where you are."** (500 m left), then arrival "You have reached the block boundary". Active `HIGH_ACCURACY` request for the app existed while Live ran and none remained after Exit or after arrival (`dumpsys location`). The individual boundaries (OS delivery, Google fusion, adapter, SDK ingestion) were not instrumented one by one; the end-to-end effect on progress, reroute and arrival is the evidence. The 70 m offset was one leg only.

### 10.4 iOS native (Release build, simulator)

Evidence level: **SIMULATOR** (simulated Core Location through `simctl location`). Task-owned simulator `OfflineMap-SDK-C3-iOS26`, iPhone 17, **iOS 26.2 runtime** (the earlier 26.3.1 simulator is not on this Mac; created new, no other simulator touched), Xcode 26.2. `expo prebuild`, `pod install` (needs a UTF-8 `LANG`), `xcodebuild -configuration Release` for the simulator: **BUILD SUCCEEDED** after supplying real-path `PROJECT_ROOT` / `ENTRY_FILE` (the known `/tmp` Metro trap, not a product defect). `SdkLocationPrecision` is in `Podfile.lock` (autolinked from the package). Harness `docs/sdk/release-closure-2026-11-10/native-tests/ios-candidate3/` (derived from the candidate-2 harness; geometry assertions measured at run time and not weakened).

Result: **7 tests, all PASS**. Tests 01-06 passed on the first run. Test 07 failed once on its first run at a "No verified route yet" label check made immediately after the row appeared (no wait). The same assertions passed on two reruns (49 s each); the check now waits up to 8 s for the element. This is recorded as a harness timing race, not a product change; no assertion was loosened.

| Test | Covers | Result |
| --- | --- | --- |
| 01 full journey | search, preview, Guide, Live, progress, reroute, arrival, second journey; device-source fixes | PASS (127 s) |
| 02 background / foreground | Guide and Live survive Home and return | PASS |
| 03 appearance | light, dark, forced app appearance, layout | PASS |
| 04 Urdu RTL, large text | Urdu at `extra-large` and `accessibility-extra-extra-extra-large`, mirrored order, touch size | PASS |
| 05 venue switch, Roman Urdu | Karachi to synthetic and back, no place leak, Roman Urdu draft UI | PASS |
| 06 block route (new) | Block 12 from Gate 12, device-source walk, a genuine 70 m off-route leg, reroute, **provisional arrival wording** and no generic "You have arrived" | PASS (142 s) |
| 07 unreachable / pending (new) | Gate 18 and the pending Demo Tent: explanation only, no Live, Try again or Guide | PASS (after the harness wait) |

Network: 153 periodic `lsof` samples of the app process showed no socket. iOS watcher cleanup after Exit was **not** measured separately on iOS (it was on Android, and arrival/Exit is asserted in the SDK tests). The iOS precision module was exercised at full accuracy only (reduced accuracy was not simulated).

### 10.5 Client delivery verification

| Check | Result |
| --- | --- |
| `scripts/sdk-package/client-acceptance.mjs` on **both** final archives (unpacked outside any repository: archive audit and checksums, venue tool compile / verify / pin, `npm ci` from the shipped lock with one React / React Native / MapLibre, headless journey, type-check against the shipped declarations, app tests, plugin result for both platforms with the iOS module autolinked, invalid options rejected, production exports for both platforms with a client pack added, no developer paths or keys) | **PASS, 13 steps each** (internal 786 / 788 module sources, external 778 / 780) |
| Shipped importer on the real owner workbook (`venue-pack import`, the shipped `venue-pack.cjs`, a base pack rebuilt from the delivered synthetic assets) | **NEEDS_REVIEW** as designed: 99 ilaqas, 0 errors, 8 review items, 1 warning; the workbook's SHA-256 is unchanged. (`verify` on that rebuilt base failed only because its basemap file is shipped under another name; not a pack defect.) |
| External profile data | No Karachi pack file; the only Karachi-named file is the shared basemap `karachi-basemap.pmtiles`, an OpenStreetMap-derived vector extract (see `BASEMAP_PROVENANCE.json`), which the synthetic venue sits inside. It is not the owner's survey data; whether it may leave the owner is a rights decision (10.7) |
| Expo plugin, Metro helper, precision module link, one React / RN / MapLibre | PASS (inside the 13 steps and the Android / iOS builds above) |
| Toolchain reproduction | The tar and member hashes are the cross-machine identity; the `.tgz` hash depends on the compressor (section 9). Not re-compared on another Mac |

### 10.6 Source tests after the fixes

Full Jest 234 suites / **2,525** tests passed (was 2,524: +1 arrival regression; the Gate 18 and pending cases gained assertions); `npm test` (112 scripts) exit 0 including "303 nodes, 90300 routable + 1206 unreachable pairs == golden" and the 91,506-pair service parity; `tsc` and ESLint clean.

**Hosted CI ("SDK checks").** `1f32f22`: **SUCCESS** (run 42836372580, 2 m 34 s). Final code commit `b74aa4a`: **SUCCESS** (run 42853963398). The report-only commit that follows triggers its own run, which is not claimed here. A passing hosted run proves only the checks in the workflow (typecheck and lint, SDK tests, routing suite), not native behaviour.

### 10.7 Limitations, data and authorizations (unchanged by this pass)

- **Not a physical device.** Emulator and simulator only; no real GPS, no airplane-mode test on iOS, no TalkBack or VoiceOver audio, no human accessibility review.
- **Android signature** is the Expo template's debug keystore, not a production signing key.
- **Survey inputs still missing, nothing invented:** verified access points or walkable connectors for blocks, Gates 18 and 19, tent / ilaqa / facility coordinates, a venue boundary; native-speaker review of every Urdu and Roman Urdu string (now 85 drafts).
- **Rights:** the Karachi preset and the internal delivery are owner-controlled and not cleared for external distribution; the shared basemap needs the same decision before an external hand-over. Production signing and distribution approval, independent security review and the legacy host-only point-in-polygon copies are out of scope and unchanged.
- Native items not run on Android: typed Urdu-script and Roman Urdu queries, the return venue switch, counting all 42 block outlines.

### 10.8 Final engineering verdict

**SDK 0.1.1 Candidate 3 is an engineering release candidate** for source `b74aa4a`: source verified, Android emulator verified, iOS simulator verified, client delivery verified (two archives, 13 steps each), and no confirmed unresolved P0 or P1 software defect (two defects found by native testing were fixed with regressions). It is **not** approved for unrestricted production or external distribution of the Karachi data: field survey, legal / rights, physical-device, human accessibility, translation and signing approvals remain separate and open.
