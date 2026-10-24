# B10 release readiness, device/field scripts and blocker register

Status date: 2026-10-24 (PC 1, branch `feat/muslim-ummah-offline-navigation-sdk`, issue #392). Evidence levels are never merged: **source** (Jest / headless / typecheck), **simulator or emulator runtime**, **physical device**, **field**.

## Verdict: NOT RELEASE READY

Required gates that are open or failed:

1. **B7.1 critical defect.** In Urdu at the Extra-Large text size the original app hangs on the guide transition (historical, run06). Codex's coordinated Button/Places/guide candidate fixed that transition, but opening Settings from Urdu Extra-Large then hung the app (about 100% CPU, no accessibility tree; heading `ترتیبات`). Whether the original app also hangs on Settings was not tested. The candidate was rolled back. The production source still has the original Urdu text-layout defect. The native build allowance is spent; a further build needs renewed owner authorization.
2. **Android EMU-N8** has no record in this repo and was not reproduced or fixed (no Android build/emulator run was authorized in this workstream).
3. **No real Muslim Ummah React Native host exists** on PC 1 (the only repo found is a native Swift/CocoaPods iOS app, not touched). B8 integration is not done.
4. **No pack signing keys or delivery channel.** Authenticated remote/imported pack acceptance cannot be certified.
5. **No physical-device or field evidence** (whole-device airplane mode, VoiceOver/TalkBack speech, real GPS, walking, arrival, Gates 18/19).

`ENGINEERING COMPLETE` and `CONDITIONALLY READY` are not claimable until 1–3 are resolved.

## Evidence matrix

| Area | Source | Simulator / emulator | Device | Field |
| --- | --- | --- | --- | --- |
| Routing algorithms and golden data (2,400 differential, 91,506 golden pairs) | PASS (historical full suite; routing sources untouched since) | n/a | n/a | Gates 18/19 and unsupported pairs NOT VERIFIED |
| SDK headless domain + exports (`npm run test:sdk-headless`, `test:sdk-exports`) | PASS (77 / 8 on 2026-10-24) | n/a | n/a | n/a |
| Pack contract, verifier, lifecycle manager (B9.1/B9.2) | PASS | n/a | n/a | n/a (no host adapters or keys yet) |
| iOS original-app baseline: relaunch, offline PMTiles map, native OSM attribution, Manual Guide Next/Previous/collapse/reopen, End→preview, Cancel, new route, background/foreground (English) | n/a | Observed on the original build (run06; see roadmap) | NOT RUN | NOT RUN |
| iOS Urdu Large→XL guide transition | candidate only | Candidate passed liveness; **original FAILS**; candidate rolled back | NOT RUN | NOT RUN |
| iOS Urdu XL Settings | n/a | **FAIL** on the candidate (hang); original NOT TESTED | NOT RUN | NOT RUN |
| iOS English/Urdu size matrix, Live activation, reduced-precision fail-closed, Directions reopen, Recenter, missing/corrupt map recovery, accessibility | tests exist for logic only | NOT VERIFIED on a corrected build | NOT RUN | NOT RUN |
| Android (EMU-N8, font/density, map mount, Manual/Live, Exit/restart) | components tested in Jest | NOT RUN in this workstream | NOT RUN | NOT RUN |
| Offline operation with MapLibre network denial | n/a | Simulator-level HTTP denial only; **not** whole-device airplane mode | NOT RUN | NOT RUN |
| Pack rollback / corrupt-pack recovery on a real filesystem | headless fake-store tests only | NOT RUN | NOT RUN | n/a |

## Physical iPhone script (NOT RUN; needs a device, the owner, and a build)

Preconditions: a build that includes the B7.1 fix; a physical iPhone; note iOS and app version; use a test Apple ID only if sign-in is asked. Do not change device-wide settings without the owner.

1. Fresh install; launch with the device online; confirm the map renders from the bundled PMTiles and the OSM attribution is visible.
2. Enable whole-device Airplane Mode (Control Center, with Wi-Fi/Bluetooth off). Force-quit and relaunch. Pan/zoom; the map and Directory must work with no network.
3. Settings → app → Location: test Never, While Using with Precise Location off (reduced), and Precise on. Expect: denied/reduced = Manual Guide only, Live refuses to start; precise = Live may start only through the explicit start.
4. Manual route: Directory → destination → Map → pick origin → Route Preview → Manual Guide → Next/Previous → Exit → new route.
5. Language/text: switch to Urdu; set Larger Text to Large, then Extra-Large, then an Accessibility size; repeat step 4 and open Settings at each size. Record any freeze (a stuck CPU or an unresponsive UI is a failure).
6. VoiceOver on: swipe through Directory, Map controls, Guide steps; every control needs a spoken label in the active language; check focus order in Urdu RTL.
7. Background the app mid-route for 60 s and return; Exit; relaunch.
8. Record: device, iOS, app build id/hash, per-step pass/fail, screenshots, any crash log. A pass here is device evidence only for that build.

## Physical Android script (NOT RUN)

Preconditions: a release build, a physical Android device, USB debugging only if the owner allows it.

1. Fresh install, airplane mode on, relaunch; map and Directory work offline; attribution visible.
2. Settings → Display: font size and display size at default, then largest; repeat the Manual route; record layout clipping, overlap or sheet-measurement problems (this is the EMU-N8 area).
3. Permissions: deny, approximate-only, precise; confirm Live fails closed unless precise and explicitly started.
4. TalkBack: traverse Directory, Map controls, Guide; check Urdu label order and RTL.
5. Background/foreground, Exit, force-stop and relaunch, new route.
6. Record build hash, device model/API level, results, screenshots.

## Field checklist (Ijtema Gah; NOT RUN; needs site access and ground truth)

Real entrance and gate mapping; route connectivity and walking viability; GPS accuracy and drift by zone; venue boundary; instruction clarity; arrival detection at each target class; real reroute off-route; offline operation for the whole walk; Gates 18 and 19 geometry; the documented unsupported route pairs. Observations must be measured on site. Do not add graph connectors or edit goldens to improve coverage.

## Pack operations (headless contract, host adapters pending)

- Install: host stages files, `checkRoom()` before download, `installStaged()` verifies and activates in one pointer write.
- Rollback: `rollback(venueId)` returns to the confirmed previous pack, else to the bundled pack. Call `confirmActive(venueId, packId)` only after that pack served a successful session.
- Recovery: call `recover()` once at app start; a corrupt pointer serves the bundled pack and needs `repairPointer()`.
- Security limit: SHA-256 proves content integrity against a trusted digest, not publisher authenticity. Authentication needs signing keys that do not exist yet; keep private keys out of Git, binaries, fixtures, logs and uploads.

## Blocker register

| ID | Blocker | Needs |
| --- | --- | --- |
| R1 | Urdu XL Settings hang and Places text-surface height (B7.1) | Source fix, then renewed owner authorization for one iOS build |
| R2 | Android EMU-N8 and Android regression | Android emulator/device and build authorization |
| R3 | Real Muslim Ummah host | Owner decision on the target app (React Native host vs. the existing native iOS app) and write access |
| R4 | Pack signing keys, key custody, delivery channel | Owner provisioning; no key may be generated by tooling |
| R5 | Pack host adapters, bundled Karachi pack manifest, pack compiler | Engineering (next B9.3 unit); native verification needs a build |
| R6 | Physical-device acceptance | Physical iPhone/Android, owner presence |
| R7 | Field acceptance, Gates 18/19 | Site access and surveyed ground truth |
| R8 | GitHub CI billing block reported on 2026-10-18 (#380/#381 area); current status not re-checked | Owner action on GitHub billing if still blocked |
