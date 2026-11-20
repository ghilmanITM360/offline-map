# Independent Technical and Runtime Audit Report

## 1–4. Provenance and environment

- Verified canonical branch: `integration/ijtema-clean-baseline`.
- Canonical/source baseline: `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.
- Evidence branch: `audit/codex-runtime-evidence`, created exactly from canonical.
- Fresh APK SHA-256: `82907c67633a11f73675e11fe5dafeda60af5bbce2ddd8c01a14d0175eb202b2`.
- Artifact: release Gradle variant signed with Android debug certificate because `-PallowInsecureReleaseSigning=true` was explicitly supplied; not production-signed.
- Application: `com.aicrafted.karachiijtema`, 1.0.0 (versionCode 1).
- Device: Android Emulator `emulator-5554`, `sdk_gphone64_arm64`, Android 16/API 36, 540×1200 override, density 210, font scale 1.0.
- Historical clean artifact independently pulled before replacement: SHA-256 `0fffa523955a4213b797a4f124211a0b1be9eb77020839708be3457d4a356b1e`.
- Injection scan: no `TestLocationInjector`, `scenarioRunner`, or `runtime-location-injection` string in either clean APK examined.

## 5–7. Independent source and automated-test discovery

- Screen inventory: `TECHNICAL_SCREEN_INVENTORY.md`.
- Component inventory: `TECHNICAL_COMPONENT_INVENTORY.md`.
- Test coverage and gaps: `AUTOMATED_TEST_GAPS.md`.
- Registered screens: Splash, Welcome, Permission, DownloadMap, LocationsDirectory, Main drawer, AppGuide; drawer screens Home, Settings, Help and About.
- Home has conditional Browse, Details, Directions, Route Preview, Navigation and Arrival modes on one shared map.
- Required validation passed at SOURCE/AUTOMATED TEST level: typecheck, lint, 55 Jest suites/597 tests, full script suite and all four routing-focused commands.

## 8. New technical findings

- CTF-001: fresh emulator GPS delivery blocked before app observation; environment boundary, not an established app defect.
- CTF-002: Maps SDK rejects this debug-signed artifact’s credential context; graph-only offline venue data remains.
- CTF-003: several registered screens lack rendered component tests.
- CTF-004: TalkBack/focus/live announcements materially under-verified.
- CTF-005: Cancel Route clears global planner but leaves stale local route-ready UI and removes Cancel action.
- CTF-006: open Home LocationSheet portal leaks over pushed Offline Maps screen.

See `TECHNICAL_FINDINGS.md` for source/runtime evidence and uncertainty.

## 9. Live-GPS result

ENVIRONMENT BLOCKED. Fine/coarse permissions were granted; Android location master switch and GPS/network providers were enabled. Two official emulator `geo fix` commands returned `OK`. Android GPS/fused last location nevertheless stayed stale, no new app-attributed request/delivery appeared in `dumpsys location`, Expo did not settle with a fix, and the application reached its honest 15-second unavailable path. Evidence stops before application observation.

## 10. Route Preview

TRUSTED-BUILD EMULATOR VERIFIED for Block 13 with manual Gate 13 origin. Result: 852 m offline walking route, Gate 13 entry, route geometry rendered, OSM attribution visible. Start Navigation was correctly disabled with explanatory copy because the origin was not a current precise live fix. Cancel confirmation rendered; confirmed cancellation exposed CTF-005.

## 11–13. Active Navigation, rerouting and arrival

- Active Navigation: ENVIRONMENT BLOCKED.
- Rerouting: AUTOMATED TEST VERIFIED; trusted normal runtime ENVIRONMENT BLOCKED.
- Arrival/Done/second journey: AUTOMATED TEST VERIFIED for state logic; end-to-end runtime ENVIRONMENT BLOCKED.

No harness-assisted result is presented as normal behavior.

## 14. Additional UI states

TRUSTED-BUILD EMULATOR VERIFIED: Directory, Home map, location-unavailable alert, drawer, Settings and permission/offline sections, Help, About, App Guide, Block 13 preview, true Block 13 Details, Directions start options, manual-start empty/valid search, route-ready state, Cancel confirmation and Offline Maps idle state. Offline Maps exposed CTF-006.

UNVERIFIED: rasta/special-route selection, Urdu keyboard entry, offline download progress/error/corruption/completion.

## 15. Accessibility

Two UIAutomator trees were preserved. Native-node presence is verified for Directory and Settings. Source accessibility props are inventoried. TalkBack utterances, focus order, GPS_LOST live announcement, font scaling above 1.0 and complete touch-target geometry remain UNVERIFIED or ENVIRONMENT BLOCKED. A hierarchy dump is not treated as auditory proof.

## 16. Evidence index

See `EVIDENCE_INDEX.md` for screenshots, hierarchies, environment logs, provenance and rejected/transitional captures.

## 17. Unverified and blocked states

- Fresh GPS success and live-origin route preview.
- Active navigation instruction/next-instruction/distance/ETA/progress/recenter/compass/exit/back.
- Jitter, deviation, reroute request/success/failure/cooldown and GPS recovery.
- Genuine arrival, Done reset and second journey.
- TalkBack auditory behavior and physical-device/field behavior.

## 18. Discrepancies

See `AUDIT_DISCREPANCIES_AND_HANDOFF.md`. Most important: true Details is now captured; CTF-005 and CTF-006 were not found in the existing master audit search; base-map behavior differs by certificate/key context.

## 19. Branch / PR

Evidence is isolated on `audit/codex-runtime-evidence`. No PR was opened or pushed automatically. No production code or tests changed.

## 20. Claude handoff

Claude should reconcile CTF-005/006 and update the true-Details coverage row. Preserve GPS/reroute/arrival classifications and provenance boundaries exactly. No GitHub issue or Project mutation was performed.
