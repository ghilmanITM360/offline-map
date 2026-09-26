# Runtime Verification Matrix

Controlled artifact: SHA-256 `82907c67633a11f73675e11fe5dafeda60af5bbce2ddd8c01a14d0175eb202b2`; source `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`; emulator Android 16/API 36.

| Case | State | Actual result | Classification | Evidence |
|---|---|---|---|---|
| RT-001 | Direct launch / Directory | Directory rendered and was operable | TRUSTED-BUILD EMULATOR VERIFIED | `03-directory.png`, `02-direct-launch.xml` |
| RT-002 | Home map | Offline venue graph/markers rendered; Google base map did not | TRUSTED-BUILD EMULATOR VERIFIED | `04-map.png` |
| RT-003 | Map key warning | “Google Maps key is not configured. Offline venue data still works.” visible; log reported Maps API `INVALID_ARGUMENT` tied to debug package/cert | TRUSTED-BUILD EMULATOR VERIFIED | `04-map.png`; runtime log observation |
| RT-004 | Unavailable current location | Recenter waited, then offered OK, remembered location, manual start | TRUSTED-BUILD EMULATOR VERIFIED | `05-after-gps-fix.png`, `08-controlled-gps-timeout.png` |
| RT-005 | Fresh GPS origin | Two official emulator `geo fix` commands accepted, but Android/App did not observe fresh fix | ENVIRONMENT BLOCKED | `07-controlled-gps-result.png`, `08-controlled-gps-timeout.png`, location log |
| RT-006 | Drawer | Home, Offline Maps, Settings, Help, About and version 1.0.0 rendered | TRUSTED-BUILD EMULATOR VERIFIED | `09-drawer.png` |
| RT-007 | Settings top | Appearance, map and navigation preferences rendered | TRUSTED-BUILD EMULATOR VERIFIED | `10-settings.png` |
| RT-008 | Settings permission/offline | Location Allowed; offline background Unavailable; delete action visible | TRUSTED-BUILD EMULATOR VERIFIED | `11-settings-permissions.png`, tree |
| RT-009 | Normal in-venue route | Block 13 selected; manual Gate 13 origin produced an 852 m offline walking route | TRUSTED-BUILD EMULATOR VERIFIED | `17-block13-preview.png`, `25-route-preview-manual-gate13.png` |
| RT-010 | Manual starting point | Manual picker opened; empty result and valid Gate 13 match observed; selection calculated route | TRUSTED-BUILD EMULATOR VERIFIED | `21`–`25` screenshots |
| RT-011 | Last-known fallback | UI option visible; device last-known candidate was stale and correctly rejected | Partial TRUSTED-BUILD EMULATOR VERIFIED | `08-controlled-gps-timeout.png` |
| RT-012 | Outside routing fallback | Provider/contract automation passes; runtime not completed | AUTOMATED TEST VERIFIED | test logs |
| RT-013 | Route calculation loading/failure | Component/ViewModel tests pass; runtime not completed | AUTOMATED TEST VERIFIED | test logs |
| RT-014 | Route Preview / Cancel / Start enablement | Preview rendered; Start correctly disabled for non-live manual origin. Cancel confirmation rendered, but confirming left a stale route-ready card and removed Cancel action | TRUSTED-BUILD EMULATOR VERIFIED; defect | `25`–`27` screenshots |
| RT-015 | Active navigation | Cannot start trusted normal path without fresh location | ENVIRONMENT BLOCKED | GPS diagnostics |
| RT-016 | Rerouting | Algorithms/tests pass; normal native-location runtime path not reached | AUTOMATED TEST VERIFIED; runtime ENVIRONMENT BLOCKED | reroute test; GPS diagnostics |
| RT-017 | Arrival / Done / second journey | Arrival/reset logic tests pass; end-to-end runtime not reached | AUTOMATED TEST VERIFIED; runtime ENVIRONMENT BLOCKED | arrival-reset tests; GPS diagnostics |
| RT-018 | Block preview and true Details | Block 13 preview and true expanded Details with “Block information” were independently captured | TRUSTED-BUILD EMULATOR VERIFIED | `17-block13-preview.png`, `18-block13-true-details.png` |
| RT-018B | Rasta / special route selection | Source discovered; independent runtime not completed | UNVERIFIED | — |
| RT-019 | Search Urdu / empty / unavailable | Search automation exists; independent runtime not completed | AUTOMATED TEST VERIFIED / runtime UNVERIFIED | search tests |
| RT-020 | Help / About / App Guide | All three rendered on current APK | TRUSTED-BUILD EMULATOR VERIFIED | `12-help.png`, `13-about.png`, `15-app-guide.png` |
| RT-020B | Privacy Policy action | Visible action returned “Link unavailable / not configured yet,” matching placeholder source | TRUSTED-BUILD EMULATOR VERIFIED; owner-content blocked | `14-privacy-link-unavailable.png` |
| RT-020C | Offline setup | Idle/unavailable screen rendered, but an open Home LocationSheet leaked over it | TRUSTED-BUILD EMULATOR VERIFIED; defect | `28-offline-maps.png` |
| RT-021 | TalkBack and GPS_LOST announcement | No direct auditory observation | ENVIRONMENT BLOCKED / UNVERIFIED | accessibility report |

No row marked emulator verified relies on state injection or a diagnostic harness.
