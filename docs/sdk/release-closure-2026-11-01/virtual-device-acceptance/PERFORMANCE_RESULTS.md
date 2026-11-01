# Performance and stress — bounded observations

Test HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. Android APK `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; iOS executable `d6fdcca0f7ef05d27106d11ab221e49e2f727ecdb4cab8ac2a3326fbcfd2f47d`. Source, SDK and delivery bytes unchanged. Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01`. File identities are in EVIDENCE_SHA256.txt. UI observations use the native accessibility tree and screenshots; no Jest doubles were used for these native cases.

Virtual timings are not device benchmarks.

| Measurement | Observed | Evidence |
|---|---|---|
| Android Release build |3m39s;276tasks |android-build.log |
| Android cold native launch |536ms initial;1172ms after guest reboot |android-launch.log; execution output |
| Android baseline app |PSS130644KiB;RSS224320KiB |android-baseline-meminfo.txt |
| iOS existing-data pack startup UI |install136ms(copy46),recover75ms,open70ms |native AX and ios-06 |
| Android existing-data pack startup UI |install434ms(copy147),recover595ms,open224ms |android-09 XML |
| iOS font changes |four further size switches 0.19–0.66s command wall; CPU1.5–16.6%,RSS71872–111920KiB |ios-font-cycles.json |
| iOS AX5 sample |CPU6.1%,RSS129616KiB |ios-cpu-guide-AX5.txt |

No sustained TextKit hang observed during executed scenarios. CPU snapshots are not continuous profiler traces. Android guest-wide ADB stalls are environmental/infrastructure observations with no established SDK cause. Full launch/map/route/reroute latency benchmarking, leak analysis,20 sessions/background cycles and bounded long stress remain NOT RUN. No claim of leak freedom or physical performance.
