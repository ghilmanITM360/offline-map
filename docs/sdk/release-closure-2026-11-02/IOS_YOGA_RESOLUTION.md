# iOS Yoga / CocoaPods status — BLOCKED

2 November2026, tracking#395/#394. **ENVIRONMENT INSPECTION ONLY; no new iOS build or acceptance.**

Exact-lock Node24.14.0 install did not change the mismatch. Ruby3.0.0/JSON2.5.1/CocoaPods1.16.2; RN0.81.5; Xcode26.2. Unmodified installed Yoga.podspec SHA256 `edcabf5c6df6d0e9b90559a041ea57154144b48a10da7d060f299e9cb90123a3` matches previously verified official RN bytes (historical upstream comparison, not a new network comparison).

Fresh evaluated prebuilt JSON SHA1 `5934998fbeaef7845dbf698f698518695ab4cd1a`, identical to persisted local spec. Lock requires `3fd22c2cae22d7a2b0f0b538f55f7c2a17dc94d5`. Source mode produces `728df40394d49f3f471688747cf558158b3a3bd1`. CocoaPods computes JSON-spec checksum over serialized file bytes; raw Ruby podspec SHA1 is a different identity.

Structured comparison: source vs prebuilt differs only at `source_files`: `yoga/**/*.{cpp,h}` versus `yoga/**/*.h`. All other evaluated fields, including47lexically ordered private headers, match. Expected locked JSON is unavailable here, so expected-vs-current field differences are **UNKNOWN**, not inferred from the checksum. `yoga/field-comparison.json` records exact fields. The earlier six-run investigation in IMPLEMENTATION_ROADMAP.md confirms this is not a newly discovered checksum condition. Git history records a08601d changing it and545017e retaining it; neither proves generating environment.

Pods/Manifest.lock and Pods.xcodeproj/project.pbxproj remain missing. No pod install attempted because the discrepancy remains unexplained; no checksum edit, synthetic spec, verification bypass, pod update or native regeneration. Native build PASS cannot be claimed.

**Smallest next action:** on HomeMac, export the unchanged lock-producing `ios/Pods/Local Podspecs/Yoga.podspec.json` and verify SHA1 equals3fd22c2; also capture Yoga.podspec bytes and Ruby/JSON/CocoaPods versions plus RCT_USE_PREBUILT_RNCORE/RCT_USE_RN_DEP/USE_FRAMEWORKS/INSTALL_YOGA_* flags. Compare exact fields/serialization with the preserved PC2 evaluation before a lock-respecting `pod install --deployment`.

Reproduce from repository root with task-local Node PATH: `ruby <evidence-root>/evaluate_yoga.rb <new-output-directory>`. The evaluator uses installed RN helpers and normal Pod::Specification evaluation for source/prebuilt modes; it does not modify inputs. Evidence root is in PC2_ENVIRONMENT_RECONCILIATION.md.
