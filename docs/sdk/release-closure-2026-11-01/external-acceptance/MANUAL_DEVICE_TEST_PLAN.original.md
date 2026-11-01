# Manual physical-device and field acceptance plan

All18 scenarios are **MANUAL TEST — NOT EXECUTED**. Exact models/OS/build hashes must be filled by the named owner before a run. Use a fresh approved build from the final fixed commit, not this audit’s old accepted binary. No outcome is pre-marked PASS. Store media durably with consent, redact coordinates from public logs, and hash originals/copies. Stop walking on an unsafe instruction.

## J01

- **Device/OS:** Physical iPhone; record model + iOS (include supported minimum representative and current).
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Approved final signed build; precise WhenInUse, foreground; surveyed safe route; no simulated source.
- **Steps:** Cold launch; Manual route; prepare/confirm Live; walk10min; turn at instructions; arrive; Exit.
- **Expected safe behavior:** Continuous new native timestamps; one watcher; truthful progress; no silent authority after Exit.
- **Evidence:** Screen recording, timestamp-only fix cadence/callback counters, route/session ID, OS settings, build/hash.
- **PASS/FAIL:** Fresh updates throughout and zero callbacks after Exit; FAIL on freeze, false arrival or retained authority.
- **Owner:** Owner/device QA.

## J02

- **Device/OS:** Physical Android; record model/API, include low-memory supported device.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Same final build/route; fine location; no mock location.
- **Steps:** Repeat J01 including several stop/start and app foreground cycles.
- **Expected safe behavior:** Same safety invariants with Android native GPS.
- **Evidence:** Screen/video, sanitized logcat, permissions, build/cert/SHA.
- **PASS/FAIL:** Continuous tracking and clean Exit; FAIL on duplicate watches/stale progress.
- **Owner:** Owner/device QA.

## J03

- **Device/OS:** Physical iPhone + Android; record OS.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Fresh app state; manually choose route first.
- **Steps:** Enable precise/full accuracy; request Live explicitly; confirm candidate; walk.
- **Expected safe behavior:** Prompt only on request; authorization read independently of numeric fix accuracy.
- **Evidence:** Settings before/after and video; capability reason.
- **PASS/FAIL:** Live only with valid authorization/fresh fix; FAIL on inference from fix accuracy.
- **Owner:** Device QA.

## J04

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Allow approximate/reduced authorization; manual route available.
- **Steps:** Request Live; retry; background/resume; toggle precise only in OS settings.
- **Expected safe behavior:** Live blocked honestly while approximate; Manual Guide continues; no automatic Live after settings grant.
- **Evidence:** Settings/capability reasons/video.
- **PASS/FAIL:** No precise-policy bypass; FAIL if approximate obtains Live authority.
- **Owner:** Device QA.

## J05

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Permission not yet requested; manual route.
- **Steps:** Deny first prompt; retry; later grant from Settings; reopen app.
- **Expected safe behavior:** Denial retains manual flow; no silent start; explicit new Live confirmation needed.
- **Evidence:** Prompt/Settings/video; callback count.
- **PASS/FAIL:** No unexpected watcher/prompt at launch; FAIL if denial silently starts Live.
- **Owner:** Device QA.

## J06

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Active safe Live route; controlled safe open area.
- **Steps:** Disable location/services temporarily; wait>8s; restore; deliver fresh fix.
- **Expected safe behavior:** Lost state; no invented progress; only a genuinely newer observation recovers.
- **Evidence:** Video + sanitized timestamp sequence and state.
- **PASS/FAIL:** Lost truthfully, no cached replay revival; FAIL on false good/progress.
- **Owner:** Device QA.

## J07

- **Device/OS:** Dedicated device/debug QA source; never production user app.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Explicit mock/injection build labelled synthetic, isolated venue.
- **Steps:** Inject forward/backward jumps, noisy points and interleaved A,B,A timestamps; repeat denial/grant overlap.
- **Expected safe behavior:** Bounded progress; hysteresis; old observations ignored; latest authorization wins.
- **Evidence:** Fixture, timestamps, state trace, watcher ownership.
- **PASS/FAIL:** No stale good/false arrival/duplicate reroute; FAIL on NAV-01/07 regression.
- **Owner:** Navigation engineer + QA.

## J08

- **Device/OS:** Physical iPhone + Android with host outside provider.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Host integration supplies reviewed provider; default sample has none; confirmed origin/gate/destination.
- **Steps:** Start outside; acquire full walking route; provider outage; offline fallback; malformed endpoint fixture.
- **Expected safe behavior:** Correct complete journey; labelled direct guide only; wrong endpoint refused; unsupported gates unavailable.
- **Evidence:** Provider identity/config sans secrets, polyline/endpoints, network mode, video.
- **PASS/FAIL:** Safe fallback and correct destination; FAIL wrong endpoint/false arrival or dead end.
- **Owner:** Host integration engineer + QA.

## J09

- **Device/OS:** Physical devices at actual Ijtema; record surveyed route and gate.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Owner-approved field path/gates; Gate18/19 excluded unless survey accepted.
- **Steps:** Walk selected gate-to-block routes and accessible exits; compare geometry to actual safe pedestrian paths.
- **Expected safe behavior:** All segments real and walkable; no fabricated connector.
- **Evidence:** Track with consent stored privately, video/photos, survey IDs, discrepancies.
- **PASS/FAIL:** Every segment safe/confirmed; FAIL impossible/unsafe connection.
- **Owner:** Surveyor + venue owner + field QA.

