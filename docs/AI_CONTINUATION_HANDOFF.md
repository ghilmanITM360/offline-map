# AI Continuation Handoff

For the next Claude or Codex session, on any machine. **Dated snapshot, 2026-09-29** (verified against GitHub that day). Anything below marked with a commit was measured on that commit; re-verify before relying on it. Live status belongs in `docs/PROJECT_STATUS.md`; the rules are `AGENTS.md` (shared) and `CLAUDE.md` (Claude layer). Machine setup is `docs/NEW_PC_SETUP_AND_RECOVERY.md`.

## 1. Project

Offline-first pedestrian navigation for attendees walking to and inside the Karachi Ijtema venue (React Native 0.81 / Expo 54, MVVM). Internal routing works with no network; outside-venue routing goes Google proxy, then bundled OSM, then a labelled direct-guide. Architecture and ownership: `AGENTS.md`.

Current milestone: **Android APK Acceptance** (#135). Play Store, production signing and legal are out of scope.

## 2. Repository state (verified 2026-09-29)

- Canonical: `integration/ijtema-clean-baseline`, remote `4b17fcb32f1e758a6a19a5561e5b0ff01261f774`. Last source-changing commit `28e98dc1c99be0e75b8396b736085cf7a7669fef`. `main` is the older line (#115: retire-or-keep is the owner's call).
- Merged so far (owner-authorized, merge commits, each guarded by the PR head SHA): #165, #162, #164, #152, #121, #138, #166 (#143), #168 (#147), #171 (refs #161), #170 (#149, refs #169), #167 (docs).
- No independent human review exists on any PR; no GitHub approvals; no branch protection. Reviews were owner-led with AI-assisted technical review.

## 3. Open PRs (all OPEN, none merged, base `integration/ijtema-clean-baseline`)

| PR | Branch | Head when verified | CI | What |
|---|---|---|---|---|
| #172 | `fix/nav-004-v1-resume-freshness` | `815f87d` | SUCCESS | NAV-004: V1 forces a fresh fix on foreground, ignores pre-resume cached fixes, shows "Waiting for a fresh GPS position…" |
| #173 | `fix/android12-splash-pin` | `46b44b4` | SUCCESS | Android 12+ splash: `values-v31` + Expo splash sync |
| #174 | `test/139-process-death-characterization` | `4d5d09f` | SUCCESS | #139 characterization tests + `docs/audit/ISSUE_139_PROCESS_DEATH_DESIGN.md`; **no recovery policy implemented** |
| #175 | `docs/115-evidence-ledger-reconciliation` | `80012ca` | SUCCESS | Evidence ledger EV-028..030, matrix, status (Refs #115) |
| #176 | `docs/device-acceptance-checklist` | `b0ebae0` | SUCCESS | `docs/DEVICE_ACCEPTANCE_CHECKLIST.md`, every row NOT RUN |
| #178 | `wip/download-map-preserved-for-pc-migration` | `d559326` | see PR | **Draft, do not merge.** Byte-exact backup of three uncommitted Download Map files; superseded by canonical |
| #179 | `docs/new-pc-migration-handoff` | n/a | see PR | **Draft.** This file and the setup guide |

Check current heads with `gh pr list --state open`; treat the table as a starting point.

## 4. Unfinished work and preserved WIP

- **#178 Download Map snapshot.** Dialog and status copy that stops promising a Settings download when offline tile download is unavailable. Its test file lacks `Alert`/`fireEvent` imports (4 of 12 tests fail: `Alert is not defined`). Canonical already has the completed version (`DownloadMapViewModel.ts` byte-identical; the screen and test files add the header copy and the imports). Nothing to port.
- **#139:** blocked on the owner choosing option A (validated restore) or B (notify and rebuild). The design recommends B with a marker shaped so A can be layered on. Write **no** recovery code until chosen.
- **#177:** ticket only; nothing implemented (see section 9).
- All other local branches and detached worktrees on the old machine were merged, superseded rehearsals, or already on GitHub.

## 5. Critical decisions and facts (do not re-derive)

- Navigation state is deliberately not persisted (`partialize` allowlist: 19 keys, store version 2). After a process kill the user lands on the Directory with no notice. Current code cannot silently resume stale state. `lastKnownLocationUpdatedAt` is overwritten by the first live fix, so it cannot serve as journey age.
- V1 registers its GPS listener in default `follow` mode; V2 uses `navigation` mode. Left as is (out of scope for #172).
- V1 and V2 are isolated by `test:v1-v2-isolation` (V1 may not import V2). `scripts/test-arrival-threshold-constant.ts` pins the exact V1 import line for `ARRIVAL_THRESHOLD_METERS`.
- The default build very likely cannot reach V1 destinations, so V1 device rows may be N/A.
- `evaluateNavigationLocationCapability` accepts future-dated `observedAtMs` (known gap, documented by a test in #174, no ticket yet).
- Android 12+ ignores `windowBackground`; the splash fix therefore lives in `values-v31`. A brief off-white frame after the system splash remains (`AppTheme` has no `windowBackground`); the JS `SplashScreen` still uses the lucide Map icon. Neither is in #173.
- The Google Routes proxy is not deployed (#123). #161 stays open until it is testable. Do not fabricate provider-runtime evidence.
- **Ownership boundary:** routing and GPS are Codex-owned per `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md` (NAV-004 entry). PR #172 changes GPS-handling code (V1 resume) and is a Claude-authored change in that area; it needs the owner's explicit acceptance of that.
- Never close partially verified issues (#161, #169, #124, #139, #115 …). Never claim device or field evidence from emulator or Jest.

## 6. Test results and their commits

| Commit | Command | Result |
|---|---|---|
| `28e98dc` | `npm run test:components -- --runInBand` | 83 suites / 712 tests passing (canonical baseline; typecheck, lint, `npm test`, `git diff --check` clean) |
| `815f87d` (#172) | full validation | 84 suites / 716 tests; typecheck, lint, `npm test`, four routing scripts exit 0; 3 of the 4 new tests fail without the fix |
| `4d5d09f` (#174) | full validation | 85 suites / 719 tests; typecheck, lint, `npm test` exit 0 |
| `d559326` (#178) | `jest DownloadMapScreen.test.tsx` (local) | 4 failed / 8 passed (missing imports) |
| canonical-based tree | `jest DownloadMapScreen.test.tsx` | 13 passed |

CI on every PR head above was green when checked; CI is JS-only and proves nothing about the Android build. #173 had no local test run (resource-only change; CI green).

## 7. Latest APK

- File `karachi-ijtema-4b17fcb-debugsigned.apk`, SHA-256 `b99cbe34af376938d0bdcc83a3d829dc3088843a6837fd3daec6b5309137d98e`, 87,939,256 bytes.
- Built from canonical `4b17fcb` with `./gradlew assembleRelease -PallowInsecureReleaseSigning=true`. Signed with the public Android debug key (cert SHA-256 `fac61745…33b9c`, matches `android/app/debug.keystore`); not Play-signable. Release bundle, so Metro is not required. No Maps key embedded.
- Stored in private GitHub pre-release `testing-apk-4b17fcb` (`gh release download testing-apk-4b17fcb`).
- **Contains only canonical.** It lacks #172 (NAV-004), #173 (splash), #174–#176. Do not build another APK unless a change justifies it; if #172/#173 merge, a new build is needed to test them.
- Evidence: EMULATOR (API 36) to Route Ready plus offline relaunch. Active navigation, reroute and arrival were not exercised. Splash captures for #173 are in pre-release `evidence-splash-emulator-2026-09-29` (emulator only, throwaway build).

## 8. Acceptance status

- **Source/runtime:** everything merged plus the PRs above, at the levels in section 6.
- **Emulator:** onboarding to Route Ready, offline relaunch, Android 12+ splash. Nothing else.
- **Physical device (none attached so far):** real GPS, V2 and V1 navigation, #124 with mock location (mock is not field evidence), NAV-004, #139 observations (`am kill` and `am force-stop` reported separately), #169, TalkBack. Procedure: `docs/DEVICE_ACCEPTANCE_CHECKLIST.md` (PR #176).
- **Field:** #46, the venue walk. Source-level #124 run (origin `24.964727, 66.999026` to Block 27) resolves to an offline-OSM road route for automatic gate (Gate 08), manual Gate 21 and manual Gate 01; still open pending a device.

## 9. Issue #177 — Get Directions / Starting Location bottom-sheet redesign (P2, not started)

Parent epic #126; related #128, #156, #155. Redesign the two visual states of `LocationSheet` in `routePreview` mode (State B route configuration primary, State A start selection secondary) to match five reference images attached in the issue, **without changing routing, GPS, navigation, offline or manual-gate behavior**.

Verified problems: weak hierarchy with blue links against a green target look; the primary CTA and route summary sit below the fold at the default 50% snap and the CTA is not sticky; the raw `SpecialRoute` enum leaks into the UI; `Change destination`/`Change Start` targets are about 39–40 dp with no `hitSlop`; the start chooser is visually flat. The issue holds measured colour tokens and geometry, a component plan, accessibility and offline-truthfulness requirements (do not repeat the mockups' inaccurate offline claim), a screenshot-comparison procedure and a Definition of Done. **Twelve open owner questions (Q1–Q12) each have a proposed default**; the main ones are keeping the truthful `Start Navigation` label instead of a literal "Show Route", sheet-scoped green tokens, the "Ijtema" spelling, and keeping snap points `['15%','50%','92%']`. Do not commit screenshots unless the owner asks. Read the issue in full before starting; it is the source of truth, not this summary.

## 10. Owner decisions outstanding

1. #139: option A or B.
2. Review and merge #172–#176 (only #172 changes navigation behavior; #173 changes Android resources).
3. Accept or reject the GPS-area change in #172 given the Codex-ownership note.
4. `main`: retire or keep (#115).
5. Splash follow-ups: off-white gap after the system splash; JS splash icon.
6. V1 `follow` vs `navigation` GPS mode.
7. #177 questions Q1–Q12.
8. `AGENTS.md` says "`main` trails it"; confirm whether that stays accurate.
9. Owner-only items #47, #48, #49, #133, #136, #137; independent human review.

## 11. Recommended next sequence

1. Get the #139 decision; meanwhile nothing else blocks on it.
2. Owner reviews and merges #172–#176; then refresh `docs/PROJECT_STATUS.md` (its NAV-004 and "next" lines go stale) and re-measure the baseline on the new head.
3. One physical-device session using the checklist; file an issue for any FAIL after searching for an existing one.
4. Implement #139 per the chosen option on a new branch (tests T4–T9 in the design doc).
5. Small tickets not yet created (search first): hydration-hardening `merge` for the persisted store (design test T4); future-dated fix acceptance; CI whitespace-step race on back-to-back merges.
6. #177 after navigation-failure work, on its own branch, after the owner answers the design questions.
7. #161 only after the proxy (#123) is testable.

## 12. Rules that keep biting

Isolated worktree per task; stage explicit paths; no force-push, no merges without owner approval, no production credentials, never touch a dirty worktree you did not create; keep unrelated issues in separate commits and PRs; avoid self-referential HEAD claims in docs; do not reuse a test total you did not measure on that commit.
