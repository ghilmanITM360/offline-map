# V2 Android Runtime QA Checklist

Use this checklist before any production-readiness claim for the Phase 5 v2 active navigation branch. Code/test readiness is not the same as Android runtime readiness.

## A. Setup

- Install Android SDK and platform tools.
- Set `ANDROID_HOME` or `ANDROID_SDK_ROOT`.
- Confirm `adb devices` lists the test device or emulator.
- Build and install a fresh release Android build with embedded JS:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
npm run android:release:apk
npm run android:install:release
```

- Do not use `npx expo run:android` for offline restart sign-off. That path installs a Metro-dependent debug build and can redbox offline even when offline app logic is correct.
- Set `.env` flags:

```bash
EXPO_PUBLIC_USE_IJTEMA_V2_MAP=true
EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING=true
EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=true
```

- Rebuild Android after changing native or Expo public config.

## B. Home Visual Test

- App opens without a crash.
- B1-B42 are visible.
- Block labels are visible.
- Rasta 01-11 are visible.
- Shahr-e-Pindal North, South, and West are visible.
- Gates with coordinates are visible.
- Nonexistent gates 06/09/10/11/12 do not create fake markers or normal search results.
- Graph-only fallback is visible if Google/base tiles are unavailable.

## C. Search Test

- Search `Block 28`.
- Search `Block 42`.
- Search `Gate 21`.
- Search `Gate 15`.
- Search `Rasta 09`.
- Search `Shahr-e-Pindal North`.
- Test Urdu search if the Android keyboard/input method supports it.

## D. Directions Preview

- Gate 21 -> Block 28 previews a routable v2 route.
- Gate 15 -> representative block previews a routable v2 route.
- Gate 05 -> Block 36 previews a routable v2 route.
- Gate 13 -> Block 42 previews a routable v2 route.
- Outside west coordinate -> nearest connected official gate -> Block 28 previews a routable v2 route.
- Disconnected Gate 18 shows: `This gate needs connector verification before navigation.`
- Gates 06/09/10/11/12 do not appear as active gate choices.

## E. Active Navigation

- Start Navigation from Gate 21 -> Block 28.
- V2 NavigationScreen opens.
- Route line is visible.
- Block context is visible.
- Rasta lines are visible.
- Start marker is visible.
- Current/user marker is visible.
- Red destination marker is visible.
- Instruction card uses friendly wording.
- Normal mode does not show raw internal IDs.
- Exit works.
- Recenter works.

## F. Stability

- Stationary route does not constantly recalculate.
- ETA remains stable during small GPS jitter.
- Route remains visible during recalculation.
- Weak GPS warning appears when accuracy is poor.

## G. Developer Mode

- Normal mode hides raw IDs such as `R9-03`, `SPNP-01`, and `B28_C2`.
- Developer mode may show internal labels for debugging.

## H. Regression

- Old v1 navigation still works when v2 flags are false.
- App does not crash with all v2 flags off.
- App does not crash with a missing Google Maps key.
- V2 routes do not enter the legacy navigation runtime when v2 navigation is disabled.

## Sign-Off Rule

- Debug/dev APK offline redbox does not fail this checklist by itself. Only the release APK decides the offline runtime gate.
- Mark Android runtime PASS only after all required manual checks pass on a real Android device or emulator.
- Until then, the branch status remains CONDITIONAL PASS.
