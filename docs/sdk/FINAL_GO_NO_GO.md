# Final GO / NO-GO — SDK 0.1.0 release candidate (2026-10-27, #392)

Evidence levels are kept separate: Jest/package/bundle, iOS simulator, Android emulator. **There is no physical-device, real-GPS, whole-device airplane-mode, screen-reader or field evidence.**

## Verdict
- **NO-GO** for an unrestricted production release.
- **GO** for a controlled pilot / client integration of the private package under the outstanding-acceptance list, with the host app keeping its own navigation authority.

## What is done and verified (at the levels stated)
| Area | State | Evidence |
| --- | --- | --- |
| Headless engine, controller, candidate Live, outside-route provider, reroute | done | Jest, plain-Node headless |
| Host/SDK parity (C4.1) and shared policy (C4.3-a) | done, bounded | parity matrix, replay and reference-formula tests |
| Pack format, verifier, manager, incremental SHA-256, filesystem store | done | Jest, kill sweeps, on-device self-test |
| Pack compiler and the real Karachi pack (C5.2) | done, byte-reproducible, digest-pinned | Jest, driver rebuild check |
| Expo FileSystem adapter, bundled-pack runtime, pack-driven consumer (C5.3) | done | Jest, iOS simulator, Android emulator |
| iOS continuous location | mechanism found and fixed in the reference adapter | simulator, native + JS logs |
| Client docs, compatibility matrix, security report, release notes | updated | this repository |

## What blocks an unrestricted release (owner/hardware)
1. Physical iOS and Android devices with real walking; a physical-device run of the iOS continuous-location path.
2. Whole-device airplane-mode cold start.
3. VoiceOver/TalkBack and large-font passes; reviewed Urdu / Roman Urdu copy.
4. Pack signing: no scheme, key or verifier exists, so imported/remote packs are refused. Needs an owner decision (key custody, rotation, distribution).
5. Venue data rights: the pack lists the owner-supplied survey with redistribution terms not recorded in the repository.
6. Gates 18/19 field survey (still unconnected and `ground_truth_required`).
7. External security review; publishing/signing decision for the package.

## Known product limits
- Cold start hashes bundled files in JavaScript (several seconds on the simulator): native hashing or a verified-once marker is the upgrade.
- The Ijtema host still has its own navigation authority; the Ijtema outside-route provider and venue-place conversion (rasta/facility/special routes) are not built, and the host progress projection (differs by up to 8.5 m) was deliberately not swapped without field data.
- C6 open: iOS AX5 panel height, dark basemap, `expo-system-ui`, `GateChooser` composition, voice instructions.
- expo-location 19.0.8 defect (watch ended by a transient Core Location error) is worked around, not reported upstream.
