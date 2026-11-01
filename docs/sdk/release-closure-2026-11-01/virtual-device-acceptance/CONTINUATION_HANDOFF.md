# Resume native execution

Test HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. Android APK `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; iOS executable `d6fdcca0f7ef05d27106d11ab221e49e2f727ecdb4cab8ac2a3326fbcfd2f47d`. Source, SDK and delivery bytes unchanged. Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01`. File identities are in EVIDENCE_SHA256.txt. UI observations use the native accessibility tree and screenshots; no Jest doubles were used for these native cases.

Stop reason:85% five-hour preparation threshold reached; preserve accepted binaries, do not rebuild unchanged source. First recheck five-hour, weekly, context, disk and live Git. Existing issue [#394](https://github.com/ghilmanITM360/offline-map/issues/394). Single checkout/branch/worktree and sole writer only.

1. Read results and both build-identity JSONs. Both new final-graph binaries exist; reuse them. Do not confuse older preserved APK/.app with candidates. iOS baseline Large/light restored, location cleared, simulator shut down. Android restoration outcome is in android-settings-restoration.json.
2. Reboot Ijtema_API_36_Play with host GPU, no snapshots/wipe. Verify ADB responsiveness. Resolve VIRT-01 Dark observation, run Android pack self-test and native-device adapter flow. Keep calls sequential and bounded. Current driver is android_control.py; SDK_NATIVE_EVIDENCE selects external evidence location.
3. On iOS native arrival atAX5, establish real scroll/action reachability before classifying VIRT-03. Existing ArrivalCard has maxHeight92% and ScrollView. Do not infer no-scroll from inconclusive desktop gesture injection. AX activation of Finish works but is not a touch PASS.
4. Continue Android/iOS native permissions, stale/loss/recovery/reroute/lifecycle/camera/display and stress batches; specifically transient Core Location error and bounded watcher restart are NOT proven by the completed normal traversal. Existing walking-fixture.json uses only3 tracked graph nodes, no invented GIS.
5. Execute verified Android network isolation and bounded iOS runtime denial, empty/warm startup separately without wiping preserved app data. Run remaining pack fault cases only on copied lab storage. Expand original J matrix only with actual evidence.
6. Genuine bugs require reproducible failure and RED→GREEN minimal correction, affected binary identity/retest, normal commit/push/equality. No source correction has yet been made in this campaign.

No full source regression rerun was needed for reporting/native build-only work; historical software tests are not newly executed results. Future code fixes require appropriate checks.
