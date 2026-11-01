# Android emulator — partial execution

Evidence level: EMULATOR. Source HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`, executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. SDK and delivery identities: [README](README.md). Candidate ARM64 Release APK SHA-256 `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; app `com.example.sdkconsumer` 0.0.0/1, API24 minimum/API36 target, Hermes/new architecture, test debug certificate only.

Existing Ijtema_API_36_Play, Android16/API36 ARM64, 1080×2400 at420dpi, Apple M1 Pro host GPU. AVD data preserved; no Codex_API36_131 use. Fresh native build: exit0, 3m39s,276 executed tasks. Existing installed APK preserved before update; existing app data retained, so no empty first-install claim.

Raw evidence directory: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01/`. Every named snapshot has XML and PNG.

| ID | Input / expected | Actual / status | Evidence |
|---|---|---|---|
| A01 | Build final delivered graph as standalone Release | PASS: build exit0; no Expo Go/Metro server | android-build.log, android-build-identity.json |
| A02 | Embed all shipped offline pack assets unchanged | PASS:12packfiles+PMTiles matched exact SHA in APK | android-build-identity.json |
| A03 | Install update preserving old data | PASS: install -r exit0; original binary copied | android-install.log, preexisting-installed-consumer.apk |
| A04 | Cold launch / offline directory | PASS: am start -W exit0;536ms initial native launch,1172ms after virtual-device reboot; directory/gates visible | android-launch.log, android-01-directory.xml/png |
| A05 | Gate02 destination, choose Gate01 origin, preview | PASS:111m route, visible line/start/end/venue points and local roads; no same-destination option in origin list | android-02 through android-04 snapshots |
| A06 | Manual Guide first/next/final boundaries | PASS: first Previous disabled; Next reaches step2 then final3/3 with Next disabled | android-05, android-06, android-07 snapshots |
| A07 | Previous from final | PASS: returns step2; captured with demo tools subsequently open | android-09-tools snapshot |
| A08 | Urdu switch during manual step2 | PASS layout subset:step2 retained, RTL controls/Urdu instruction; wording approval pending | android-11-urdu-step2 snapshot |
| A09 | In-app Dark from System/light | FAIL observed appearance: Dark selected but map/panel remain light. Root cause NOT established; later guest transport failure prevents reliable attribution. No speculative source correction. | android-10-dark-step2, android-current PNG |
| A10 | Guest responsiveness while testing OS night control | BLOCKED environmental: echo,cpuinfo,activity,screenshot each timed out8s; emulator console kill succeeded. Restart/retest required. | android-transport-blocker.json, android-emulator-second-boot.log |

No matching fatal/ANR/React Native error in the bounded initial startup log. Baseline app TOTAL PSS130644KiB,RSS224320KiB; not a physical benchmark.

One overlapping UIAutomator capture exited137; its incomplete Previous snapshot was not accepted. The subsequent complete step2 snapshot is the evidence. All following UI actions must run sequentially; helper now uses bounded15s commands and compressed hierarchy. No application assertion was weakened.

Android native-provider GPS, permissions, rerouting, arrival, verified offline isolation, pack self-test, text scales and stress remain NOT RUN at this partial checkpoint. Physical acceptance remains BLOCKED.
