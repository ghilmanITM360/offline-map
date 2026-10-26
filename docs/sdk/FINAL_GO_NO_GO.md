# Final GO / NO-GO — SDK 0.1.0 release candidate (2026-10-27, #392)

Evidence levels are kept separate: Jest/package/bundle, iOS simulator, Android emulator. **There is no physical-device, real-GPS, whole-device airplane-mode, screen-reader or field evidence.** The per-item status is in [FINAL_CLOSURE_LEDGER.md](FINAL_CLOSURE_LEDGER.md).

## Verdict
**ENGINEERING IMPLEMENTATION COMPLETE FOR SDK 0.1.0 CONTROLLED PILOT — EXTERNAL ACCEPTANCE PENDING.**
- **GO** for a controlled pilot / client integration of the private package, with the host app keeping its own navigation authority.
- **NO-GO** for an unrestricted production release.

## What is done and verified (at the levels stated)
| Area | State | Evidence |
| --- | --- | --- |
| Headless engine, controller, candidate Live, outside-route provider, reroute | done | Jest, plain-Node headless |
| Host/SDK parity (C4.1) and shared policy (C4.3-a) | done, bounded | parity matrix, replay tests |
| Pack format, verifier, manager, filesystem store, compiler, real Karachi pack | done, byte-reproducible, digest-pinned | Jest, driver rebuild check, on-device self-test |
| Expo FileSystem adapter, bundled-pack runtime, pack-driven consumer | done | Jest, iOS simulator, Android emulator |
| iOS continuous location | mechanism found, fixed in the reference adapter | simulator, native + JS logs |
| Large text / AX5, dark basemap, appearance, RTL language picker, entry-gate chooser, camera browsing (C6) | done | Jest, iOS simulator, Android emulator |
| Startup verification speed | 1,460 → ~200 ms (iOS sim), 919 → 84 ms (Android emu); integrity unchanged | on-device measurement tool |
| Client docs, compatibility matrix, security report, release notes, translation review | updated | this repository |

## What blocks an unrestricted release (owner/hardware)
1. Physical iOS and Android devices with real walking; continuous Live GPS on a physical iPhone.
2. Whole-device airplane-mode cold start.
3. VoiceOver / TalkBack passes; reviewed Urdu / Roman Urdu copy.
4. Pack signing: no scheme, key or verifier exists, so imported/remote packs are refused (key custody, rotation, distribution are an owner decision).
5. Venue data rights: the owner-supplied survey's redistribution terms are not recorded in the repository.
6. Gates 18/19 field survey (still unconnected and `ground_truth_required`).
7. External security review; publishing decision for the package.

## Known product limits
- The Ijtema host still has its own navigation authority (workstream B); no Ijtema outside-route provider exists, so the entry-gate chooser is exercised only in Jest.
- No speech output in 0.1.0; the host's *Voice instructions* switch is the host's.
- Android: a live system font-size change recreates the activity (restart the app); iOS follows live changes.
- Untranslated strings stay English inside an Urdu (right-to-left) screen.
- expo-location 19.0.8 defect (watch ended by a transient Core Location error) is worked around, not reported upstream.
