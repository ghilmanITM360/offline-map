# Native virtual-device acceptance — execution ledger

Owner-authorized 1 November 2026. Android first, iOS second; one canonical checkout and SDK branch. This is EMULATOR / SIMULATOR evidence only. Physical and external gates remain pending; controlled pilot and production remain NO-GO.

Baseline source HEAD: `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; accepted executable source: `1a913b9e521c093499855625c8b3a76cc11fd61a`.

SDK SHA-256: `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`. Delivery SHA-256: `82b32fd74702a2e29ee8ff3913765c9591110b5d58eb7fec4c0730db72e8972e`. Consumer lock SHA-256: `64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68`. Freshly rehashed before execution.

Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01/`. Native generation/builds use the already installed, previously independently unpacked delivery under `/private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer`. It is not a Git checkout. No pack compiler or injected assets.

## Execution order

1. Verify resources, refs, ownership, accepted payload and native tools (completed).
2. Establish Android ARM64 Release binary against final dependency graph; install existing Ijtema_API_36_Play with host GPU; execute functional/location/offline/pack/layout/stress batches.
3. Shut Android down; establish iOS Release simulator binary including precision module; use existing iPhone 17 Pro / iOS 26.2; execute equivalent batches and Dynamic Type regression.
4. Map actual evidence to original J01–J18, preserve blocked subcases, validate and commit/push reports.
5. Reproduced defects require failing regression, minimal fix, affected-platform rebuild and original-scenario retest. No source defect inferred from GPU/resource failure.

## Initial checkpoint

42% five-hour / 66% weekly usage; no credits used. Approximately 12 GiB available; 16 GiB RAM and 12.4 GiB swap used, so single-worker sequential native builds. All requested virtual devices initially shut down. Xcode 26.2 (17C52), Java 17.0.19. Android prebuild completed; ARM64 Release build running. No application test results yet.

Trace: owner directive and native campaign [#394](https://github.com/ghilmanITM360/offline-map/issues/394); prior software closure #393 remains preserved.

## Executed checkpoint

[Android](ANDROID_EMULATOR_RESULTS.md), [iOS](IOS_SIMULATOR_RESULTS.md), [verdict](FINAL_SIMULATOR_EMULATOR_VERDICT.md), [open observations](DEFECTS_AND_FIXES.md), [J matrix](J01_J18_VIRTUAL_DEVICE_MATRIX.md), [next exact actions](CONTINUATION_HANDOFF.md). Native testing began and produced two new correctly identified Release candidates; the campaign is partial. No production source change. Read current checkpoint here and handoff; initial resource figures above are historical preflight.
