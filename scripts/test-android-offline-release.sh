#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB_BIN="${ADB_BIN:-$SDK_ROOT/platform-tools/adb}"
APP_ID="${APP_ID:-com.aicrafted.karachiijtema}"
APK_PATH="${APK_PATH:-android/app/build/outputs/apk/release/app-release.apk}"

if [[ ! -x "$ADB_BIN" ]]; then
  echo "adb not found at $ADB_BIN"
  echo "Set ADB_BIN or ANDROID_HOME/ANDROID_SDK_ROOT first."
  exit 1
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "Release APK not found at $APK_PATH"
  echo "Build it first with: npm run android:release:apk"
  exit 1
fi

"$ADB_BIN" devices
"$ADB_BIN" install -r "$APK_PATH"
"$ADB_BIN" shell svc wifi disable
"$ADB_BIN" shell svc data disable
"$ADB_BIN" shell am force-stop "$APP_ID"
"$ADB_BIN" shell monkey -p "$APP_ID" 1
sleep 5
"$ADB_BIN" logcat -d | grep -i -E "redbox|unable to load script|fatal|exception|$APP_ID" || true

echo
echo "Offline release smoke finished."
echo "Remember to restore network after QA:"
echo "\"$ADB_BIN\" shell svc wifi enable"
echo "\"$ADB_BIN\" shell svc data enable"
