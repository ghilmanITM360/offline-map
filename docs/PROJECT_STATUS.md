# Project Status

Current snapshot only. This file is replaced on each update, not appended to — history lives in git and the issue tracker, not here.

**Last updated:** 2026-09-29
**Canonical branch:** `integration/ijtema-clean-baseline`
**Verified code baseline:** `28e98dc1c99be0e75b8396b736085cf7a7669fef` (merge of PR #170), the last commit that changed source. This documentation update is applied on top of it by PR #167; the final merged canonical HEAD is reported in that PR, not here, because a document cannot name its own commit. Commits that only change documentation are not re-measured; anything that changes source or `android/` requires re-running the baseline below.
**Current milestone:** **Android APK Acceptance** — a fully tested, stable Android APK. Store/Play publishing, production signing, and legal/store submission are explicitly out of this milestone (tracked separately, see "Future Deployment" below).

Full ticket-by-requirement coverage: [`docs/audit/MASTER_TICKET_MATRIX.md`](audit/MASTER_TICKET_MATRIX.md).

## Integration record (2026-09-29)

Ten PRs were merged with merge commits, in two batches. Batch 1: #165 (`b7473b0`), #162 (`f02d56a`), #164 (`27eb527`), #152 (`8e4fef6`), #121 (`5473399`), #138 (`f360d83`). Batch 2 (code fixes): #166 (`aa2811f`, #143), #168 (`756fb4a`, #147), #171 (`1111914`, refs #161), #170 (`28e98dc`, #149 and refs #169). Each merge was guarded by the expected PR head SHA and green CI. The review was **owner-led with AI-assisted technical review — it was not an independent human review**, and no GitHub approvals exist on these PRs. The repository has no branch protection or CODEOWNERS, so nothing enforced a reviewer.

## Readiness

| | Status |
|---|---|
| Current-milestone (APK) readiness | Not yet — see #135 (Final Android APK Acceptance) checklist; blocked on #46, #93, #95, #139, #126 (UI/UX audit), #129 (performance profiling); #124 needs a physical-device confirmation |
| Future-deployment readiness | Not started, correctly out of scope — owner actions #47/#48/#49, plus #137 (iOS key) |

## Test baseline (SOURCE/RUNTIME VERIFIED on `28e98dc`, 2026-09-29)

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run test:components` (Jest, `--runInBand`) — **83 suites / 712 tests, all passing**
- `npm test` (110-step script chain, includes the v2 structural-validation step) — passes
- `test:all-gates-v2`, `test:outside-street-gate-selection-cost-v2`, `test:core-provider-routing-contract-v2`, `test:reroute-v2` — pass
- `git diff --check` — clean

## Testing APK (build evidence, not a release)

**This table describes the earlier APK built from `f360d83`; it predates the batch-2 code fixes (#166/#168/#170/#171) and is superseded.** Evidence for a fresh APK built from the integrated head is recorded on #135 (an APK's checksum cannot be committed into the commit it is built from). The emulator results below were observed on the `f360d83` build and are not re-claimed for later builds.

| | |
|---|---|
| Source commit | `f360d83e0dcdfc90faf39a664c2033771d431b76`, clean worktree, fresh `npm ci` |
| Command | `ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleRelease -PallowInsecureReleaseSigning=true` (from `android/`) |
| Result | BUILD SUCCESSFUL in 7m 16s, 849 of 849 tasks executed (no cache) |
| Built | 2026-09-29 11:07 UTC |
| File | `app-release.apk`, 87,938,344 bytes |
| SHA-256 | `62304e22d61272de09d23d1a3cd3eedb18112333e7efa6c4eb99b17aa4a4f23a` |
| Signing | **Public Android debug key** (`CN=Android Debug`) — testing only, not distributable. Production signing is untouched (#48). |
| Contents | Embedded `assets/index.android.bundle`; `libworklets.so` for arm64-v8a, armeabi-v7a, x86, x86_64 |

The APK file lives outside git (local build output). Rebuild it from the commit above if you need the binary; the checksum will only match a build from the same environment.

**EMULATOR VERIFIED** (API 36 Pixel-class emulator, fresh install after `adb uninstall`, no Metro listening on 8081): cold launch → Welcome → Permission (system dialog granted) → Download Map (honest "background-map download isn't available yet" notice; "Use Venue Map Only" flow) → Home map with gate markers → Directory (42 blocks) → Block 27 → Get Directions → Route Ready (18 min / 1.4 km from the nearest venue path, and 16 min / 1.3 km from a manually chosen Gate 12). Relaunch with airplane mode on opens the Directory with Recent destinations and all data present.

**Not verified (outstanding):**
- Starting active navigation: the app correctly keeps *Start Navigation* disabled until it has a current precise location, and the emulator's location mock was stale and ignored `adb emu geo fix`. Active turn-by-turn, reroute and arrival are therefore **not exercised on the emulator**. PHYSICAL DEVICE REQUIRED.
- Splash on Android 12+: the system splash shows the launcher icon, not the `splashscreen_logo.png` pin changed by #164 (that drawable only applies below API 31). Cosmetic; tracked with the splash follow-up (Expo `app.json` splash sync + a `values-v31` splash icon), needs owner go-ahead.
- Real TalkBack, large-font layouts, touch-target feel, real GPS, battery/thermal, and any venue walking — PHYSICAL DEVICE REQUIRED / FIELD REQUIRED.

## Open issues by priority (P1)

- #46 — Physical Ijtima walking acceptance test (FIELD REQUIRED)
- #139 — Active journey lost after Android process death (product decision + physical device)
- #48 — Production signing / Play App Signing (owner action, Future Deployment)
- #49 — historical exposed Google Maps key (the app no longer uses any Maps key; owner may delete the old key in Google Cloud Console)
- #93 — Nearest-node snapping continuity/hysteresis (root cause confirmed, fix deferred pending #46 field data)
- #115 — NEW-02/03/06 audit: all three resolved (NEW-06 fixed in source by #171, NEW-03 by #162, NEW-02 superseded; EV-028–030 updated). Remaining acceptance is the owner's retire-vs-keep decision on `main`
- #124 — "Direct guide" despite a valid OSM route: not reproduced on the baseline (fixed by #107/#108); needs a physical-device re-run before closing
- #135 — Final Android APK Acceptance (current-milestone gate)
- #150, #151, #153 — a11y/UX findings **fixed in source by #164**; they stay open until the owner confirms on a device
- #160 — closed by #162 (manual gate retained across reroutes); #118 — closed by #121 (v2 structural validation)
- #161 (P2) — provider endpoint joins now count toward gate choice, distance, cost and ETA for Google routes (#171). **Stays open**: acceptance needs a deployed Google proxy (#123); only source/contract-test evidence exists.
- #169 (P2) — V1 reroute-never-completes fixed in source and unit-tested (#170). **Stays open**: device verification outstanding (PHYSICAL DEVICE REQUIRED).

**P2/P3 and full breakdown:** see `docs/audit/MASTER_TICKET_MATRIX.md`.

**Tracker:** #63 — Production Readiness audit tracker, with native GitHub sub-issue structure (#122 Offline-First, #126 UI/UX, #129 Performance, #133 Admin Data Workflow, #134 Future SDK, #135 Final APK Acceptance).

## Recently closed

- #143 — stuck V2 "Rerouting…" state cleared when the reroute path throws (PR #166); #147 — malformed GPS fixes rejected in the store and at the `GPSManagerService` publishing boundary (PR #168); #149 — V1 lifecycle resets (PR #170). Source/unit evidence only; no device verification.
- #160 — manual gate retained across automatic reroutes (PR #162); #118 — v2 dataset structural validation (PR #121)
- #96 — Non-routable destinations show a muted, distinguishable tap affordance (PR #98)
- #103, #105, #107, #109, #111, #113 — routing/navigation correctness fixes (all merged, see git log)
- #45 — LOC-01..12 runtime verification: 7/12 emulator-tier PASS, remainder (weak fix, GPS loss/recovery, background/resume) deferred to #46's physical-device tier — not a regression
- #58, #81, #80, #62, #56, #53, #52, #51, #54, #50, #25 — prior-cycle cleanup/security/docs work

## Owner blockers (cannot be closed by an agent)

#47, #48, #49 (Future Deployment), #133 (Admin Data Workflow questionnaire), #136 (crowd-flow/walkability — not currently planned).

## Field blockers (need the physical venue)

#43, #44 (gate survey), #46 (walking acceptance test), #116 (Mimbar survey — zero prior data, do not fabricate).

## Physical-device blockers (need real hardware, not emulator)

#46 (remainder of LOC-01..12: weak fix, GPS loss/recovery, background/resume), #124 (live confirmation), #128 (TalkBack screen-reader flow), #131 (battery/thermal specifically), #139 (`am kill` vs `am force-stop`), active-navigation start/turn-by-turn.

## In progress / next

- PR #172 merged the NAV-004 background-resume GPS freshness fix; physical-device verification under #46 remains pending. Next priorities include #139 (needs the owner's product decision: restore the journey vs notify and rebuild the route), #124 physical-device re-run, then #115 (owner decision on `main`).
- PR #173 merged the splash config sync; physical-device and OEM visual verification remain pending. Owner decisions pending: #139 restore-or-notify, V1 extend/no-extend wording, `AGENTS.md` "main trails" wording, independent human review of the merged PRs (still recommended).
