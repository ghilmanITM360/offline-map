# Project Status

Current snapshot only. This file is replaced on each update, not appended to; history lives in git and the issue tracker. Behavior is described in the topic docs (see the map in `README.md`), not here.

**Canonical branch:** `integration/ijtema-clean-baseline` (`main` trails it; never start from `main`).
**Documentation baseline:** written against canonical `a5463fa` (merge of PR #354). Commits that only change documentation are not re-measured; anything that changes source or `android/` requires re-running the baseline below.
**Current milestone:** **Android APK Acceptance**, a fully tested, stable Android APK. Store/Play publishing, production signing and legal/store submission are out of this milestone (`KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`).

## Where the product is

- Fully offline map: bundled, hash-verified PMTiles basemap rendered by MapLibre; no Google SDK or key (ADR 0001, `OFFLINE_MAP_AND_DATA.md`).
- Launch is Splash -> Welcome (first time only) -> Directory; location is never a launch gate. The Directory is the one place chooser (a tap means "take me here"). Route Guide (manual FROM + TO) and Live Navigation (fresh, precise fix) are separate modes; the app never fakes a position. The Directions sheet never swipes away and is removed when live navigation starts (`PRODUCT_AND_USER_FLOWS.md`).
- Outside routing: bundled OSM then direct guide; the Google proxy leg is not deployed (#123) (`NAVIGATION_AND_ROUTING.md`).
- Language layer for English, Roman Urdu and Urdu (RTL) is in place; screen-by-screen localization is in progress (remaining hard-coded strings are tracked by `scripts/hardcoded-strings.ts`).
- Share sends a place name and an OpenStreetMap link; no App Link exists.

## Test baseline

<!-- final numbers filled by lead -->

SOURCE/RUNTIME level, to be filled with the exact commands and totals for the final HEAD: `npm run typecheck`, `npm run lint`, `npm run test:components -- --runInBand`, `npm test`, `git diff --check`. Not measured by the documentation change that wrote this file.

## Evidence summary

- **EMULATOR VERIFIED** (API 36, release-like arm64 APK, test-signed; see #135 for the build record): fresh install -> Welcome -> Directory; no-location Directory -> Block 2 -> start Block 9 -> Route Guide opens at the top detent with step, Previous/Next and the live-guidance link above the navigation bar; live auto-start with an injected fix; arrival -> Done -> Directory; process death -> recovery card; airplane-mode launch with 0 remote sockets; MapLibre stability matrix and the width/font/RTL/navigation pairwise matrix. Detail: `TESTING.md`.
- **Not verified on any device:** real TalkBack speech (only the accessibility tree was inspected), real GPS, battery/thermal, jank, gesture-vs-three-button matrix beyond spot checks, corrupt-basemap recovery on a device (unit-tested only), the Share sheet, the sheet contract and language switching on a phone. PHYSICAL DEVICE REQUIRED / FIELD REQUIRED.

## Open work (field, device, external; read `gh issue list --state open` for live state)

| # | What | Needs |
|---|---|---|
| #135 | Final Android APK acceptance (epic) | PHYSICAL DEVICE REQUIRED |
| #46 | Physical Ijtema walking acceptance test (and LOC-06/08/09/10/11) | FIELD REQUIRED |
| #43, #44 | Gate 18 / Gate 19 connector survey | FIELD REQUIRED |
| #116 | Mimbar survey, zero prior data, do not fabricate | FIELD REQUIRED |
| #123 | Google walking-routes proxy not deployed | owner (billing, IAM, ingress, disclosure) |
| #161 | Provider endpoint joins in complete-journey cost | source/contract evidence only until #123 |
| #117 | Retire or reconcile the legacy v1 dataset | owner decision |
| #134 | Future SDK / library architecture | do not implement |
| #136 | Walkability / crowd-flow modeling | not planned |
| #307 | Journey-flow finalization tracker | closes after the owner reviews the final APK |
| #63, #122 | Trackers: Production Readiness, Offline-First | |

Draft PR #178 preserves old "Download Map" work-in-progress and must not be merged; the product has no tile-download feature.

## Owner blockers (cannot be closed by an agent)

Production signing / Play App Signing (#48), store submission and legal copy (#47), proxy deployment (#123), crowd-flow (#136), the #133 admin-data questionnaire, the #117 decision.

## Testing APK

Build evidence for the current test APK (commit, command, size, SHA-256, signing) is recorded on #135: an APK's checksum cannot be committed into the commit it is built from. The APK is signed with the public Android debug key (`-PallowInsecureReleaseSigning=true`): testing only, never distributable.
