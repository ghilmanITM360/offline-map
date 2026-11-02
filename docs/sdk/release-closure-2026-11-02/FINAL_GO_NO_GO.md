# Engineering checkpoint — 2 November final native retest

Original HEAD45daa0189c9718a46d797ef3e3be528feca4c36a. Validated source fixes: a1036cf847264fed5a0aca4b40fb54cd16059c8e (UrduXL horizontal Arrival clipping) and21d1ed40dc652f54670d49d3075b13d4c3be796d (preserve AX5 column width). Both normally pushed; no font/Yoga reversal, dependency/GIS/legal/signing changes. Full223Jest suites/2389tests,91506goldens,2400differentials, TypeScript, ESLint(2existingwarnings), npm test, security14, reproducible SDK packaging, actual-delivery63tests and both Metro exports pass after final source correction. Exact commands/log hashes: ARRIVAL_COLUMN_VALIDATION.json; native build logs external. Native builds used a103+ad20patch, committed as21d; SDK repacked from21d is byte-identical to the tested native input. No unnecessary rebuild after that proof.

Final iOS12/12 XCTest cases PASS, including five Arrival variants and native accessibility audit; expanded20groups12PASS/0FAIL/4BLOCKED/4NOTRUN. Android35rows counts are in ANDROID_FINAL_MATRIX.json. Memory INCONCLUSIVE: only6/20 measured sessions at mandatory92%usage stop. No known remaining reproduced source defect asserted; incomplete/native fault and memory evidence prevents closure. Automation failures are preserved separately.

Engineering software closure: NO-GO/incomplete evidence. Virtual-device full acceptance: NO-GO/partial; the precise12-case iOS simulator milestone is COMPLETE. Controlled pilot: NO-GO. Unrestricted production: NO-GO. Physical devices/real walking/whole-device airplane mode/human VoiceOver/TalkBack/89strings/venue rights/Gates18–19 survey/independent security/current exception approval/production signing and distribution remain external. No approval invented.

Task apps/providers/virtual devices stopped at checkpoint; no background work continues. Exactly one worktree and three original stashes preserved; protected .codex config remains untracked and unstaged. Verify final documentation-commit HEAD against tracking/live remote before resuming. Source HEAD21d1ed40dc652f54670d49d3075b13d4c3be796d; subsequent commit contains this QA record. All original five accepted hashes rechecked unchanged.

Final identities:
- sdkSha256: `a2bb865d38d457ea19228b81670616a57f353644dd05be1c2d16fafc738f71d4`
- deliverySha256: `87e17e33ea10be2ae40c4d1965159989cc5d492d1637263ce5e5ca62b98871e5`
- androidApkSha256: `40228465e6073b3c37d902f6870f54b0e26895327cb85026e0f4d2d9d7e87f90`
- iosExecutableSha256: `29962a589b6f0249417f5bf290aaf12efef06c729a81b65184f0c80429a8b32d`
- iosJsSha256: `ad88c6c7349e2d95eeecdb50f237beb7dd27f8d71cb3b84fc5315735fa6acf6c`

Android counts: {'PASS': 25, 'NOT RUN': 7, 'BLOCKED': 3}
