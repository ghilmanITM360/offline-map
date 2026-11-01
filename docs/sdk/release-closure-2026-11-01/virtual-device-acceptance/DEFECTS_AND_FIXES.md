# Defects and execution blockers

Test HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. Android APK `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; iOS executable `d6fdcca0f7ef05d27106d11ab221e49e2f727ecdb4cab8ac2a3326fbcfd2f47d`. Source, SDK and delivery bytes unchanged. Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01`. File identities are in EVIDENCE_SHA256.txt. UI observations use the native accessibility tree and screenshots; no Jest doubles were used for these native cases.

| ID | Status | Reproduction / boundary | Next action |
|---|---|---|---|
| VIRT-01 / A09 |Observed FAIL; cause unconfirmed |Android manual step2→tools→Dark; selected state changes but map/panel remain light. Later all guest ADB operations stall. |Reboot existing AVD, verify healthy shell/UI, repeat Dark/Light/System with timestamped screenshots and native config. Diagnose before fixing. |
| VIRT-02 / A10 |BLOCKED infrastructure |echo/cpuinfo/activity/screenshot each timeout8s; console kill succeeds. One earlier overlapping UIAutomator operation exit137. |Sequential bounded hierarchy calls, no concurrent dumps; preserve guest; separate transport failure from app defects. |
| VIRT-03 / I13 |BLOCKED visual reachability |iOS native arrival→AX5; Done below viewport; current scroll/drag attempts inconclusive; AX Finish works. |Verify actual touch gesture mapping/scroll; inspect existing ArrivalCard ScrollView before any correction. |
| BUILD-01 |Resolved invocation |Xcode embeds /tmp entry while Metro indexes /private/tmp; exit65. |Canonical ENTRY_FILE incremental retry exit0; no source fix. |

No production correction was made. No speculative fix, framework upgrade, golden edit or GIS change. Existing16 original SOURCE/RUNTIME passes are not reclassified by these limited observations. Any confirmed source defect next requires failing regression, minimal correction, affected native rebuild/retest and relevant safety checks. Native campaign remains incomplete.

API contract references consulted during diagnosis: [React Native Appearance](https://reactnative.dev/docs/appearance), [Expo color themes](https://docs.expo.dev/develop/user-interface/color-themes/). Neither establishes the cause of VIRT-01.
