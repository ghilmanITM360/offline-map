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
| iOS native | **BLOCKED (environment)**: prebuild and `pod install` pass and link `SdkLocationPrecision` from `node_modules`; `xcodebuild` cannot run because this Mac's Xcode 26.2 lacks the iOS 26.2 platform (two destination forms tried). The Swift file is byte-identical to the one that ran on the iOS 26.3 simulator for candidate 1 |

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
| Client-integration engineering for the agreed scope | **COMPLETE and verified** at the levels above; one iOS native build is BLOCKED by this machine's Xcode components, not by a source defect |
| Controlled pilot | **NO-GO until the owner's approval**; the engineering preconditions in this report are met |
| Unrestricted production | **NO-GO** until the external gates above are satisfied |