## J10

- **Device/OS:** Physical iPhone + Android in safe test route.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Active Live route; reviewed reroute policy.
- **Steps:** Leave path enough to meet hysteresis; trigger repeated changes; induce provider failure; rejoin.
- **Expected safe behavior:** Single reroute, cooldown respected, old valid route retained on failure, recover safely.
- **Evidence:** Video, distances, reroute IDs/counters/times.
- **PASS/FAIL:** No duplicate or late overwrite; FAIL stuck/false route loss/late mutation.
- **Owner:** Navigation QA.

## J11

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Active Live; arrange pending reroute near actual destination.
- **Steps:** Cross20m arrival boundary; hold pending result; Exit; let result complete; start new route.
- **Expected safe behavior:** Arrival/Exit terminal; zero authority/watch; old result cannot alter new journey.
- **Evidence:** State/watch/route IDs + video.
- **PASS/FAIL:** Arrival at real destination and no resurrection; FAIL late reroute reverses terminal state.
- **Owner:** Navigation QA.

## J12

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Active journey; permission reads may be delayed by instrumented QA adapter.
- **Steps:** Rapid background/foreground twice; revoke permission between; return; repeat20cycles.
- **Expected safe behavior:** One current watcher; latest permission; no background collection beyond declared foreground policy; route retained safely.
- **Evidence:** AppState/permission/watch ownership trace, video.
- **PASS/FAIL:** No leak/overridden revocation; FAIL NAV-01 reproduces.
- **Owner:** Mobile engineer + QA.

## J13

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** One Manual Guide and one Live session in separate runs.
- **Steps:** Terminate app normally; reopen; repeat OS-kill; ensure old pending results cannot resume.
- **Expected safe behavior:** No restored Live authority without explicit request; pack and map recover; route state honestly represented.
- **Evidence:** Before/after video, launch/callback logs.
- **PASS/FAIL:** No cached fix starts new Live; FAIL unexpected resume or corrupt pack state.
- **Owner:** Device QA.

## J14

- **Device/OS:** Physical iPhone + Android.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Install final release first; prepare empty-install and warm data cases separately; disconnect debug cable where feasible.
- **Steps:** Set whole-device airplane mode; disable Wi-Fi/cellular; terminate app; cold launch; open bundled venue/map; manual route; observe5min.
- **Expected safe behavior:** Local map/directory/route work without any network; no remote glyph/tile requirement; GPS availability labelled honestly.
- **Evidence:** Video of radio settings/cold launch, native file/network trace if possible, build SHA.
- **PASS/FAIL:** Both empty-install and warm launch work; FAIL mandatory resource fetch/dead end.
- **Owner:** Owner/device QA.

## J15

- **Device/OS:** Dedicated QA devices only.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Copied synthetic pack storage and approved fault hooks; originals preserved.
- **Steps:** Delete/corrupt one copied resource; interrupt update at swap; simulate low disk; restart; repeat confirmed/unconfirmed prior.
- **Expected safe behavior:** Detect corruption; preserve evidence; rollback/bundled fallback; never delete only recoverable pack.
- **Evidence:** Before/after checksums, fault index, recovery report, storage/video.
- **PASS/FAIL:** Every uncertain commit leaves safe recoverable state; FAIL PACK-01/04.
- **Owner:** Storage engineer + QA.

## J16

- **Device/OS:** Physical iPhone VoiceOver + Android TalkBack.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Final build; actual assistive tech enabled; ordinary and largest text.
- **Steps:** Navigate directory, select route, confirm Live; induce lost/recovered GPS/reroute/new instruction/arrival/Exit.
- **Expected safe behavior:** Labels/focus stable; safety changes audibly announced once; controls reachable; map Recenter described.
- **Evidence:** Consented screen/audio recording and focus order notes.
- **PASS/FAIL:** All critical changes audible with no focus trap; FAIL silent loss, duplicate/overwhelming speech or unreachable Exit.
- **Owner:** Accessibility tester.

## J17

- **Device/OS:** Physical iPhone AX5 + Android200%; narrow supported phones.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Approved Urdu/Roman Urdu reviewer; English comparison; theme picker.
- **Steps:** Search, preview, step Next/Previous, Live candidate, lost banner, arrival/modal/Exit; change language/theme/font mid-route.
- **Expected safe behavior:** Readable full critical copy; physical map not mirrored; same journey/step; Android documented recreation policy honored.
- **Evidence:** Screenshots for each state/scale/theme; reviewer signoff, CPU responsiveness.
- **PASS/FAIL:** No clipping/hang/misleading fallback; FAIL unusable control or mistranslation.
- **Owner:** Translator + accessibility/mobile QA.

## J18

- **Device/OS:** Actual Gates18/19; qualified survey device/OS recorded.
- **Status:** MANUAL TEST — PHYSICAL DEVICE / FIELD REQUIRED.
- **Setup:** Venue owner grants safe survey access; current pack/gate metadata read-only.
- **Steps:** Measure actual official gate location and continuous permitted pedestrian connectors; document closures/barriers; review before any graph change.
- **Expected safe behavior:** No invented connectivity; unsupported stays disabled until authoritative data accepted.
- **Evidence:** Survey coordinates/accuracy/time/photos/track, owner approval and data rights.
- **PASS/FAIL:** Only accepted survey permits connectivity; FAIL any inferred or unsurveyed edge.
- **Owner:** Surveyor + venue owner.
