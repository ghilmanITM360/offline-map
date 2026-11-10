# Project Status

Current snapshot only. This file is replaced on each update, not appended to — history lives in git and the issue tracker, not here.

**Last updated:** 2026-10-06
**Canonical branch:** `integration/ijtema-clean-baseline`
**Verified code baseline:** `6494092` (merge of PR #324), the last commit that changed source. Commits that only change documentation are not re-measured; anything that changes source or `android/` requires re-running the baseline below.
**Current milestone:** **Android APK Acceptance** — a fully tested, stable Android APK. Store/Play publishing, production signing and legal/store submission are out of this milestone (see `KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`).

## Where the product is

- The map is fully offline (bundled, hash-verified PMTiles basemap; ADR 0001). Core navigation needs no network and no Google key.
- Launch is Splash -> Welcome (first time only) -> Directory. Location is never a launch gate. The Directory is the one place chooser; a tap means "take me here" (live navigation, Route Guide, or a contextual "Where are you starting from?").
- Route Guide (manual FROM + TO, no location needed) and Live Navigation (fresh, precise fix) are separate modes; the app never fakes a position. Behaviour: [`PRODUCT_AND_USER_FLOWS.md`](../PRODUCT_AND_USER_FLOWS.md). Data kept across launches: [`DATA_RETENTION.md`](../DATA_RETENTION.md). Basemap: [`OFFLINE_BASEMAP.md`](../OFFLINE_BASEMAP.md).
- Journey-flow finalization (#307) merged as PRs #308–#324.

## Test baseline (SOURCE/RUNTIME VERIFIED on `6494092` plus the cleanup PR that carries this file, 2026-10-06)

- `npm run typecheck` — clean
- `npm run lint` — 0 errors, 1 warning (unused `eslint-disable` in the generated `markerImages.generated.ts`)
- `npm run test:components` (Jest, `--runInBand`) — **130 suites / 1216 tests, all passing**
- `npm test` — passes (106 script steps)
- `git diff --check` — clean

## Evidence levels

- **EMULATOR VERIFIED** (API 36, release-like arm64 APK, test-signed, see #135): fresh install -> Welcome -> Directory; no-location Directory -> Block 2 -> start Block 9 -> Route Guide opens at the top detent with step, Previous/Next and the live-guidance link above the navigation bar; live auto-start with an injected fix; arrival -> Done -> Directory; process death -> recovery card; airplane-mode launch.
- **Not verified on any device:** real TalkBack speech (only the accessibility tree was inspected), RTL, reduced motion, gesture-vs-three-button matrix beyond spot checks, corrupt-basemap recovery on a device (unit-tested only), real GPS, battery/thermal. PHYSICAL DEVICE REQUIRED / FIELD REQUIRED.

## Open issues

- **#135** — Final Android APK Acceptance (physical-device gate)
- **#46** — Physical Ijtima walking acceptance test (FIELD REQUIRED); **#43**, **#44** (gate survey), **#116** (Mimbar survey, zero prior data, do not fabricate) — FIELD REQUIRED
- **#307** — journey-flow finalization tracker; closes after the owner reviews the final APK
- **#123** — Google walking-routes proxy not deployed (owner); **#161** — provider endpoint joins in journey cost, source/contract evidence only until #123
- **#117** — retire or reconcile legacy v1 dataset (P2, data)
- **#134** (future SDK, do not implement), **#136** (crowd-flow, not planned)
- Trackers: **#63** (Production Readiness), **#122** (Offline-First)

## Owner blockers (cannot be closed by an agent)

Production signing / Play App Signing, store submission and legal copy (Future Deployment); #123 proxy deployment; #136; #133 admin-data questionnaire.

## Testing APK

Build evidence for the current test APK (commit, command, size, SHA-256, signing) is recorded on #135 — an APK's checksum cannot be committed into the commit it is built from. The APK is signed with the public Android debug key (`-PallowInsecureReleaseSigning=true`): testing only, never distributable.
