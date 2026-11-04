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
