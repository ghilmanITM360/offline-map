# Permission Screen — Deep Forensic UI/UX, Functional-Interaction & Accessibility Audit

Audit-only. No production code modified. No fixes implemented.

## 0. Prior owner decision — confirmed app naming

Owner-confirmed official app name (given at the start of this audit, before any Permission-specific investigation):

- English: **Ijtema Map**
- Urdu: **اجتماع میپ**

Cross-referenced against Welcome issue [#159](https://github.com/ghilmanITM360/offline-map/issues/159) (WEL-001: naming inconsistency across Splash/Welcome/AppGuide) and Splash issue [#158](https://github.com/ghilmanITM360/offline-map/issues/158) (no naming content in that ticket's body). Neither ticket lists "Ijtema Map" as a settled decision — this session is the first record of it. It is recorded here as the canonical target string and applied below when evaluating every app-name occurrence this audit touches, including one the Welcome/Splash audits did not examine: the OS-level app label (§11, PERM-001).

## 1. Repository baseline

- Repository: https://github.com/ghilmanITM360/offline-map
- Canonical branch: `integration/ijtema-clean-baseline` @ `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`
- Audit branch: `docs/ui-ux-audit-reconciliation` @ `66bb2d81dc51003f4a0972eb3ab4c617fa21b63a` (this doc committed on top)
- Working tree: clean except this branch's own audit-doc changes; no application source touched (confirmed via `git status --short` throughout)
- Related issues: #126 (parent), #128 (comprehensive checklist — NAV-UX-003 concerns this screen, see §12), #153 (first-launch flow — Findings 1, 2, 5 concern this screen directly, see §12), #158 (Splash, no Permission content), #159 (Welcome, WEL-006 concerns this screen directly, see §12)
- Prior audit PR: #152
- No existing `PERMISSION_SCREEN_DEEP_AUDIT.md` or dedicated Permission GitHub issue found prior to this session — confirmed via `ls` and `gh issue list --search permission`/`--search location`
- Codex coordination: verified `emulator-5554`'s foreground app was `com.aicrafted.karachiijtema` (our own package) before any interaction (`dumpsys window`/`dumpsys activity` — `mCurrentFocus`/`topResumedActivity` both confirmed); no Codex branch, worktree, or uncommitted change touched

## 2. Skills loaded and applied

- `accessibility` (`~/.claude/skills/accessibility/SKILL.md`)
- `ux-heuristics-review` (`~/.claude/skills/ux-heuristics-review/SKILL.md`)
- `general-design-review` (`~/.claude/skills/general-design-review/SKILL.md`)
- `design-analysis` (`~/.claude/skills/design-analysis/SKILL.md`)
- `ui-ux-pro-max` (`~/.claude/skills/ui-ux-pro-max/SKILL.md`)
- `mobile-design-review` — applied in **report-only mode** (no redesign generated)
- `systematic-debugging` — applied to the permission/GPS-fix/service-status distinction (§3) and to reproducing #153's Finding 2 live (§8.7)
- `verification-before-completion` — applied throughout: every PASS below is tied to either a live screenshot or explicit source citation, never inferred

## 3. Understanding the permission flow — execution trace

Files read in full this session: `PermissionScreen.tsx`, `PermissionViewModel.ts`, `StartupManager.ts`, `OnboardingStatusService.ts`, `RootNavigator.tsx`. Read via research pass: `GPSManagerService.ts`, `AndroidManifest.xml`, `app.json`, `src/__tests__/PermissionViewModel.test.ts`.

**What is requested:** `Location.requestForegroundPermissionsAsync()` (`PermissionViewModel.ts:62`) — foreground-only. Manifest declares `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (`android/app/src/main/AndroidManifest.xml`), no `ACCESS_BACKGROUND_LOCATION`. Confirmed live: the native Android 16 (API 36) dialog offers "Precise" / "Approximate" location scope, "While using the app" / "Only this time" / "Don't allow" (§8, screenshot 18) — matches Android's modern foreground-permission model exactly.

**When:** Immediately on this screen, which is reached unconditionally on first install (`StartupManager.ts:44-46`: `!permissionGranted && !skippedLocationPermission` → route `Permission`) right after Welcome, before any map/destination content is shown. Not contextual/deferred.

**Why:** Screen states it plainly — "so we can show where you are and guide you to your destination" (`PermissionScreen.tsx:26`).

**Precise vs approximate:** the app requests generic foreground permission and does not itself distinguish precise-vs-approximate after the grant — both `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` are requested together, and `PermissionViewModel.ts:63` branches only on `status === 'granted'`, not on which scope was chosen. `GPSManagerService.ts` consumes whatever accuracy the OS delivers; there is no in-app messaging if the user picks "Approximate" (walking navigation's turn-by-turn premise implicitly needs precise fixes, but approximate is not blocked or flagged). Recorded as PERM-002 below.

**After grant:** `navigateNext()` (`PermissionViewModel.ts:40-57`) checks map-download status, connectivity, and validation in parallel, then routes to `Main` (map already downloaded, or corrupt/needs-update short-circuits differently) or `DownloadMap` (not yet downloaded). Confirmed live: routes to `DownloadMap` (§8.5).

**After denial:** `getForegroundPermissionsAsync().canAskAgain` is checked (`PermissionViewModel.ts:70-71`). If `false` (permanently denied), an Alert offers "Open Settings" wired to `Linking.openSettings()` (`PermissionViewModel.ts:72-75`) — **this already resolves #128's NAV-UX-003** ("action isn't actually wired"), see §12. If `canAskAgain` is still `true` (soft denial), a plain "Location isn't on yet" Alert with only "OK" is shown (`PermissionViewModel.ts:76-82`) — user stays on this screen, can retry.

**After skip:** `skipPermission()` → confirmation Alert → `confirmSkipPermission()` persists `OnboardingStatusService.setSkippedLocationPermission(true)`, then routes via the same `navigateNext()`.

**Previously stored decisions:** `OnboardingStatusService` persists exactly one bit relevant here — `skippedLocationPermission` (AsyncStorage key `ijtema.onboarding.location_permission_skipped.v1`). A real OS grant clears a stale skip (`clearSkippedLocationPermissionOnGrant`), so a later revocation is NOT distinguished from a fresh ask — confirmed live, this is #153's Finding 2, reproduced in §8.7.

**Can the user change their decision later?** Yes, via Android Settings (Settings app, or the in-app "Open Settings" link once permanently denied) — but nothing on this screen or elsewhere in the app tells the user that changing it later routes them back through this exact same screen with no differentiating copy (§8.7, §12).

**Permission status vs. actual fix vs. GPS accuracy/freshness — kept distinct per the brief's explicit requirement:** `PermissionViewModel.ts` only ever checks permission *status*, never a live fix. `GPSManagerService.ts` (`start()`) separately checks `Location.hasServicesEnabledAsync()` (device Location Services toggle, distinct from app permission) before subscribing, and publishes whatever `accuracy` the OS reports per update (no in-file staleness/weak-fix threshold — that logic is documented elsewhere per the existing audit tracker, out of this screen's scope). **This screen never claims a live fix is available merely because permission was granted** — its copy is scoped to "show where you are... guide you" as a capability being unlocked, not a live-data promise. No misrepresentation found (Phase 9 requirement).

## 4. Complete element inventory

| ID | Element | Source | Text | Visibility condition |
|----|---------|--------|------|----------------------|
| P-01 | Icon circle (decorative) | `PermissionScreen.tsx:21-23` | — (`MapPin`, 72px, `#2E7D32`, in `#E8F5E9` circle) | Always |
| P-02 | Title | `PermissionScreen.tsx:24` | "Find your location" | Always |
| P-03 | Description | `PermissionScreen.tsx:25-27` | "Allow location access so we can show where you are and guide you to your destination." | Always |
| P-04a–c | Feature list (3 rows, icon+text) | `PermissionScreen.tsx:29-42` | "Current location on map" / "Walking navigation" / "Turn-by-turn guidance" | Always, static |
| P-05 | Primary button (Allow Location) | `PermissionScreen.tsx:44-54` | "Allow Location" (text) / `ActivityIndicator` (while `loading`) | Always; disabled + spinner while `loading` |
| P-06 | Secondary link (Continue Without Location) | `PermissionScreen.tsx:56-62` | "Continue Without Location" | Always; disabled while `loading` |
| P-07 | Confirmation dialog (native `Alert`) | `PermissionViewModel.ts:126-144` | "Continue without location?" / body / Cancel / "Continue Without Location" | Only after tapping P-06 |
| P-08 | Native OS permission dialog | OS-owned, not app-rendered | "Allow **Karachi Ijtema Offline Nav** to access this device's location?" + Precise/Approximate + While-using/Only-this-time/Don't-allow | Only after tapping P-05, OS-timed |
| P-09 | Soft-denial `Alert` | `PermissionViewModel.ts:77-81` | "Location isn't on yet" / body / OK | Only if denied and `canAskAgain=true` |
| P-10 | Permanent-denial `Alert` | `PermissionViewModel.ts:72-75` | "Location permission required" / body / Cancel / "Open Settings" | Only if denied and `canAskAgain=false` |
| P-11 | Skip-persistence-failure `Alert` | `PermissionViewModel.ts:113-117` | "Couldn't save your choice" / body / OK | Only if `setSkippedLocationPermission` rejects |
| P-12 | `ScrollView` wrapper | `PermissionScreen.tsx:19` | — | Structural; engages on overflow (large font / small screen) |

Per Phase 4's explicit instruction, P-08 (native Android dialog) is inventoried separately and **not** counted as an app-owned screen element for scoring purposes, though its content (the app-name string) is squarely in scope for the naming-consistency question set by §0.

## 5. First-time attendee trunk test (expert-prediction, not live-participant)

1. **Why is location being requested?** Stated directly: "so we can show where you are and guide you to your destination." Understandable without GPS knowledge.
2. **Is the reason immediately understandable?** Yes — plain language, no "GPS"/"coordinates"/technical terms anywhere in the visible copy.
3. **Does the user know what happens after pressing the button?** Partially. They know a location prompt will follow (native dialog is standard OS UI most attendees have seen before in other apps), but nothing previews that the *next app screen* will be a map-download step — reasonable, most onboarding flows don't preview N+1.
4. **Is permission vs. actual-availability clear?** Not explicitly — the screen doesn't say "granting this doesn't guarantee an instant fix," but it also doesn't promise an instant fix; the ambiguity is one of omission, not misstatement. Low risk for a first-time reading.
5. **Does declining feel unnecessarily frightening?** No harsh language. The permanent-denial Alert title "Location permission required" ("required") reads slightly stronger than the actual behavior (the app does NOT require it — skip remains fully available) — a real, evidenced minor mismatch. See PERM-003.
6. **Does the user understand the app still works without granting?** Yes — "Continue Without Location" is visually present at all times as an equal-weight escape hatch, and its own confirmation dialog explicitly says "You can still explore the map."
7. **Does the user know how to change their decision later?** No — neither the screen nor the skip-confirmation dialog mentions Settings as a path to grant later (only the *permanent-denial* Alert mentions Settings, and only in that one branch). A user who taps "Continue Without Location" is told nothing about how to turn it on later, despite the app internally supporting exactly that. See PERM-004 (overlaps #153's existing Finding 5, not duplicated as a new root cause — see §12).
8. **Unnecessary jargon?** None found.
9. **Is the primary action obvious?** Yes, single large green button, clear label.
10. **Are secondary actions confusing?** No — one secondary link, clearly subordinate in weight (gray text vs. green filled button).
11. **Are confirmation dialogs necessary?** The skip-confirmation dialog is evaluated in full in §7 (Phase 8) — conclusion: KEEP, evidence-based.
12. **Unnecessary friction before destination discovery?** One screen, one tap (or two taps if skipping, due to confirmation) — not excessive for a permission ask with real behavioral consequences.
13. **Respects user's choice?** Yes — skip is always available, never gated behind a forced grant, confirmed live (§8).
14. **Understandable without explanation?** Yes.

Explicitly expert-prediction only — no live first-time participant tested this session.

## 6. Deep usability audit (Screen → Section → Component → Text → Action → State → Edge case)

| Element | Purpose | Language | Visual | Interaction | Accessibility | Simplicity | Verdict |
|---|---|---|---|---|---|---|---|
| P-01 Icon | Orientation | N/A (decorative) | Clear, centered, consistent with Welcome's icon-circle pattern | N/A | No explicit `accessibilityElementsHidden`/`importantForAccessibility="no"` — REQUIRES VERIFICATION (same pattern as WEL-004) | Reasonable | PARTIAL (a11y) |
| P-02 Title | State the ask | Clear, simple | Bold 28px, `#333` on white | N/A | Plain `<Text>`, TalkBack reads natively | **Duplicates Welcome's own benefit-list text verbatim** (`WelcomeScreen.tsx:14` "Find your location") — already tracked as WEL-006 in #159, cited not duplicated | PARTIAL (content, already tracked) |
| P-03 Description | Explain why | Plain, no jargon | `#666` on white, good contrast (§9) | N/A | Plain Text | Good, not redundant with title | PASS |
| P-04 Feature list | Preview capability | Plain | Consistent spacing/alignment with Welcome's own benefit-list pattern | N/A | Icon+text pairs, not color-dependent | 3 items, reasonable | PASS |
| P-05 Primary button | Core action | Accurate label | High-contrast green button (§9); **`loading` state background `#A5D6A7` fails contrast for its white spinner** (§9, PERM-005) | Confirmed live: tap → `loading=true` (button disabled, spinner shown) → native dialog → grant → transition (§8.4–8.5). `disabled={loading}` (`PermissionScreen.tsx:47`) correctly guards against rapid-tap duplicate requests — stronger guard than Welcome's Continue button had | No explicit `accessibilityRole="button"` on the `Pressable` — REQUIRES VERIFICATION (source-level, same pattern as WEL-003) | Single action, correctly weighted | PARTIAL (contrast confirmed defect + a11y unverified) |
| P-06 Skip link | Escape hatch | Accurate, calm tone | `#666` text, no visual button chrome — intentionally lower-weight than P-05 | Confirmed live: tap → confirmation dialog (§8.2); Cancel → state unchanged, verified via re-screenshot + AsyncStorage-file check (§8.3); also `disabled={loading}` guarded | Underlying `Pressable` wraps only `marginTop:20` + a 16px `<Text>` — **no explicit padding, so the touchable region is source-estimated at roughly the text's own ~20dp line height**, below the 48dp minimum touch target (WCAG 2.5.8 / Android accessibility guidance). Source-level finding, not device-measured (dialog covered the underlying tree when this session's `uiautomator` dump was taken) | Single link, appropriately de-emphasized vs. primary | PARTIAL (touch target, source-level) |
| P-07 Skip-confirmation dialog | Prevent accidental loss of live-nav capability | Clear: names the actual consequence ("live navigation will not work") and the recovery path ("turn it on anytime from Settings") | Native Android `AlertDialog` styling, high contrast by OS default | Confirmed live: Cancel leaves state fully unchanged (§8.3); Confirm persists + navigates (source + 18 unit tests, not independently re-run live this session since the grant path was tested live instead — see §14) | Native dialog, OS-level accessibility handling applies | See full Phase-8 evaluation in §7 | KEEP (evidenced) |
| P-08 Native OS dialog | OS-owned permission UX | OS-standard copy | OS-standard | Confirmed live: Precise/Approximate + three-way choice, all OS-native (§8.4) | OS-owned, not in-app scope | N/A | **App-name string shown here is a confirmed content defect** — see PERM-001 |
| Hardware Back | Recovery | N/A | N/A | Not independently re-tested this session (Welcome's identical stack-shape/`replace` pattern was already confirmed in the Welcome audit; Permission sits at the same stack depth via the same `replace` mechanism — `WelcomeViewModel.ts` → `navigation.replace('Permission')` — so the same exit-app behavior is expected by direct architectural parity, not re-verified independently here) | N/A | N/A | NOT INDEPENDENTLY VERIFIED (source-parity inference only) |

## 7. Double-confirmation flow review (Phase 8)

**Why does it exist?** It is the only confirmation dialog anywhere in the onboarding chain (Splash has none, Welcome has none, Permission's own "Allow" path has none — only "skip" does). It exists because skipping is the one action with a real, ongoing behavioral consequence: live navigation stops working until permission is later granted. Confirmed proportionate — the other two onboarding actions (Welcome's Continue, Permission's own Allow) have no comparable downside to guard against.

**What mistake does it prevent?** An accidental tap on "Continue Without Location" (positioned directly below the primary button, same general tap zone a fast/elderly user might mis-tap) silently degrading the app's core navigation feature with no chance to reconsider.

**Does it contain genuinely new information?** Yes, evidenced: the dialog body states the specific consequence ("live navigation will not work") and the recovery path ("You can turn it on anytime from Settings") — neither of which appears in the screen's own persistent copy (`PermissionScreen.tsx:25-27` only explains why to grant, not what skipping costs). This exact gap — consequence-copy trapped in a transient Alert instead of persistent screen text — is **already tracked as #153's Finding 5**, with an acceptance criterion matching this exact recommendation. Not duplicated here.

**Is the wording understandable?** Yes, confirmed live (§8.2 screenshot) — plain English, specific, no jargon.

**Can the user easily cancel?** Yes, confirmed live — Cancel is the leftmost, default-weight button; tested and state was verified unchanged afterward (§8.3).

**Does cancellation leave permission state unchanged?** Yes, confirmed live: re-screenshot after Cancel is pixel-identical to the pre-dialog screen, and the AsyncStorage-backed skip key showed no write (checked via `run-as`, §8.3).

**Does it create unnecessary friction?** Minimal — one extra tap, only on the path that has a real consequence to flag. Not excessive.

**Consistent with other onboarding decisions?** It's the only such dialog, but that's because it's the only decision with an ongoing consequence — Welcome's Continue and Permission's own Allow don't reduce future capability, so their absence of a confirmation step is itself consistent, not an inconsistency.

**Recommendation: KEEP.** Evidence does not support SIMPLIFY/MERGE/RENAME/REMOVE — the dialog earns its place. The one improvement opportunity (mirroring its consequence-copy into the screen's persistent text) is already owned by #153's Finding 5; this audit corroborates rather than re-opens it.

## 8. Runtime evidence (this session, shared emulator `emulator-5554`)

**Environment:** `emulator-5554`, package `com.aicrafted.karachiijtema`, `versionName=1.0.0` `versionCode=1`, `minSdk=24` `targetSdk=36`, installed Android **16 (API 36)**, `firstInstallTime=2026-09-23 18:16:35`, `lastUpdateTime=2026-09-26 17:13:46`. Display: physical 1080×2400 @ 420dpi, override 540×1200 @ 210dpi. `font_scale=1.0` (system default, not forced large this session). Locale: system default (`persist.sys.locale` unset → en-US). This binary was **not built by this session** — no local APK artifact was found to independently hash; build provenance is source-content-matched only (every string/color/layout element visually matches current `PermissionScreen.tsx`/`PermissionViewModel.ts`), same evidentiary tier as the Splash and Welcome audits' own APK-SHA caveat.

Codex-safety check before any interaction: `mCurrentFocus`/`topResumedActivity` both confirmed `com.aicrafted.karachiijtema/.MainActivity` — our own app was already foregrounded, not a Codex tool. No `pm clear`, no uninstall/reinstall performed. One reversible `pm revoke` was used (§8.7) — explicitly not a data reset, and directly exercises a real user-reachable scenario (Settings-level revocation), not an artificial test-only state.

Session opened with the app already parked mid-onboarding on a **pristine, never-yet-interacted Permission screen** (`hasSeenWelcome=true` from the prior Welcome-audit session, permission not yet requested) — screenshotted immediately, before any interaction, confirming this was a genuine P02 state and not one manufactured by this session.

1. **Fresh render (P02)** — screenshot 14. Matches source exactly: icon, title, description, 3-row feature list, green "Allow Location" button, gray "Continue Without Location" link. `dumpsys package` confirmed both location permissions `granted=false` at this point.
2. **Tap "Continue Without Location"** — confirmation dialog appears (screenshot 15), title/body/buttons exactly as coded, native `AlertDialog` chrome. (First screenshot attempt raced the dialog's render and missed it — re-captured a moment later via `uiautomator dump` + re-screenshot; the miss itself has no bearing on app behavior, just capture timing.)
3. **Tap "Cancel"** — screenshot 16, pixel-identical to screenshot 14. `run-as ... cat RKStorage | grep location_permission_skipped` returned no write — confirms the skip key was never touched, matching source (`skipPermission` only calls `confirmSkipPermission` from the *other* button, `PermissionViewModel.ts:126-139`).
4. **Tap "Allow Location"** — button enters `loading` state, spinner replaces text, background dims to `#A5D6A7` (screenshot 17 — this is also the evidence for PERM-005's contrast finding). ~1.5s later, native OS permission dialog appears (screenshot 18) offering Precise/Approximate + While-using/Only-this-time/Don't-allow, titled **"Allow Karachi Ijtema Offline Nav to access this device's location?"**.
5. **Tap "While using the app"** (Precise pre-selected by OS default) — `dumpsys package` confirmed `ACCESS_FINE_LOCATION: granted=true` and `ACCESS_COARSE_LOCATION: granted=true` immediately after. App transitioned to the **DownloadMap** screen (screenshot 19, "Offline Maps" / "آف لائن نقشہ") — confirms `navigateNext()`'s "not downloaded → DownloadMap" branch, correct per source. Per the brief, DownloadMap itself was not further inspected beyond confirming this transition.
6. **Force-stop + relaunch (`am start`)** — Splash replayed (correctly showing "Ijtema Map" / اجتماع میپ, the owner-confirmed name, in passing corroboration of the Splash audit's own findings, not re-opened here), then landed directly on **DownloadMap** again (screenshot 20) — confirms both Welcome *and* Permission are correctly skipped on a relaunch once permission is genuinely granted, matching `StartupManager.ts:40-46`.
7. **`pm revoke` both location permissions (reversible — not a data clear) + force-stop + relaunch** — this simulates a real, user-reachable scenario (the user opens Android Settings and turns location off for the app) rather than an artificial test-only state. Result: app routed straight back to the **Permission screen**, and the resulting screenshot (21) is **pixel-identical to the original fresh-install render (screenshot 14)** — same title, same description, same "Find your location" heading, zero differentiating copy indicating this is a re-ask after an external revocation rather than a first-time ask. **This is a live, direct reproduction of #153's Finding 2**, cited in §12, not filed as a new finding.

Screenshots saved to `docs/audit/ui-ux/screenshots/14-…` through `21-…`. Per repo policy (`.gitignore` "Local QA evidence" block), **not committed** — same handling as the Splash and Welcome audits' evidence.

**Not tested live this session** (see §14 for full breakdown and honest REQUIRES VERIFICATION labeling): native "Don't allow" denial path, soft-denial retry Alert, "Only this time" scope, Location Services device-toggle disabled, offline/no-connectivity at request time, forced large font scale, TalkBack, physical device, Android Back specifically on this screen (inferred by stack-shape parity with Welcome, not independently re-tested), background/resume mid-request.

## 9. Visual design — measured contrast (WCAG 2.2, computed from actual hex values)

| Element | Color | Background | Ratio | Threshold | Result |
|---|---|---|---|---|---|
| Title | `#333333` | `#FFFFFF` | 12.64:1 | 4.5:1 | PASS |
| Description | `#666666` | `#FFFFFF` | 5.75:1 | 4.5:1 | PASS |
| Feature text | `#444444` | `#FFFFFF` | 9.74:1 | 4.5:1 | PASS |
| Skip link text | `#666666` | `#FFFFFF` | 5.75:1 | 4.5:1 | PASS |
| Primary button label | `#FFFFFF` | `#2E7D32` | 5.13:1 | 3:1 (18px bold, qualifying large) | PASS |
| **Loading-state spinner** | `#FFFFFF` (`ActivityIndicator color="#FFF"`) | `#A5D6A7` (`buttonDisabled`) | **1.64:1** | 3:1 (WCAG 1.4.11, non-text UI component) | **FAIL — new confirmed defect (PERM-005)** |

The loading-state pairing is new — Welcome has no loading/disabled button state to compare against (WEL-005 found the *absence* of such a guard; Permission has the guard, but its visual state fails contrast). Directly evidenced by screenshot 17, not eyeballed — the spinner is genuinely difficult to see against the dimmed-green background in the actual capture.

Icon-circle decorative colors (`#E8F5E9`/`#2E7D32`) not text-contrast-scored, consistent with the Welcome audit's own treatment of the same non-informational pattern.

## 10. Complete permission state matrix

| ID | State | Applicable? | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|
| P01 | First installation | Yes | Permission screen shown | Confirmed (screenshot 14) | Live | PASS |
| P02 | Permission not yet requested | Yes | Both buttons enabled, no loading | Confirmed | Live | PASS |
| P03 | Precise location granted | Yes | `navigateNext()` routes correctly | Confirmed → DownloadMap | Live (screenshot 19) | PASS |
| P04 | Approximate location granted | Yes | Same routing; app does not distinguish scope post-grant | Not independently live-tested (OS defaulted to Precise; app logic only branches on `status==='granted'`, not scope — same code path applies) | Source (`PermissionViewModel.ts:63`) | PASS (source-level; scope-blind by design, see PERM-002) |
| P05 | Permission denied (soft, `canAskAgain=true`) | Yes | "Location isn't on yet" Alert, stays on screen | Not live-tested this session (would have consumed the single fresh-install cycle already used for the grant path) | Source + `PermissionViewModel.test.ts` LOC-02 (automated) | REQUIRES LIVE VERIFICATION (automated-test-covered) |
| P06 | Permission denied repeatedly | Yes | Same soft-denial Alert each time until `canAskAgain` flips | Not live-tested | Source only | REQUIRES LIVE VERIFICATION |
| P07 | Permission request unavailable (e.g. OS-level restriction) | Rare/edge | Would surface via the same denial branch or a rejected promise | Not live-tested; no dedicated handling beyond the try/catch's `console.error` (`PermissionViewModel.ts:84-85`) — a rejected `requestForegroundPermissionsAsync()` silently logs and leaves the user on-screen with no Alert | Source (`PermissionViewModel.ts:84-85`) | PARTIAL — silent failure path exists, no user-facing message (PERM-006) |
| P08 | User skips location permission | Yes | Confirmation dialog | Confirmed (screenshot 15) | Live | PASS |
| P09 | User cancels the skip confirmation | Yes | State unchanged | Confirmed (screenshot 16 + storage check) | Live | PASS |
| P10 | User confirms the skip | Yes | Persist + navigate | Not live-tested this session (grant path tested instead); fully covered by `PermissionViewModel.test.ts`'s "Continue Without Location" describe block (dialog-open/Cancel/Confirm/error-recovery/rapid-repeat cases) | Source + automated tests | REQUIRES LIVE VERIFICATION (automated-test-covered) |
| P11 | Permission previously granted | Yes | Skip Permission on relaunch | Confirmed (screenshot 20) | Live | PASS |
| P12 | Permission previously denied | Yes | Re-show Permission | Implied by P13's result (revocation is a denial-equivalent state) | Live (§8.7) | PASS (routing correct) but see P13 |
| P13 | Permission changed in Android Settings | Yes | *Should* differentiate a re-ask from a first ask | Re-shows the exact same, non-differentiated screen — **live-confirmed reproduction of #153 Finding 2** | Live (screenshot 21, pixel-identical to screenshot 14) | **CONFIRMED USABILITY PROBLEM — already tracked (#153 F2), not duplicated** |
| P14 | Location Services (device toggle) disabled | Yes | Some distinct signal vs. permission-denied | Not live-tested; `GPSManagerService.ts` checks `hasServicesEnabledAsync()` separately, but that check lives in the GPS manager, not on this screen — this screen has no awareness of the device-level toggle at all | Source only | REQUIRES LIVE VERIFICATION |
| P15–17 | GPS fix availability / accuracy / staleness after grant | Out of this screen's scope per brief (permission ≠ fix) | N/A to this screen's UI | Confirmed: screen makes no live-fix claims (§3) | Source | NOT APPLICABLE (correctly out of scope, not conflated) |
| P18 | No internet connection at permission-request time | Yes | Permission request itself is offline-capable (OS-local); post-grant routing depends on `ConnectivityService.isConnected()` | Not live-tested (would require toggling emulator network, deferred as out of this pass's minimum-necessary-interaction scope) | Source (`PermissionViewModel.ts:41-44`) | REQUIRES VERIFICATION |
| P19 | App background and resume | Yes | No lifecycle-sensitive state on this screen beyond `mountedRef` | Not independently live-tested | Source (no `AppState` listener in `PermissionScreen.tsx`/`PermissionViewModel.ts`) | REQUIRES VERIFICATION (low risk, source-assessed) |
| P20 | Process termination and relaunch | Yes | Persisted state correctly resumes onboarding | Confirmed twice (screenshots 20, 21) | Live | PASS |
| P21 | Repeated rapid permission-button taps | Yes | No duplicate requests | `disabled={loading}` on both buttons (`PermissionScreen.tsx:47,59`) — stronger source-level guard than Welcome's Continue button had; not independently re-tested via rapid-tap this session (Welcome audit already validated this general pattern on a sibling screen) | Source + architectural parity | PASS (source-level; guard present, not independently re-hammered live) |
| P22 | Android Back during permission request | Yes | Some defined behavior mid-request | Not live-tested | Source only | REQUIRES VERIFICATION |
| P23 | Native permission dialog dismissed (tap outside / Back) | Yes | Treated as a denial by the OS/Expo contract | Not live-tested | Source (standard Expo Location behavior, not app-custom) | REQUIRES VERIFICATION |
| P24 | Large system font | Yes | `ScrollView` present, should degrade to scroll | Not forced this session | Source (`PermissionScreen.tsx:19`, same structural pattern as Welcome) | REQUIRES VERIFICATION |
| P25 | TalkBack enabled | Yes | Logical focus order, meaningful names | Not enabled this session | None | REQUIRES VERIFICATION |
| P26 | Relevant rejected promise | Yes | Graceful handling | `catch` block exists but only logs, no user Alert (see P07/PERM-006) | Source | PARTIAL |

## 11. Native-dialog evaluation

The native Android permission dialog (P-08) is OS-owned chrome, correctly excluded from the app's own screen-scoring per Phase 4 — but its **content is app-supplied** (the app label string) and is squarely in scope for the naming-consistency question the owner set at the start of this audit (§0).

Confirmed live (screenshot 18): the dialog reads **"Allow Karachi Ijtema Offline Nav to access this device's location?"** — traced to `app.json:3`'s `"name": "Karachi Ijtema Offline Nav"`, which Expo's prebuild writes into `android/app/src/main/res/values/strings.xml:2` (`app_name`) and from there into the manifest's `android:label`, which Android uses verbatim for this dialog, the home-screen launcher icon caption, and the recents/app-switcher label. This is the most OS-prominent naming surface in the entire app — seen before the app is even opened (launcher) and again at the single highest-friction moment of onboarding (this permission ask) — and it does not match the owner-confirmed "Ijtema Map," nor either of the two names WEL-001 already catalogued ("Ijtema Map" / "Karachi Ijtema Navigation"). `app.json:39-40`'s own permission-rationale strings add a fifth and sixth variant ("Karachi Ijtema Nav" appears twice, each time slightly different from the launcher name). See PERM-001.

## 12. Accessibility findings

- Neither `Pressable` (P-05, P-06) has an explicit `accessibilityRole="button"` — same source-level pattern as WEL-003, not independently TalkBack-verified this session.
- P-01's decorative icon has no explicit `accessibilityElementsHidden`/`importantForAccessibility="no"` — same source-level pattern as WEL-004.
- P-06's touch target is source-estimated below the 48dp minimum (§6) — a Permission-specific finding not present on Welcome (whose Continue button is full-width/full-padding).
- Loading-state contrast failure (PERM-005, §9) is itself an accessibility-relevant finding (WCAG 1.4.11).
- No TalkBack live pass performed — all accessibility findings here are source-level, explicitly labeled as such, consistent with the Splash/Welcome audits' own evidentiary discipline.

## 13. Localization findings

No app-wide i18n/RTL infrastructure exists (architecture fact re-confirmed, not re-litigated — established in the Splash/Welcome audits). Permission screen itself has **no Urdu text at all** — unlike Splash and Welcome, which both render a bilingual title. This is worth noting as an inconsistency in bilingual coverage across the onboarding sequence (Splash: bilingual, Welcome: bilingual, Permission: English-only, DownloadMap: bilingual per screenshot 19/20's "آف لائن نقشہ") — Permission is the one gap in an otherwise-consistent bilingual pattern. Recorded as PERM-007, improvement candidate, not a defect (no localization infrastructure exists to "break").

## 14. Simplification register

| Element | Classification | Rationale |
|---|---|---|
| P-01 Icon | KEEP | Legitimate visual anchor, no evidence of harm; unlike Welcome's icon, this one is not a near-immediate repeat of Splash's icon (Welcome sits between them) |
| P-02 Title | RENAME candidate, OWNER DECISION REQUIRED | Verbatim duplicate of Welcome's own benefit-list text — already tracked as WEL-006 in #159, not re-opened as a new item here |
| P-03 Description | KEEP | Clear, accurate, appropriately scoped |
| P-04 Feature list | KEEP | Reasonable density (3 items), no duplication with Welcome's own 4-item list beyond the title overlap already noted |
| P-05 Primary button | KEEP structurally; CORRECT the loading-state contrast (PERM-005) | Core action, correctly weighted; only the disabled-state color needs adjustment |
| P-06 Skip link | KEEP; consider enlarging touch target | Escape hatch is correctly always-available and correctly de-emphasized visually; the touch-target concern is additive, not a reason to reposition or remove |
| P-07 Skip-confirmation dialog | KEEP | Full Phase-8 evaluation in §7 — earns its place |
| P-08 Native OS dialog copy | OWNER DECISION REQUIRED (app.json naming) | Not an in-app element to "simplify," but its content is squarely an owner naming decision per §0/§11 |

No element is a REMOVE CANDIDATE. Every element maps to a legitimate purpose confirmed either live or by direct source citation.

## 15. Findings register

| ID | Title | Category | Severity | Evidence |
|---|---|---|---|---|
| PERM-001 | Native OS permission dialog (and app launcher/recents label) shows "Karachi Ijtema Offline Nav" — a fifth/sixth app-name variant, not matching the owner-confirmed "Ijtema Map" nor either name WEL-001 catalogued | Confirmed content defect (naming) | Medium (OS-level surface, seen before app open) | `app.json:3,39-40`, `android/app/src/main/res/values/strings.xml:2`, screenshot 18 |
| PERM-002 | App does not distinguish "Precise" vs "Approximate" grant after the OS dialog resolves — no in-app messaging if a user picks Approximate despite walking-navigation's precision needs | Improvement candidate | Low-Medium | `PermissionViewModel.ts:62-68` |
| PERM-003 | Permanent-denial Alert titled "Location permission required" overstates the actual requirement — the app does not require location (skip is always available) | Improvement candidate (content) | Low | `PermissionViewModel.ts:72-75` vs. `PermissionScreen.tsx:56-62`'s always-present skip link |
| PERM-004 | Skip-confirmation dialog and the persistent screen copy never tell the user *how* to grant permission later (only the permanent-denial branch mentions Settings) | Already tracked | — | Overlaps #153 Finding 5's own acceptance criteria; not filed as new |
| PERM-005 | Loading-state button background `#A5D6A7` gives its white `ActivityIndicator` a 1.64:1 contrast ratio, failing WCAG 1.4.11's 3:1 non-text-UI-component threshold | **Confirmed defect (contrast)** | Medium | Computed from `PermissionScreen.tsx:128-130`'s `buttonDisabled` style; live screenshot 17 shows the spinner is genuinely hard to see |
| PERM-006 | A rejected `requestForegroundPermissionsAsync()` promise (P07/P26) is caught and only `console.error`-logged — no user-facing Alert, user is left on a screen with a stuck non-loading button and no explanation | Improvement candidate | Low-Medium | `PermissionViewModel.ts:84-85` |
| PERM-007 | Permission screen has no Urdu text, unlike Splash/Welcome/DownloadMap, which are all bilingual | Improvement candidate (consistency) | Low | `PermissionScreen.tsx` (no Urdu string anywhere), contrasted with screenshots 19/20 |
| PERM-008 | Skip link's touchable region is source-estimated below the 48dp minimum touch target (no padding beyond `marginTop:20`, hit area ≈ text's own line height) | Requires verification (source-level) | Low-Medium (accessibility) | `PermissionScreen.tsx:136-142`; not device-measured this session |
| PERM-009 | Neither `Pressable` has explicit `accessibilityRole="button"`; decorative icon has no explicit accessibility-hiding | Requires verification (source-level) | Low (accessibility) | `PermissionScreen.tsx:21-23,44-54,56-62`; same pattern as WEL-003/WEL-004 |

**Already-tracked, corroborated (not duplicated):**
- #153 Finding 1 (post-Permission first-time routing to `Main` instead of `LocationsDirectory`) — confirmed still true by direct source read of `navigateNext()`, not independently re-litigated.
- #153 Finding 2 (revoked-permission re-prompt indistinguishable from first ask) — **live-reproduced this session** (§8.7, screenshot 21), strengthening its evidence base from source-only to source+runtime.
- #153 Finding 5 (skip consequence only in a transient Alert) — corroborated by this audit's own Phase-8 review (§7), not re-opened.
- #128 NAV-UX-003 (Settings action not wired) — **appears already fixed**: `Linking.openSettings()` is correctly wired (`PermissionViewModel.ts:74`). Flagged for owner reconciliation against #128, same pattern as prior audits catching already-resolved checklist rows.
- WEL-006 (title text duplicated between Welcome and Permission) — corroborated from the Permission side, not duplicated.

No confirmed *functional breakage* was found — every tested interaction (skip, cancel, grant, relaunch, external revocation) behaved per source and completed its transition correctly. Findings are content/naming/contrast/accessibility/consistency items, plus one already-tracked usability problem now live-corroborated.

## 16. Tests performed vs unavailable

**Performed (live, this session):** fresh-render, skip-tap → confirmation dialog, cancel → unchanged state (+ storage check), grant-tap → loading state → native OS dialog → grant → transition to DownloadMap, relaunch after grant → correctly skips to DownloadMap, `pm revoke` (reversible) + relaunch → reproduces #153 F2 live. All captured as screenshots 14–21.

**Source + automated-test verified only (not live this session):** soft/permanent denial Alert branches (covered by `PermissionViewModel.test.ts` LOC-02/LOC-03), skip-confirm persistence + navigation itself (covered by the same test file's "Continue Without Location" describe block — the grant path was exercised live instead, to cover the untested-by-unit-tests native-dialog surface), rapid-repeat-tap guard (covered by both the test file and the `disabled={loading}` source pattern), unmount-guard behavior (covered by 7 dedicated test cases).

**Not available/not attempted this session:** TalkBack live announcement/focus order, forced large system font scale, "Don't allow"/"Only this time" native-dialog branches, Location-Services-disabled device toggle, no-internet-at-request-time, Android Back specifically on this screen (inferred by architectural parity with Welcome, not independently re-tested), background/resume mid-request, physical device, small-screen device profile, exact installed-APK SHA-256/commit attribution (pre-existing install, not built this session). None of these are claimed as PASS.

## 17. Owner decisions needed

1. Canonical app-name string for `app.json`'s `"name"` field (PERM-001) — this drives the launcher label, recents label, and every native permission dialog going forward, not just this one. Same underlying decision as WEL-001, now shown to have a wider blast radius than previously documented.
2. Whether to surface an in-app distinction when a user grants only "Approximate" location (PERM-002), given walking-navigation's precision needs — product-behavior call, not a pure copy fix.
3. Whether "Location permission required" (PERM-003) should be softened given the skip path always remains available.
4. Whether to add `accessibilityRole="button"` now on source-level RN guidance, or wait for a live TalkBack pass (PERM-009) — same open question as WEL-003/WEL-004.
5. Whether `.gitignore`'s screenshot-exclusion policy should get an audit-evidence exception — same open question already flagged in both prior audits, not re-decided here.

## Completeness verdict

- **SOURCE AUDIT: COMPLETE.** Full element inventory, full usability/content/visual/accessibility-source review, full double-confirmation-flow review, full state-matrix pass, full existing-issue cross-reference performed.
- **AVAILABLE RUNTIME AUDIT: COMPLETE** for the states reachable without a destructive app-data reset on a shared emulator (fresh render, skip+cancel, grant+transition, relaunch-after-grant, reversible-revocation+relaunch) — all captured with screenshots. States requiring either a second fresh install or destructive `pm clear` (soft/permanent denial, "Don't allow", "Only this time") were **not** exercised live in favor of the single available fresh-install cycle being spent on the native-dialog/grant path, which no automated test covers; the denial paths remain covered by 18 existing unit tests instead.
- **ACCESSIBILITY: SOURCE-LEVEL REVIEWED, NOT TALKBACK-VERIFIED.** PERM-008/PERM-009 remain open pending a live TalkBack pass.
- **PHYSICAL DEVICE: PENDING.** All testing this session was on the shared emulator.
- **REAL-USER VALIDATION: PENDING.** §5's trunk test is expert-prediction only.
- No application source code was modified at any point this session (confirmed via `git status --short` throughout — only this doc and the tracker will change).
