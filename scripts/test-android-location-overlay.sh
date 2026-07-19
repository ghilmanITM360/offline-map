#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB_BIN="${ADB_BIN:-$SDK_ROOT/platform-tools/adb}"
OUT_DIR="${OUT_DIR:-android-runtime-artifacts}"
UI_XML="$OUT_DIR/window.xml"

if [[ ! -x "$ADB_BIN" ]]; then
  echo "adb not found at $ADB_BIN"
  echo "Set ADB_BIN or ANDROID_HOME/ANDROID_SDK_ROOT first."
  exit 1
fi

mkdir -p "$OUT_DIR"

"$ADB_BIN" devices
"$ADB_BIN" shell settings get secure location_mode || true
"$ADB_BIN" shell uiautomator dump /sdcard/window.xml
"$ADB_BIN" pull /sdcard/window.xml "$UI_XML"

echo "Saved UI dump to $UI_XML"
echo "Attempting safe dismiss with Back."
"$ADB_BIN" shell input keyevent KEYCODE_BACK || true

echo
echo "If Google Location Accuracy overlay returns, clear it manually in emulator Settings."
echo "Suggested path: Settings > Location > Location Services > Google Location Accuracy."
