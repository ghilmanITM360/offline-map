# Pack recovery

Test HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. Android APK `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; iOS executable `d6fdcca0f7ef05d27106d11ab221e49e2f727ecdb4cab8ac2a3326fbcfd2f47d`. Source, SDK and delivery bytes unchanged. Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01`. File identities are in EVIDENCE_SHA256.txt. UI observations use the native accessibility tree and screenshots; no Jest doubles were used for these native cases.

I09: iOS native filesystem self-test10/10PASS:

1. PASS — file system: replace, list, size, chunked read, rename onto an existing directory is refused.
2. PASS — replacing a file interrupted before the new text is moved in: the previous complete text comes back.
3. PASS — install, update, confirm and roll back across restarts.
4. PASS — a resource changed on disk: caught at the next start, the previous pack serves.
5. PASS — a resource deleted from disk: caught at the next start, the previous pack serves.
6. PASS — an update with a missing file is refused, its staging is removed, and the active pack is untouched.
7. PASS — an update interrupted before it is installed leaves staging that startup sweeps away.
8. PASS — a pinned journey keeps its pack files through an update; releasing lets them go.
9. PASS — storage pressure: an update that does not fit is refused before staging, the real free space admits one that does.
10. PASS — two venues stay separate: each resolves its own pack, and updating one leaves the other alone.

The lab root is separate from active packs, permits unsigned synthetic versions and cleans itself after execution. It is not production signing/trust proof. The post-test lab root was absent (0 files), so no intermediate recovered-file hash was retained. Do not claim that missing evidence. Production storage inventory retained14 files; both PMTiles hashes equal `d5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0`. See ios-pack-storage-hashes.json. APK and iOS app both embed all13 asset hashes.

Android self-test NOT RUN. Invalid manifest/hash/pointer variants, bit-flipped archive, deleted directory, imported-pack refusal and full fault/relaunch matrix beyond these10 checks NOT RUN in this campaign. Existing source tests are historical evidence only. Never corrupt original packs.
