# iOS Yoga / CocoaPods — installation resolved; consumer Release build PASS

Resume from d8b64d7, tracking #395/#394. **ENVIRONMENT VERIFIED**, not an iOS native-build PASS.

The actual cause is Ruby glob ordering in RN0.81.5 Yoga.podspec's `private_header_files`. Ruby3.0.0 defaults to lexical sorting; installed system Ruby2.6.10 returns filesystem order. Both contain exactly the same47 headers. No other evaluated field differs between the matching prebuilt configurations. JSON2.1.0 versus2.5.1 is ruled out: equal header order serializes to identical bytes.

| Legitimate evaluation | SHA-1 |
|---|---|
| Ruby3 default, prebuilt | 5934998fbeaef7845dbf698f698518695ab4cd1a |
| Ruby2.6 normal unchanged podspec, CocoaPods1.16.2 | **3fd22c2cae22d7a2b0f0b538f55f7c2a17dc94d5** |
| Ruby3 `sort:false` diagnostic comparison | same locked checksum/bytes |

Twelve source/prebuilt × framework × INSTALL_YOGA_WITHOUT_PATH_OPTION evaluations excluded those mode differences under Ruby3. The exact lock-producing HomeMac JSON was not received; its historical preservation is recorded in IMPLEMENTATION_ROADMAP.md. Its absence no longer blocks the demonstrated local mechanism. Do not infer HomeMac's Ruby version from this reconstruction.

[Upstream #56975](https://github.com/react/react-native/issues/56975) and [sorting correction64c9663](https://github.com/react/react-native/commit/64c9663152879a87d061a3f01b9e9c4e98cc73bc) describe the same class of instability. Local cross-version outputs establish this project's diagnosis. No upstream dependency patch or checksum rewrite was applied.

Provisioned isolated tools under `<E>/ruby26-tools`, leaving global Ruby/Node/gems unchanged: system Ruby2.6.10, task-local RubyGems3.4.22 library, Bundler2.4.22, CocoaPods1.16.2, compatible ActiveSupport6.1.7.10. Full42-gem resolution is captured in `toolchain-Gemfile.lock`; Gemfile, wrapper and installation logs are pinned by YOGA_RESUME_EVIDENCE_MANIFEST.json. These are historical build tools, not mobile runtime dependencies or a recommendation to adopt Ruby2.6 generally. Existing security/native-review and exception-approval gates remain open.

Normal `Pod::Specification.from_file` evaluation through the isolated wrapper produced the locked checksum before installation. Diagnostic JSON was never copied into Pods. Preserved the incomplete183MiB Pods tree at `<E>/yoga/resume-20261102-ruby-order/Pods-before-deployment` before installing.

Executed from repository `ios/`: `<E>/ruby26-tools/ruby26-bundle <E>/ruby26-tools/bin/pod install --deployment`. **PASS:93 dependencies/93pods**. `Pods/Manifest.lock` is byte-identical to committed Podfile.lock; Pods.xcodeproj/project.pbxproj exists; normally generated Yoga JSON hashes to the locked3fd22c2. Podfile, Podfile.lock, RN source and all committed dependency inputs remain unchanged. CocoaPods only reordered two existing root-project entries; the diff was preserved and original bytes restored. No pod update, validation bypass or clean prebuild.

Three existing RN dependency/Hermes script-phase warnings remain visible in the log. Actual Release compilation and simulator acceptance are **NOT RUN at this installation checkpoint**. Next: build/identify the delivered SDK consumer using this reproducible environment, then AX5Arrival actual-touch acceptance.

E=`/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation`. Evidence includes field-by-field comparison, actual glob probes, normal evaluator, source hashes, complete command logs and toolchain lock. Wrapper reproduction requires `-I` both task-local RubyGems and Bundler libraries plus `-rlogger -rbundler/setup`; see pinned wrapper, not the system default Bundler1.

Latest resumed result: both initial and final SDK consumer iOS Release builds PASS; final-runtime retests remain pending. See IOS_NATIVE_RESULTS.md for separate executable/JS identities and actual native acceptance. Earlier installation-checkpoint build-pending wording above is historical.
