# Pack integrity and recovery

Android EMULATOR VERIFIED: shipped Run pack self-test completed10/10. Exact full results in native/final/pack-selftest-logcat.txt and B24/B25 XML/screenshots. Lab uses only ummah-packs-selftest storage, never tracked production inputs or active journey pack files.

Passed: filesystem replace/list/size/chunked reads/existing-directory refusal; interrupted file replacement recovers previous complete pointer text; install/update/confirm/rollback across restarts; changed resource rejects next start and falls back; missing resource falls back; missing staged file refuses/cleans staging/keeps active; interrupted staging swept; pin retains old files until release; two venues remain isolated; storage rejection and admission. Storage pressure uses an injected1000-byte free-space port plus actual free-space admission (5281MB), not a physically filled disk. Lab requireSignature:false is explicit; it proves storage/recovery, not import trust.

SOURCE/RUNTIME VERIFIED: full Jest and npm test cover manifest parsing, hashes, signature-required imports, malformed pointers, activation recovery and fail-closed policy. Production pack and91506goldens unchanged. Compiler safety regression has18checks, including4real builder canaries; no dangerous real directories were passed to the old implementation. See ledger and source validation.

Remaining native variants: exact bit-flip (lab replaces resource text rather than a literal one-bit mutation), invalid manifest, wrong manifest digest, interrupted activation pointer, malformed pointer and signature-required remote import are NOT RUN as distinct final-binary scenarios. Their source tests are not native evidence. iOS native lab onPC2 BLOCKED by Pods; historical HomeMac lab is separate.

Resumed source085a493: source/package gates pass; previous native results remain tied to their original binary. Current affected native retests are separate in ANDROID_NATIVE_RESULTS.md and IOS_NATIVE_RESULTS.md. External/physical J gates are unchanged; no approval inferred.
