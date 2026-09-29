# Splash Screen — Deep Forensic UI/UX, Startup & Accessibility Audit

Screen 01 of the Karachi Ijtema Navigation app. Audit-only — no application code changed.

## 1. Repository baseline

| Field | Value |
|---|---|
| Branch | `docs/ui-ux-audit-reconciliation` |
| HEAD | `f6a1eb11b684e3fbf507f47071a0eb23a9003fda` |
| Canonical branch (`integration/ijtema-clean-baseline`) | not diffed line-by-line against HEAD this pass — this branch is docs-only relative to its fork point, no app-source divergence introduced by any commit on it |
| Working tree | clean except pre-existing untracked `.superpowers/` (unrelated) |
| Worktrees found | `offline-map-final` (`final/karachi-ijtema`), `offline-map-harness` (`test/runtime-location-injection`), a codex worktree (`audit/codex-runtime-evidence`) — none touched |
| Emulator | `emulator-5554`, already running, exclusive use not contended during this session |
| APK tested | `android/app/build/outputs/apk/release/app-release.apk`, built this session (`BUILD SUCCESSFUL in 3m 58s`) |
| APK SHA-256 | `0fffa523955a4213b797a4f124211a0b1be9eb77020839708be3457d4a356b1e` |
| Signing | **debug-signed, release-shaped** — `hasReleaseSigningConfig` is false in this checkout (no `android/keystore.properties`), so `release` build type falls back to the `debug` signingConfig per `android/app/build.gradle`. Labelled accurately, not a production-signed build. |
| Application ID | `com.aicrafted.karachiijtema` |
| Device | Android 16 (`ro.build.version.release=16`) emulator, 1080×2400 physical / 540×1200dp override, density 420 (210dp override), font scale 1.0 |

## 2. Skills loaded and applied

| Skill | Available | Loaded | Applied as |
|---|---|---|---|
| accessibility | YES (`~/.claude/skills/accessibility/SKILL.md`) | YES | WCAG contrast math, screenshot-review-limits discipline, severity scale for §10 |
| ux-heuristics-review | YES (`~/.claude/skills/ux-heuristics-review/SKILL.md`) | YES | Nielsen H1/H2/H4/H6/H8/H9 checks in §6 |
| general-design-review | YES (`~/.claude/skills/general-design-review/SKILL.md`) | YES | Visual-craft 12-rule check (motion physics, contrast, no gradients/glow) |
| mobile-design-review (mobile-taste-skill) | YES (`~/.claude/plugins/marketplaces/mobile-taste-skill/skills/mobile-design-review/SKILL.md`) | YES | Report-only mode, Trunk Test, `FINDING-NNN` format, category scoring math |
| ui-ux-pro-max | YES (`~/.claude/skills/ui-ux-pro-max/SKILL.md`) | YES | `progressive-loading`, `loading-states`, `color-accessible-pairs` quick-reference checks |
| design-analysis | YES (`~/.claude/skills/design-analysis/SKILL.md`) | YES (methodology only) | Its Playwright capture pipeline is web-only and not applicable to a native Android app — used only its "measured, not eyeballed" evidence discipline; actual capture done via `adb screencap`/`screenrecord` instead |
| systematic-debugging | YES (superpowers plugin, `.../6.3.0/skills/systematic-debugging/SKILL.md`) | YES | Root-cause trace of Finding 001 (traced every `Promise.all` member to its actual rejection surface, not just the symptom) |
| verification-before-completion | YES (superpowers, `.../6.3.0/skills/verification-before-completion/SKILL.md`) | YES | Governs every classification below — nothing marked CONFIRMED/PASS without fresh evidence this session |

**Unavailable / not applicable**: Superdesign (generative-design tool, out of scope for an audit — confirmed, not invoked). No project-level `.claude/skills/` exist (checked, empty).

**Conflicts**: none material. `mobile-design-review`'s full rubric is built for whole-app review; applied here only to categories with actual Splash-Screen surface (see §9) rather than inventing scores for categories with nothing to evaluate (Navigation & IA, Forms & input, Surfaces & grouping — all N/A on a non-interactive single-screen audit).

## 3. Startup architecture — native → RN → destination

Confirmed real (not assumed) sequence, three distinct phases:

