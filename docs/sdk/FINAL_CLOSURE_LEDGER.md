# Final closure ledger — SDK 0.1.0 (2026-10-27, #392)

Scope is frozen: no new features, no framework upgrade, no redesign. Each item has exactly one class. Evidence levels are never merged:
**J** Jest/source, **S** iOS simulator, **E** Android emulator, **D** physical device / field (none exists).
Raw evidence: `~/Documents/offline-map-audits/offline-sdk-b7-b10-master-continuation-2026-10-24/c6-final/` (`ios/`, `android/`).

## FIX NOW — done

| ID | Item | Acceptance | Result |
| --- | --- | --- | --- |
| P0-A | iOS AX5 panel | Directory reachable, Manual Guide Previous/Next and Exit work, safe area kept, nothing truncated, journey survives the size change, normal / Extra-Large / AX5 | **PASS J + S + E.** Directory header scrolls with its list, Previous/Next (guide) and End navigation (live) pinned; headings cap at 1.8x. Root causes found on the iPhone: `flex: 1` in a stacked column collapsed the step buttons; an iOS TextInput keeps drawing at the previous scale (scaled by hand). Live change AX5↔default keeps trip and step. Android: 200% from a cold start. |
| P0-B | RTL / language layout | Direction flips, map controls do not, no chevron double flip, English LTR, language change keeps the journey, Android nav bar clear | **PASS J + S + E** with a runtime language picker (no restart). Urdu strings are host-shipped wording only (26 of 88), listed in `docs/sdk/client/TRANSLATION_REVIEW.md` — **pending owner review**; nothing invented. |
| P0-C | Voice switch | Find why it does not update | **Closed by finding.** SDK 0.1.0 and the sample have no speech contract and show no voice control. The switch is the Ijtema host's Settings row (controlled `value`; its `SettingItem` is declared inside the screen's render, so it is re-created on every state change — the likely cause of a switch that does not animate). Host workstream B, not fixed here; documented in the release notes and security report. |
| P0-D | System / Light / Dark | Follows the device, forced Light/Dark, readable bars, no reset during navigation | **PASS J + S + E.** `Appearance.setColorScheme`, explicit status-bar style, `expo-system-ui` 6.0.9. Android forced Dark keeps the system's light navigation bar (dark icons, readable). |
| P1-A | Dark basemap | Local, legible, route/markers/attribution visible, no reset on switch | **PASS J + S + E.** Same layers and single local archive, no glyph/sprite/remote URL, contrast tested; mid-route switch restyles in place (route, step and camera unchanged). |
| P1-B | Entry-gate chooser | Listing, selection, cancellation, preview, unsupported gates, new destination/Exit, RTL, a11y | **PASS J** against the real Karachi pack (Gates 18/19 never listed or selectable). Not shown on a device: the sample has no street router, so no provider exists there. |
| P1-C | Camera browsing | Pan releases follow, Live authority kept, Recenter restores, no loops | **PASS J + S + E.** MapLibre `userInteraction` is reliable on both platforms. |
| Ph3 | Slow startup | Measure, smallest safe fix, no integrity loss | **PASS J + S + E.** See measurements below. |

### Startup measurements (same app, same packs: two bundled packs, 2.9 MB read on first install, 1.9 MB on restart)

| Platform | Before (JS SHA-256 as shipped in C5) | JS SHA-256 rewritten | Platform digest (`expo-crypto`) |
| --- | --- | --- | --- |
| iOS simulator (iPhone 17 Pro, M-series Mac) | warm start: install 728 + recover 663 + open 69 = **1,460 ms**; first install 1,466 + 684 | restart 941–993 ms | warm start **≈ 190–250 ms** (install 76–123, recover 63–69, open 54–67); benchmark restart 146 ms, first install 255 ms |
| Android emulator (API 36 arm64) | — | restart 919 ms, first install 1,469 ms | restart **84 ms**, first install 163 ms |

Reading time is 0–63 ms; the rest was hashing in the Hermes interpreter. Integrity is unchanged: corruption (two flipped files and one deleted) was detected through the platform digest and repaired from the packaged copy at the next start (iOS), file digests back to the pinned values. A verified-once marker was rejected (it would trust path/size/time, not bytes). Simulator/emulator timings on a fast host: a phone will be slower in absolute terms.

## VERIFY NOW — done at S/E level

iOS: local offline map, directory/search, preview, Manual Guide, explicit Live with candidate confirmation, arrival and End, background/foreground, English and Urdu, AX5, Light/Dark/System, attribution, pack corruption/recovery. Android: offline map, manual guide, location denied then granted, Live on real emulator GPS, framing, RTL, 200% font (cold start), nav-bar clearance, Light/Dark/System. Not repeated this cycle: Settings-return on Android, TextKit CPU sampling on iOS (no change to the accepted `Text` wrapper).

## OWNER BLOCKED — open until genuinely done

| Missing evidence / decision | Responsible |
| --- | --- |
| Physical iOS and Android walking tests | Owner (devices, venue access) |
| Continuous Live GPS on a physical iPhone | Owner |
| Whole-device airplane-mode cold start | Owner |
| VoiceOver and TalkBack passes | Owner / accessibility tester |
| Reviewed production Urdu / Roman Urdu copy (62 strings have no wording; 26 reused host strings need confirmation) | Owner / translators |
| Gate 18/19 surveyed connectivity | Owner (field survey) |
| Venue-data redistribution rights (owner-supplied survey) | Owner / legal |
| External security review | Owner |
| Signing scheme, key custody, publication decision (imported/remote packs stay refused) | Owner |

## DEFERRED — outside the SDK 0.1.0 scope

- Original Ijtema host migration (C4 beyond C4.3-a: Ijtema `OutsideRouteProvider`, venue place conversion for rasta/facility/special routes, controller swap, progress projection) — a separate tracked workstream B; the independent consumer is the integration proof for 0.1.0.
- Speech/voice instructions (the host's switch belongs to the host).
- Android live font-size change without restart (needs the host to handle `fontScale` and RN to re-lay out; tried and not effective, reverted).
- Verified-once marker / streaming native hash for files over 8 MiB; upstream report of the expo-location defect (needs owner approval).

## Independent audit findings (Codex, 2026-10-27)

Tracked in [CODEX_AUDIT_REMEDIATION.md](CODEX_AUDIT_REMEDIATION.md): Historical implementation report:17 fixed at J/P (+S where stated). The31October independent retest verified16 original findings at SOURCE/RUNTIME; SUP-01 required refreshed disposition. See the1November release closure update below; the Android emulator regression of the rebuilt binary **passed** (evidence level E), which also confirmed and fixed the arrival-modal-vs-Android-nav-bar hypothesis (`e49ed1b`); device, screen-reader and field items stay open.

## FAIL — none open.

## Release closure update — 1 November 2026 (#393)

DELIV-01 engineering fixed/pushed91de2d1; SUP-01 selects publishedPostCSS8.5.32/image-size2.0.4 with bounded actual-call-site regressions and explicit remaining low/moderate tooling disposition. REG-01 unchanged focused scenarios pass3runs; full post-selection component suite222/222 and2367/2367 passes. No original16-findings runtime source, native source, venue pins or routing goldens changed. Full npmtest/typecheck/lint/package/reproducibility passed; exact delivered-consumer final acceptance and artifact identities belong to the attached final handoff.

All author-side results require focused independent final acceptance. Historical18AndroidPASS/2BLOCKED is aggregate A+targetedB, not a full corrected-APK campaign. Earlier iOS executable predates finalSDKd722. Physical/field/signing/rights/translation/external-security gates stay open. No unrestricted productionGO.
