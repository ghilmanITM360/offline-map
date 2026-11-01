# iOS simulator — executed subset

Test HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. Android APK `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; iOS executable `d6fdcca0f7ef05d27106d11ab221e49e2f727ecdb4cab8ac2a3326fbcfd2f47d`. Source, SDK and delivery bytes unchanged. Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01`. File identities are in EVIDENCE_SHA256.txt. UI observations use the native accessibility tree and screenshots; no Jest doubles were used for these native cases.

Existing iPhone17Pro/iOS26.2, Xcode26.2(17C52), ARM64 Release/Hermes, minimumiOS15.1, signing disabled; not a physical-iPhone binary. Expo54.0.37/RN0.81.5/MapLibre11.5.0/ExpoLocation19.0.8/SdkLocationPrecision0.0.0. Prior installed app preserved. Initial Xcode exit65 was an entry-path alias mismatch (/tmp versus /private/tmp); canonical ENTRY_FILE retry exit0. No source alias or asset injection.

| ID | Input / expectation | Result | Evidence |
|---|---|---|---|
| I01 | Release build, linked precision module and13 asset hashes | PASS | ios-build-canonical-entry.log; ios-build-identity.json |
| I02 | Install standalone app and cold launch directory | PASS | ios-install.log; ios-launch.log; ios-01-urdu-directory-large.png |
| I03 | Large Urdu Directory → Extra-Large → toggle demo tools (unrelated React commit) | PASS | ios-01; ios-cpu-directory-extra-large.txt; native AX observations |
| I04 | Enter02 after font change; select sole visible Gate02 result | PASS | native UI keyboard/search observation; subsequent111m preview |
| I05 | Choose Gate01 manual start to Gate02 | PASS | native111m preview and ios-02-urdu-guide-step2-large.png |
| I06 | Manual first Previous disabled, Next to final disabled, Previous to step2 | PASS | native AX state; ios-02/03 |
| I07 | Urdu guide step2 Large/Extra-Large/AX5/reverse and four further changes; Next/Previous | PASS | ios-02 through ios-05; ios-font-cycles.json; CPU files |
| I08 | In-place Dark restyles map and controls; guide step2 retained | PASS | ios-06-dark-urdu-guide.png |
| I09 | Built-in native filesystem recovery self-test | PASS | 10 individual native AX PASS results; ios-pack-selftest-results.json |
| I10 | Select device adapter; explicit Live produces real OS prompt; Allow While Using App | PASS | ios-08-device-source.png; native OS prompt and candidate AX observations |
| I11 | Cancel candidate; reprepare; confirm Live explicitly | PASS | native AX Not now / Your live route / Start live navigation sequence |
| I12 | Core Location simulated walk existing geometry at1.4m/s;111→87→31m→Gate02 arrival | PASS | walking-fixture.json; ios-native-walk.json; ios-09 through ios-11; ios-location-native.log |
| I13 | AX5 Arrival Card visual action reachability | BLOCKED | ios-12/13: buttons below fold; current scroll/drag control did not establish reachability; AX Finish works, insufficient for touch PASS |
| I14 | Finish via AX; restore Large; terminate/relaunch without automatic Live | PASS | ios-14/15; ios-cleanup-and-relaunch.json; fresh Where to? native AX state |

14 recorded scenarios:13 PASS,0 FAIL,1 BLOCKED. This is a partial campaign, not full platform acceptance. I09 contains10 checks, not10additional top-level scenarios. No independent native-versus-JS callback counts, induced transient-error/backoff proof, reduced-precision toggles, reroute failure, network-denial or20 lifecycle-cycle proof. Those remain NOT RUN. Large and light OS settings restored; simulated location cleared and simulator shut down. Permission remains the tested foreground grant. No device or human screen-reader claim.