1. **Native Android splash** — `MainActivity`'s manifest theme is `Theme.App.SplashScreen` (`AndroidManifest.xml:23`), which sets only `android:windowBackground` to `@drawable/ic_launcher_background` (`styles.xml:9-11`). That drawable is a `layer-list` (`ic_launcher_background.xml`): a flat `#2E7D32` fill (`colors.xml:2`, `splashscreen_background`) with a centered bitmap (`splashscreen_logo.png`) on top. This is the **pre-attach window background**, shown by the OS before any Activity content is drawn — no `expo-splash-screen` package is installed (confirmed via `grep` on `package.json` — zero matches), so this is the *only* native splash mechanism; there is no separate JS-driven `SplashScreen.hide()` call anywhere in the app.
2. **Theme downgrade** — `MainActivity.onCreate()` calls `setTheme(R.style.AppTheme)` **before** `super.onCreate(null)` (`MainActivity.kt:18-19`), with the comment "Set the theme to AppTheme BEFORE onCreate to support coloring the background... This is required for expo-splash-screen" (a leftover comment — this project doesn't use `expo-splash-screen`, see above). `AppTheme` (`styles.xml:2-8`) declares no `android:windowBackground` of its own, so it inherits from its parent, `Theme.AppCompat.DayNight.NoActionBar` — a light/white background in day mode on this device.
3. **RN JS mount** — `App.tsx` renders `RootNavigator`, whose first stack screen is `SplashScreen` (`RootNavigator.tsx:82`). `SplashScreen.tsx` paints its own `View` with `backgroundColor: SPLASH_BACKGROUND_COLOR` (= `staticColors.arrivalGreen`, same `#2E7D32` as the native splash) plus the logo/title/subtitle, runs its async startup checks, then calls `navigation.replace(route)` (line 174) to hand off to the resolved destination screen.

**Duplicate-splash check**: no duplicate splash presentation — native splash and the RN `SplashScreen` component use the *same* background color, so as intended, they visually read as one continuous screen — **except** for the theme-downgrade gap in step 2, which briefly exposes a different (light) background between them. See Finding 006.

## 4. Startup dependency table

All 9 members of the `Promise.all` in `SplashScreen.tsx:91-113`:

| Dependency | Blocking | On failure | Can the `Promise.all` slot reject? | Evidence |
|---|---|---|---|---|
| `OfflineMapService.getMapStatus()` | yes | function's **own** internal `try/catch` (`OfflineMapService.ts:170,193`) returns `{isDownloaded:false,...}` | **No** — the function itself swallows every internal failure (DB open, query, filesystem check) and always resolves | `OfflineMapService.ts:169-196` |
| `startupStatusPromise` (`OfflineMapStatusService.validateAtStartup`) | yes | `.catch()` at `SplashScreen.tsx:70-73` → `{status:'not_downloaded',...}` | No | source read + `SplashScreen.test.tsx:533-544` (mocks a real rejection, asserts correct fallback route) |
| `permissionGrantedPromise` (`Location.getForegroundPermissionsAsync`) | yes | `.catch()` at `SplashScreen.tsx:60-63` → `false` | No | `SplashScreen.test.tsx:508-518` |
| `isConnectedPromise` (`ConnectivityService.isConnected`) | yes | `.catch()` at `SplashScreen.tsx:75-78` → `false` | No | `SplashScreen.test.tsx:561-572` |
| `graphOnlyModeEnabledPromise` | yes | `.catch()` at `SplashScreen.tsx:80-83` → `false` | No | source read |
| `skippedOnlineModeEnabledPromise` | yes | `.catch()` at `SplashScreen.tsx:85-88` → `false` | No | source read |
| `hasSeenWelcomePromise` | yes | `.catch()` at `SplashScreen.tsx:53-56` → `false` | No | `SplashScreen.test.tsx:496-506` |
| `skippedLocationPermissionPromise` | yes | `.catch()` at `SplashScreen.tsx:65-68` → `false` | No | `SplashScreen.test.tsx:520-531` |
| `minVisibleMs` (1500ms timer) | yes | n/a — plain `new Promise(resolve => setTimeout(resolve,...))`, never rejects | No | `SplashScreen.tsx:44-46` |
| `waitForStoreHydration(...)` | yes | its executor only ever calls `resolve(...)` (4 possible outcomes: `success`/`failure`/`timeout`/`aborted`), never `reject` | No | `useAppStore.ts:556-599` |

**Conclusion (root-cause traced, not assumed): the `Promise.all` at `SplashScreen.tsx:91` cannot reject through any of its 9 members under any single-dependency failure.** This directly reverses the prior session's Finding 001 (see §10).

Test-coverage gap noted for completeness: no existing unit test forces `OfflineMapService.getMapStatus()`'s *own internal* SQLite/filesystem call to throw and asserts the fallback (existing tests mock dependencies at the `SplashScreen` call-site boundary, e.g. `OfflineMapStatusService.validateAtStartup`, not `OfflineMapService.getMapStatus()` itself). The source-level `try/catch` proof stands independently of this gap.

## 5. Splash element inventory

| ID | Element | Source | Text/value | Typography | Color | Visibility | Accessibility | Animation |
|---|---|---|---|---|---|---|---|---|
| E01 | Container | `SplashScreen.tsx:197,211-216` | — | — | bg `#2E7D32` | always | none set | none |
| E02 | Logo badge | `SplashScreen.tsx:199-201,220-228` | `MapIcon` (lucide) 60px, white | — | icon `#FFFFFF` on `rgba(255,255,255,0.2)` circle | always | none set | fades in with E03 |
| E03 | Animated content wrapper | `SplashScreen.tsx:198,217-219` | — | — | — | always, opacity 0→1 | none set | `Animated.timing`, 1200ms, `useNativeDriver:true` |
| E04 | Title | `SplashScreen.tsx:202,229-234` | "Ijtema Map" | 32px bold | `#FFFFFF` on `#2E7D32` | always | none set | inherits E03 fade |
| E05 | Urdu title | `SplashScreen.tsx:203,235-239` | "اجتماع میپ" | 22px regular | `#E8F5E9` on `#2E7D32` | always | none set | inherits E03 fade |
| E06 | Subtitle | `SplashScreen.tsx:204,241-244` | "Offline Navigation Guide" | 15px regular | `#A5D6A7` on `#2E7D32` | always | none set | inherits E03 fade |
| E07 (native) | Native splash background | `ic_launcher_background.xml` | — | — | `#2E7D32` | pre-attach window only | n/a (native window, not RN) | none |
| E08 (native) | Native splash "logo" | `ic_launcher_background.xml` → `splashscreen_logo.png` | — | — | flat green circle, RGBA, on transparent | pre-attach window only | n/a | none |

No progress indicator, no error UI, no retry action, no illustrations beyond E02/E08 exist in source — not invented, confirmed absent.

## 6. Deep usability audit (Screen → Section → Component → Text → Action → State → Edge case)

Applying accessibility + ux-heuristics-review + general-design-review together. Each item: PASS / ISSUE / PARTIAL / NOT VERIFIED / NOT APPLICABLE.

**Purpose** — Splash's only job is orchestration (run startup checks, route). **PASS**: it does nothing else, does not block on user input, and every route decision is delegated to the single-purpose `StartupManager.resolve()` (source-verified, `StartupManager.ts`).

**User understanding** — branding (E02/E04/E05) makes app identity clear on first paint. **PASS** for identity. Whether the user understands *to wait* during a long cold start: **ISSUE**, see Finding 002 — no signal distinguishes "working" from "stalled" after the fade-in completes, and the runtime cold-start trace in §8 shows this gap is not hypothetical (9.3s to JS-ready alone, measured).

**Content** — English/Urdu copy is accurate, no jargon, no unnecessary text. **PASS** (H2: match between system and real-world language).

**Visual design** — hierarchy (logo → title → Urdu → subtitle) is clear, spacing/alignment correct, centered layout is an appropriate pattern for a non-interactive interstitial (general-design-review's "poster screen" tell explicitly exempts auth/empty/interstitial screens). **PASS** on hierarchy/alignment. Contrast: **ISSUE** for E06 (measured 3.12:1, below the 4.5:1 AA floor — see §10 Finding 003/004). Native/RN visual consistency: **ISSUE**, see Finding 006.

**Loading** — no spinner, no progress text, no timeout/retry UI. A spinner is not automatically required (per brief), but the *complete absence* of any differentiation between "just started" and "taking a while" is a real H1 (visibility of system status) gap given the measured 9.3s+ JS-ready latency. **ISSUE**, see Finding 002. Can the user become permanently stuck? **PASS (verified not possible)** — see §4 conclusion; every dependency is non-rejecting.

**Interaction** — no controls exist on this screen — Android Back during Splash was **NOT VERIFIED** live (not tested this pass; `RootNavigator` mounts Splash as the *first* stack screen with no screen behind it, so Back at this exact point would exit the app via default OS behavior — a very low-risk, standard React Navigation behavior, not evidenced by a live back-press test this session, so left NOT VERIFIED rather than assumed PASS). Rapid relaunch / duplicate navigation: `isMountedRef` guard (`SplashScreen.tsx:116-118`) and the "never navigates more than once" test suite (`SplashScreen.test.tsx:188-215,293-306,628-665`) give test-level evidence this is handled. **PASS (test-verified)**.

**Accessibility** — no `accessibilityLabel`/`accessibilityRole`/live-region on any element. Per the accessibility skill's own "Screenshot Review Limits," absence of an explicit prop does not by itself prove a TalkBack failure — RN's default behavior surfaces plain `Text` content to TalkBack automatically, so E04/E05/E06 are very likely readable as-is without an explicit label. What *is* a real gap: no announcement of the async "in progress" state for a screen with a measured multi-second wait. **PARTIAL** — see Finding 005 (downgraded from the prior session's framing; not a hard accessibility defect, a missed-opportunity finding).

**Product simplicity** — every element present earns its place (brand identity + bilingual copy for the target audience); nothing duplicated; no excess decoration. **PASS**.

## 7. Startup state matrix

Only states with real, distinguishing evidence this session are scored; the rest are honestly marked NOT VERIFIED rather than guessed, per the brief's own instruction.

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| S01 | Fresh install (data cleared) | **PASS** — routed to Welcome | Live device run this session: `pm clear` → launch → landed on Welcome screen (screenshot `splash_current_state.png`), matching `StartupManager`'s `hasSeenWelcome=false` branch |
| S11 | Slow/cold startup on a loaded host | **OBSERVED, high real latency** | Live logcat: `am start` → `ReactNativeJS: Running "main"` = **9.3s** to JS bundle start alone (Hermes/ART GC pauses up to 3.05s visible in logcat), on top of the 1500ms `minVisibleMs` floor and the async checks themselves. This is emulator-on-loaded-host timing, not representative of a physical device, and is explicitly labeled as such |
| S12 | Startup dependency rejection | **NOT REPRODUCED live; CONFIRMED not reachable by source+test** | §4 — every dependency non-rejecting by construction; 8 of 9 have direct test coverage forcing a rejection and asserting the correct fallback route |
| S15 | Android Back during startup | **NOT VERIFIED** | not exercised live this session |
| S16 | TalkBack enabled during startup | **NOT VERIFIED (runtime)** | enabling the TalkBack service live was judged out of the bounded diagnostic budget for this pass; see §6 for the source-level reasoning that stands in its place |
| S17 | Large system font | **NOT VERIFIED** | `font_scale` on the test emulator was `1.0`; not overridden this pass |
| S20 | Native→RN splash transition | **CONFIRMED defect** | §3 step 2 + Finding 006 |
| S02–S10, S13, S14, S18, S19 | — | **NOT VERIFIED** | out of the bounded runtime budget for this pass; no source-level reason to suspect a Splash-specific issue in any of them beyond what's already captured above |

## 8. Runtime evidence (this session, emulator-5554)

- Cleared app data, cold-launched via `am start -n com.aicrafted.karachiijtema/.MainActivity`, captured `logcat` + timed screenshots.
- `logcat` timestamps: intent sent ~19:39:54.9 → `ReactNativeJS: Running "main"` at 19:40:04.275 (**9.3s** native-to-JS-ready).
- Screenshot sequence (`splash_a/b/c.png`, `~0.3s/1.3s/3.3s` after intent) shows, in order: still-homescreen → a blank light/white frame → a flat `#2E7D32` frame with no visible logo/text (all still *before* JS mounted, per the logcat timestamp above — the visible content at this point is native-window painting only).
- A `screenrecord`-based frame-accurate capture was attempted to pin the exact native-green → blank-white ordering but the pulled file had no valid `moov` atom (recording process was killed before finalizing) — **abandoned rather than retried past the bounded budget**; the causal mechanism in Finding 006 is therefore SOURCE-LEVEL RISK (strong, code-grounded hypothesis) rather than frame-by-frame CONFIRMED.
- Final state check (`splash_current_state.png`) confirmed the app had already navigated to the Welcome screen, consistent with S01's expected route, with no error/warning logs from `SplashScreen` in the intervening `logcat` window (clean run, no hydration failure/timeout fired).
- Direct pixel read of `splashscreen_logo.png` (1152×1152 RGBA) confirms it is a **flat green filled circle on a transparent background** — no map icon, no wordmark — which is Finding 006's second, fully source-verified (no runtime needed) component.

## 9. Category scores (mobile-design-review rubric, evaluable categories only)

Categories with no applicable Splash surface (Navigation & IA, Forms & input, Surfaces & grouping) are **N/A**, not scored.

| Category | Start | Deductions | Score | Letter |
|---|---|---|---|---|
| States | 4.0 | −0.5 (Finding 002, loading feedback, medium) | 3.5 | A− |
| Color & theming | 4.0 | −0.5 (Finding 003, subtitle contrast, medium) −0.5 (Finding 006, native/RN handoff, medium-severity color-continuity break) | 3.0 | B+ |
| Typography | 4.0 | none | 4.0 | A |
| Interaction & motion | 4.0 | none (native-driven fade, correct duration for a brand interstitial) | 4.0 | A |
| Performance signals | 4.0 | none (no JS-thread animation, no oversized images beyond the one native PNG) | 4.0 | A |
| Copy & content | 4.0 | none | 4.0 | A |

No open **high**-impact finding this pass (Finding 001 reclassified to ALREADY HANDLED) — Design Score is **not** capped.

**Design Score: A− (mean 3.75)**. **AI Slop Score: A** — zero `tells.md` catalog hits (no gradients, no indigo palette, no inline hex outside theme tokens, no emoji, native-driven animation, clean bilingual copy). Finding 006 is a genuine defect but is not a template-slop signature, so it isn't counted toward the slop score.

## 10. Historical five-finding reconciliation

**FINDING 001 — possible startup freeze.**
**Classification: ALREADY HANDLED (reverses the prior session's HIGH/CONFIRMED claim).**
Root-cause trace (§4): `OfflineMapService.getMapStatus()` has its own internal `try/catch` (`OfflineMapService.ts:170,193`) and can never reject — the prior finding was based on the absence of a `.catch()` at the *call site* in `SplashScreen.tsx:92`, without checking whether the callee could reject in the first place. It cannot. All 8 other dependencies are independently non-rejecting too (7 via explicit `.catch()`, 1 via a resolve-only executor). 8 of 9 have direct unit-test coverage forcing a rejection and asserting the correct fallback route. No fix needed.

**FINDING 002 — loading feedback.**
**Classification: SOURCE-LEVEL RISK, confirmed by runtime timing.**
Measured this session: 9.3s native-to-JS-ready alone on a loaded emulator, on top of the 1500ms minimum and the async checks. The screen gives zero differentiation between "just started" and "taking unusually long" after the one-time 1200ms fade completes. A spinner is not automatically the right fix (brief's own caution, and a spinner during the *common* fast-path would add flicker/complexity for no benefit) — the evidence supports a **time-gated** affordance (e.g., only surface any secondary feedback past some threshold like 3-4s) rather than an always-on spinner. Recommendation only, not implemented.

**FINDING 003 — English subtitle contrast.**
**Classification: CONFIRMED, re-measured fresh this session.**
`entryGateBorder` `#A5D6A7` on `arrivalGreen` `#2E7D32` (both re-grepped from `src/theme/colors.ts:90,108` this session, unchanged from the prior session's values) = **3.12:1** (relative-luminance method). Subtitle is 15px regular weight — does not qualify as WCAG "large text" (needs ≥18.66px bold or ≥24px), so the 4.5:1 AA floor applies, not the 3:1 large-text floor. **Fails by a real margin.**

**FINDING 004 — Urdu title contrast.**
**Classification: PASSES AA, re-measured fresh — treat as a margin/polish improvement, not a violation**, exactly as the brief cautioned.
`lightGreenSubtext` `#E8F5E9` on `arrivalGreen` `#2E7D32` = **4.56:1**, above the 4.5:1 AA floor by 0.06. Not a defect. Worth a small margin increase as a polish item given how close it sits to the line, but not reportable as noncompliance.

**FINDING 005 — accessible startup feedback.**
**Classification: DOWNGRADED from a flagged defect to a documented gap, per the brief's own caution against assuming a missing prop is automatically a failure.**
`SplashScreen.tsx` has no explicit `accessibilityLabel`/`accessibilityLiveRegion` — true, but RN exposes plain `Text` content to TalkBack automatically without one, so E04/E05/E06 are very likely already readable as-is (SOURCE OBSERVATION, not RUNTIME VERIFIED — live TalkBack testing was not run this session, see §7 S16). The real, still-open gap is narrower than "missing accessibility": no announcement of the in-progress state during a measured multi-second wait. ACCESSIBILITY HYPOTHESIS, not a confirmed defect.

## 11. Additional findings (discovered this session)

```
FINDING-006 [high | color/theming, states] Native-to-RN splash handoff breaks visual continuity
  where: android/app/src/main/java/com/aicrafted/karachiijtema/MainActivity.kt:18-19 (theme downgrade)
         android/app/src/main/res/drawable/ic_launcher_background.xml (logo layer)
         android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png (pixel-confirmed: flat green
         circle on transparent, no map icon, no wordmark)
  evidence:
    (a) SOURCE-CONFIRMED, no runtime needed: the native splash's "logo" bitmap is a solid green
        circle composited over the same #2E7D32 background color — contrast approaches 1:1,
        effectively invisible. Native splash reads as a blank green rectangle with no branding,
        unlike the RN-rendered Splash a few seconds later which does show the real logo/title/
        subtitle.
    (b) SOURCE-LEVEL RISK (runtime-observed, not frame-perfectly isolated): MainActivity.onCreate()
        calls setTheme(R.style.AppTheme) before super.onCreate() — AppTheme sets no explicit
        windowBackground, inheriting a light/white background from Theme.AppCompat.DayNight.
        NoActionBar. This runs long before the RN JS bundle is ready (measured 9.3s to
        "Running main" this session), so there is a real window in which the activity's
        background is neither the intended green splash nor the JS-rendered green Splash
        screen. A blank/light frame was directly observed in the captured screenshot sequence
        during a cold launch, consistent with this mechanism; a screenrecord attempt to pin
        the exact frame ordering failed to produce a valid file and was not retried past the
        session's diagnostic budget, so the ordering is not frame-by-frame CONFIRMED.
  user impact: on a cold/slow start, the user may see green (invisible-logo) → blank/light →
    green-with-real-branding, an inconsistent 3-stage flash instead of one continuous branded
    screen — the exact scenario Phase 3/4 of this audit's brief asked to check for.
  confidence: (a) CONFIRMED. (b) SOURCE-LEVEL RISK / plausible, not fully frame-verified.
  existing issue: none found (#153's Finding 3 covers a different Splash gap — silent
    onboarding-repeat on storage failure — not this native-asset/theme issue). Not a duplicate.
  fix: not applied (audit-only). Would need (a) a real logo asset with contrast against the
    background, (b) moving/removing the premature setTheme() call so AppTheme isn't applied
    until RN content is actually ready to paint.
```

## 12. Existing issues cross-referenced

- **#126** — EPIC parent tracker for the UI/UX audit. This report's findings belong under it.
- **#128** — broader core-flow checklist; Splash is in scope but not itself detailed there.
- **#153** (P1, OPEN) — a *different*, already-filed launch-flow audit covering `StartupManager` routing/UX gaps (first-time landing destination, permission-revocation re-ask, redirect-timer duplication, permission-skip copy). Its Finding 3 touches `SplashScreen.tsx:53-56` (the same `hasSeenWelcome` fallback) but from an onboarding-repeat-explanation angle, not the contrast/loading-feedback/native-handoff angle covered here. **No overlap with Findings 002/003/006 below — safe to file as new, not duplicates.**
- **#152** (PR, OPEN) — prior audit-doc recovery PR; this file is a new addition alongside it, not a conflict (checked: no `SPLASH_SCREEN_DEEP_AUDIT.md` existed anywhere in the repo before this session).

## 13. Proposed new tickets (not filed — owner review)

- **SPLASH-UX-001** [medium] — Subtitle text contrast (Finding 003): `entryGateBorder` on `arrivalGreen` = 3.12:1, below WCAG AA 4.5:1 for normal text. Needs a lighter token or bolder/larger weight.
- **SPLASH-UX-002** [medium] — Native splash logo asset is invisible (Finding 006a): replace the flat-green-circle bitmap with real, contrasting branding.
- **SPLASH-UX-003** [medium, needs frame-accurate runtime confirmation] — Native-to-RN theme handoff (Finding 006b): audit `MainActivity.onCreate()`'s `setTheme()` timing against when RN content is actually ready to paint.
- **SPLASH-UX-004** [low/polish] — Time-gated loading affordance for cold starts exceeding ~3-4s (Finding 002), evidence-based, not an always-on spinner.

## 14. Tests performed vs unavailable

**Performed**: full source read of `SplashScreen.tsx`, `StartupManager.ts`, `OfflineMapService.ts` (all 689 lines), `App.tsx`, `RootNavigator.tsx`, `useAppStore.ts` (`waitForStoreHydration`), native splash resources (`styles.xml`, `AndroidManifest.xml`, `MainActivity.kt`, `ic_launcher_background.xml`, `colors.xml`, `splashscreen_logo.png` pixel inspection); existing `SplashScreen.test.tsx` suite read for coverage mapping (33 tests catalogued); WCAG contrast hand-computed from current hex values; live emulator run (fresh install, cold launch, logcat timing, screenshot sequence, final-route confirmation); GitHub issue search (#126, #128, #153, plus a repo-wide "splash" search) and PR #152 review.

**Unavailable / not attempted this pass**: live TalkBack audio verification (S16); Android Back during startup (S15); large-font-scale run (S17); process-kill/relaunch (S18); frame-accurate `screenrecord` capture of the native→blank→JS transition (attempted, file corrupted, not retried); physical-device verification (emulator only); states S03-S10, S13, S14, S19.

## 15. Owner decisions needed

- Finding 002: confirm whether a time-gated loading affordance is worth the added complexity for what is, on a physical device, likely a sub-2-second wait — the 9.3s figure measured here is an emulator-on-loaded-host number, explicitly not claimed as physical-device-representative.
- Finding 006: confirm intended native-splash branding (was a visible logo intended on the green circle, or is the circle a deliberate minimalist placeholder that just needs a contrasting fill?).

## Completeness verdict

**SOURCE AUDIT: COMPLETE** for the Splash-owned startup path (Splash → StartupManager → native splash resources → MainActivity), including a full root-cause trace of every async dependency's rejection surface.

**AVAILABLE RUNTIME AUDIT: PARTIAL** — one live cold-launch executed and captured (logcat timing, screenshot sequence, final-route confirmation), but the frame-accurate native/blank/JS transition timing is not fully isolated, and most of the S02-S19 state matrix was not exercised live.

**ACCESSIBILITY AUDIT: SOURCE-LEVEL COMPLETE, RUNTIME PENDING** — no live TalkBack session run.

**PHYSICAL-DEVICE VERIFICATION: PENDING** (emulator only).

**REAL-USER VALIDATION: PENDING** (not in scope for this pass).

Verified this session: Finding 001 is not a defect (reversed from the prior session). Findings 003 stands, confirmed by fresh measurement. Finding 004 is not a defect (confirmed passes AA). Finding 005 downgraded to a documented gap, not a confirmed accessibility failure. One new, higher-confidence defect (Finding 006) discovered by going beyond `SplashScreen.tsx` into the native Android splash resources, as this phase's brief specifically asked for.

No application code was changed. No screens other than Splash were audited. No fixes were implemented. No PRs were merged.

## 16. Final reconciliation pass (second audit session)

Second pass, same branch/HEAD (`f6a1eb1`), same emulator (`emulator-5554`, still running). Purpose: close remaining Phase-2 checklist items, fix a counting error in §4, upgrade Finding 006b's evidence, and remap every finding onto this pass's required taxonomy (`CONFIRMED DEFECT / CONFIRMED USABILITY PROBLEM / SOURCE-LEVEL RISK / IMPROVEMENT CANDIDATE / ALREADY HANDLED / NOT A DEFECT / REQUIRES VERIFICATION / ENVIRONMENT BLOCKED`). No source changed between sessions (`git status` clean except this doc).

### 16.1 Promise.all count correction

§4 said "9 members." **Correction: the array literally has 10 entries** (`SplashScreen.tsx:92-112`): `getMapStatus()`, 7 `.catch()`-guarded promises, `minVisibleMs`, `waitForStoreHydration(...)`. The historical F001 said "eight" — that count was of *fallible startup-data reads* only (excludes the two pure gating promises, `minVisibleMs` and the hydration wait, neither of which represents a "dependency" that can fail in a meaningful sense). Both counts were internally consistent, just counting different things; neither changes §4's conclusion — all 10 array members are independently non-rejecting.

### 16.2 Additional Phase-2 checklist items closed this pass

- **Android Back during startup** — no `BackHandler` anywhere in `SplashScreen.tsx` or `RootNavigator.tsx` (grepped, zero matches). Splash is the first stack screen with nothing behind it, so a Back press would fall through to default OS/React-Navigation behavior (exit or no-op depending on RN Navigation version defaults) — not overridden, not a custom code path. Not live-tested this pass either. **REQUIRES VERIFICATION** (low priority — no source-level reason to expect a Splash-specific problem, since there's no custom handler to get wrong).
- **Process termination and relaunch** — a killed process has no in-memory state to corrupt; a subsequent launch is architecturally identical to the S01 fresh-cold-launch path already runtime-verified in §7/§8. **ALREADY HANDLED** (equivalent to already-tested S01, no separate code path exists for this scenario).
- **Rapid relaunch / duplicate navigation** — already covered in §6 Interaction (`isMountedRef` guard + test suite). No change.
- **Dark mode / theme-transition** — `android/app/src/main/res/values-night/colors.xml` exists but is an **empty** `<resources/>` (confirmed by reading the file), and there is no `values-night/styles.xml`. So `splashscreen_background` stays `#2E7D32` regardless of OS-level dark mode — no native/JS divergence possible, since `SplashScreen.tsx` also uses the same hardcoded `staticColors.arrivalGreen` unconditionally (the app's separate in-app `darkMode` setting in `useAppStore`/`ThemeService` is a JS-only app-level toggle that Splash never reads). **NOT A DEFECT** — checked directly, not assumed.

No other Phase-2 checklist item (of the 25 listed) turned up new evidence beyond what §3-§11 already cover; re-inspection this pass did not surface a Splash element or state missed by the first pass.

### 16.3 Screenshot evidence upgrade for Finding 006b

Three of this session's earlier raw screenshots were reviewed pixel-by-pixel and the genuinely useful ones committed to `docs/audit/ui-ux/screenshots/`:

- `01a-splash-blank-frame-during-launch.png` — a **fully blank white frame** during cold launch, no content, confirming the blank/light frame Finding 006b hypothesized actually renders on-device (previously inferred only from a corrupted `screenrecord` attempt).
- `01b-splash-native-green-no-logo.png` — a flat `#2E7D32` frame with **no visible logo/text**, confirming native splash renders as a plain green rectangle, consistent with the invisible-logo asset in Finding 006a.
- `01c-splash-final-route-welcome.png` — final settled state, confirming correct S01 routing to Welcome.

A fourth captured frame (labelled at the time as "0.3s") turned out on inspection to be the **Android home screen**, not a Splash frame — timing assumption was wrong, so it was discarded rather than kept as misleading evidence.

**Finding 006b classification unchanged: SOURCE-LEVEL RISK, not upgraded to CONFIRMED.** These screenshots confirm *both* intermediate visual states exist on real device output, but the on-screen clock only has minute resolution (both captured frames read "7:40") — sub-second ordering between the blank-white frame and the green-no-logo frame is still not established. This is a genuine evidence upgrade (both states are now directly screenshotted, not inferred) but does not meet the bar for CONFIRMED causal ordering; a frame-accurate `screenrecord` capture remains the outstanding verification step.

### 16.4 Taxonomy remap (this pass's required label set)

| Finding | Prior label | Remapped label | Why |
|---|---|---|---|
| F001 — startup freeze | ALREADY HANDLED | **ALREADY HANDLED** | unchanged — root-cause trace stands |
| F002 — loading feedback | SOURCE-LEVEL RISK | **IMPROVEMENT CANDIDATE** | runtime-confirmed real (9.3s emulator latency), but not a functional defect — evidence-supported UX improvement, owner-gated |
| F003 — subtitle contrast | CONFIRMED | **CONFIRMED DEFECT** | objective WCAG AA failure, re-measured, unchanged |
| F004 — Urdu contrast | PASSES AA | **NOT A DEFECT** | unchanged |
| F005 — accessible startup feedback | DOWNGRADED / hypothesis | **REQUIRES VERIFICATION** | live TalkBack still not run; source-level reasoning suggests low risk but unconfirmed |
| F006-A — invisible native logo | CONFIRMED | **CONFIRMED DEFECT** | source-verified pixel inspection, unchanged |
| F006-B — blank-frame theme handoff | SOURCE-LEVEL RISK | **SOURCE-LEVEL RISK** | unchanged — see §16.3, evidence strengthened but ordering still unconfirmed |
| Android Back during startup | not previously classified | **REQUIRES VERIFICATION** | see §16.2 |
| Process kill/relaunch | not previously classified | **ALREADY HANDLED** | see §16.2 |
| Dark mode/theme-transition | not previously classified | **NOT A DEFECT** | see §16.2 |

### 16.5 Evidence preservation

Prior session's report and this addendum were both **written to the tracked repo file**, not left in the session scratchpad. Four raw screenshots were reviewed for sensitive content (all are generic app-UI/home-screen captures — timestamps and status-bar icons only, no personal data, no credentials); 3 of 4 useful ones were moved from the session scratchpad into `docs/audit/ui-ux/screenshots/01a-01c` (matching this repo's existing local screenshot-evidence location). **`git add` refused them**: `docs/audit/ui-ux/screenshots/` is covered by a deliberate repo rule (`.gitignore:23`, under a `# Local QA evidence` block alongside `android-runtime-artifacts/`, `ios-runtime-artifacts/`) — this project's own convention is that runtime QA screenshots stay local-only and are never committed. Respected that rule rather than force-adding (`-f`) binary evidence against explicit repo policy. **Owner decision needed**: the three screenshots exist at that local path on this machine for direct inspection, but will not travel with the branch/PR — flag if committed evidence is wanted, which would need a `.gitignore` exception for this subpath. Raw `logcat` text and the corrupted `screenrecord` file were not kept (the logcat timing figure is already transcribed into §8; the corrupted recording has no evidentiary value).

### 16.6 Second-pass completeness verdict

No new CONFIRMED DEFECT beyond F003/F006-A. No change to PHYSICAL-DEVICE VERIFICATION PENDING or REAL-USER VALIDATION PENDING from §"Completeness verdict" above. Source audit for the full Phase-2 25-item checklist is now COMPLETE at the source level (every item closed to a classification, none left silently unexamined). Runtime audit remains PARTIAL for the same reasons as before (TalkBack, Back-button, font-scale, process-kill-while-running, frame-accurate transition timing all still not live-tested). No application code changed this pass either.
