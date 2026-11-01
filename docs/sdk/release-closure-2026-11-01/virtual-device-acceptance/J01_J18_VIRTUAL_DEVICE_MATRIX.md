# Original J01–J18 — virtual subsets

Definitions unchanged: [original plan](../external-acceptance/MANUAL_DEVICE_TEST_PLAN.original.md) and [physical matrix](../external-acceptance/J01_J18_ACCEPTANCE_MATRIX.md). No complete original J scenario is accepted by this partial campaign.

Test HEAD `0a96ad0cc07318ea7db0d75098f28580b80e7be9`; executable source `1a913b9e521c093499855625c8b3a76cc11fd61a`. Android APK `86f24fdfbf6ac0246633e5edfad0231a9343aa8d50345df8b421158470f585c7`; iOS executable `d6fdcca0f7ef05d27106d11ab221e49e2f727ecdb4cab8ac2a3326fbcfd2f47d`. Source, SDK and delivery bytes unchanged. Raw evidence: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01`. File identities are in EVIDENCE_SHA256.txt. UI observations use the native accessibility tree and screenshots; no Jest doubles were used for these native cases.

| ID / original subject | Android emulator | iOS simulator | Physical | Evidence / limitation |
|---|---|---|---|---|
| J01 continuous iPhone GPS | NOT RUN | BLOCKED / subset | BLOCKED | iOS I10–I12 partial;short simulated route, not10min/physical |
| J02 continuous Android GPS | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J03 precise explicit Live | NOT RUN | BLOCKED / subset | BLOCKED | iOS I10–I12 prompt/candidate/walk; precision toggles not independently evaluated |
| J04 approximate/reduced fail-closed | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J05 denial/settings grant | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J06 GPS loss/recovery | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J07 injected replay/noise/races | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J08 outside provider/fallback | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J09 field walkability | BLOCKED field | BLOCKED field | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J10 reroute safety | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J11 arrival/terminal ownership | NOT RUN | BLOCKED / subset | BLOCKED | iOS I12 arrival/I14 Finish; delayed-result races NOT RUN |
| J12 20 lifecycle races | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J13 terminate/OS-kill recovery | NOT RUN | BLOCKED / subset | BLOCKED | iOS I14 normal terminate/relaunch subset; OS-kill scenarios NOT RUN |
| J14 airplane cold launch | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J15 pack faults | NOT RUN | BLOCKED / subset | BLOCKED | iOS I09 native lab10 checks; remaining fault variants pending |
| J16 audible screen readers | NOT RUN | NOT RUN | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
| J17 large text/RTL/themes | BLOCKED / subset | BLOCKED / subset | BLOCKED | Android A08; iOS I03–I08 PASS subsets; A09 FAIL observation and I13 reachability BLOCKED |
| J18 Gate18/19survey | BLOCKED field | BLOCKED field | BLOCKED | Hardware/field prerequisites or scenario not executed; no inherited source-test PASS |
