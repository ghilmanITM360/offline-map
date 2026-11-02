# Continuation handoff — resumed 2 November 2026

The resumed starting HEAD was `d8b64d7968db2b5636e06f372340a2daea07a6b0`. Accepted executable source is `085a4930d4335653c37ef32d081e146edfe4d3c8`; a subsequent documentation commit closes this checkpoint. Verify actual local/tracking/live HEAD before writing. PC 2 owns native/environment remediation. Preserve the one checkout/worktree, three original stashes, protected `.codex/environments/environment.toml`, all branches, baseline, `main`, exact root npm installation, `node_modules-before`, and every accepted/rejected artifact. No concurrent same-task PC 1 writing.

`E` below means `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation`.

Completed and pushed:

- `3f8921a`: Yoga's checksum difference is Ruby glob ordering of the same 47 headers. Normal unchanged evaluation under isolated Ruby 2.6/CocoaPods 1.16.2 produces the locked checksum. Root `pod install --deployment` succeeds with 93 pods; Manifest equals lock and project exists. Podfile, lock and RN source are unchanged. Do not ask for missing Home Mac JSON again.
- `085a493`: Android Fabric font-context/cache invalidation plus native paragraph recreation. Actual Settings changes now measure English step/turn text at 47/69 → 88/97 px; Urdu reduction, step 2 retention, theme/language commits, one background return, pan/recenter and attribution pass. The initializer uses a deliberately pinned RN 0.81.5 internal API; its Kotlin compiler warning and upgrade revalidation requirement are explicit.
- Full final source checks pass: TypeScript, lint, npm test, 223 Jest suites/2,389 tests, 91,506 goldens, 2,400 differentials, security, exports/headless and reproducible packaging. Clean actual-delivery consumer passes 63 tests, TypeScript, security and both Metro exports; all 13 assets and source containment verified. No redundant full run after documentation-only changes.

Current identities:

- SDK: `d1260aaa49d771072a8ce51d097fe4f1225339020181fd3358cdc3fee906123c`.
- Delivery: `298c8b852c83ca92df87df3eb9d50fc9c5df54bd6ff66f9f7e70c284cbd1b3c9`, at `E/delivery-085a493.tgz`.
- Android APK: `d071437ce60366fdcf11c573a0736b127b605706f6b11420f366e0b890afeed2`, at `E/native/resume-20261102-font/sdk-consumer-085a493-arm64-release.apk`.
- Final iOS executable: `5d75d3b8b34fb28be1d4452d48fe697e7463170135cafc72265ba2c9f241dd66`; final JS bundle: `75d2597dae7a649398452d5af4140af18d4f1a383d527cdec872b0a792de213d`.

Both final platform Release builds succeed. Android's unchanged 35-row matrix is now **12 PASS / 0 FAIL / 0 BLOCKED / 23 NOT RUN** for the new APK. Earlier B's 25/1/9 is historical, not copied to changed executable inputs. A07 is fixed; A32/A33 pass. Remaining original unfinished variants and affected UI retests are explicit in ANDROID_NATIVE_RESULTS.md.

The source 70275f3 iOS consumer was built, installed and tested on the existing iPhone 13 mini, iOS 18.4, UDID `B4FE838C-215C-4C4C-9D64-B2952783A5D6`. Eight acceptance groups passed, including real Core Location fixture movement 111 → 91 m → Arrival. Native XCTest reports one passing AX5 swipe/Recenter/Done coordinate-touch test and confirms exit. Desktop mouse gestures failed to scroll; native XCTest gestures worked. Full-button safe-area assertions and normal/XL/Urdu variants still need work; current test only asserts hittability plus touch exit. The exact tested harness is committed in `native-tests/`.

The final 085a493 iOS app was then rebuilt successfully. Its native executable stays identical but JS bytes change. **No native scenarios have run after that final rebuild.** Do not inherit previous passes. The final app is at `E/native/ios-resume-20261102/DerivedData/Build/Products/Release-iphonesimulator/SDKConsumer.app`. The earlier app is preserved at `E/native/ios-resume-20261102/SDKConsumer-70275f3.app`.

Next actions when usage allows:

1. Install the final iOS app on that existing simulator, select the device adapter, feed the saved graph fixture through Core Location and reach Arrival. Strengthen the native XCTest to assert fully visible frames/safe-area clearance, then test AX5, normal, XL and Urdu touch/scroll/exit. Follow with Urdu Dynamic Type/unrelated commits, accuracy/errors/restarts/lost/recovery/reroute, offline/pack and lifecycle/stress cases.
2. Resume Android with the identified final APK: native GPS/reroute/watcher cleanup, genuine 200% Arrival, three-button/small-screen/accessibility, pack faults and noisy/permission races. Do not repeat completed 20-cycle tests just to regenerate logs; run affected final-binary cases deliberately.
3. Characterize memory using warm-up and two comparable bounded blocks with consistent idle samples of PSS/RSS/private dirty/Java/native/graphics and watcher/subscription counts. **LEAK STATUS: UNPROVEN.** Prior PSS growth is neither a proven leak nor a leak-free pass.

Tools and evidence:

- Prepend `E/runtime/node-v24.14.0-darwin-arm64/bin` to PATH. Global Node and root exact-lock install remain unchanged.
- Isolated Ruby wrapper: `E/ruby26-tools/ruby26-bundle`; CocoaPods executable: `E/ruby26-tools/bin/pod`. Its pinned libraries, logger requirement and toolchain lock are recorded in IOS_YOGA_RESOLUTION.md and YOGA_RESUME_EVIDENCE_MANIFEST.json. Avoid system Bundler 1.
- Java 17: `/opt/homebrew/opt/openjdk@17`; Android SDK: `/Users/ghilmanislam360/Library/Android/sdk`. Existing AVD: `Codex_Ijtema_API36`, serial `emulator-5554`.
- Native build consumer: `E/delivery-70275f3.verification/delivery-70275f3/examples/expo-consumer`, now containing the new actual tarball/plugins. No other installed package version changed. Fresh clean consumer: `E/delivery-085a493.verification/delivery-085a493/examples/expo-consumer`. These are disposable build consumers, never Git checkouts.
- `E/native/resume-20261102-font` contains E–I diagnostics, final source/package/build checks and `build_font_android.py`. Use `production-android-identity-v2.json`: v1 inherited three old metadata fields, corrected in v2 without changing APK bytes.
- `E/native/final-085a493` contains P01–P16 and actual Settings/frame measurements. `/usr/bin/python3` is required for XML; Homebrew Python's pyexpat is broken.
- `E/native/ios-resume-20261102` contains native graph/build/Core Location/AX5 xcresult/attachments. RESUME_EVIDENCE_MANIFEST.json pins new raw evidence; generated dependencies/DerivedData are excluded. Original evidence, binaries and failed probes remain preserved.

Task emulator/simulator and apps are stopped. Android font 1.0/System/English and iOS initial Large size were restored. No build or GPS feed continues. Usage was 3% five-hour/0% weekly at resume and reached 86%/13% before checkpointing; 17 GiB free, 36% host memory free. No paid credits or reset was used. Recheck actual meters before resuming expensive work.

Engineering closure remains incomplete. Controlled-pilot and unrestricted-production authorization remain NO-GO. Physical GPS/airplane mode, human screen readers, 89 strings, rights/survey, independent security review, exception approval, signing and distribution remain owner/external gates.
