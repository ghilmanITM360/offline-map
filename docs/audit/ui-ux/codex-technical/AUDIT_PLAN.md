# Codex Technical Runtime Audit Plan

**Scope:** Independent technical and Android-emulator evidence only. No production-code or test changes. No GitHub or Claude-owned audit-file mutations.

**Baseline:** `integration/ijtema-clean-baseline` at `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.

## Controlled sequence

1. Record Git, branch, APK, emulator, package, permission, service, and build provenance.
2. Inventory screens, conditional states, components, accessibility props, localization, and test coverage from source.
3. Run required source validation and focused routing/navigation suites without modifying source.
4. Build a fresh debug-signed release-shaped APK from the fixed baseline; hash and inspect its bundle for test-only injection.
5. Diagnose live-location flow at each observable boundary before changing emulator state.
6. Exercise route preview, active navigation, rerouting, arrival, secondary screens, text scaling, and accessibility where environment permits.
7. Save sanitized screenshots, UI hierarchies, command logs, and a case matrix under this directory.
8. Re-scan source and compare independent results with existing audit documents only after inventory and runtime collection finish.
9. Commit evidence pack on `audit/codex-runtime-evidence`; do not push or open a PR without owner approval.

## Evidence rule

Every claim uses one of: SOURCE VERIFIED, AUTOMATED TEST VERIFIED, TRUSTED-BUILD EMULATOR VERIFIED, PHYSICAL DEVICE VERIFIED, HARNESS-ASSISTED, ENVIRONMENT BLOCKED, or UNVERIFIED.
