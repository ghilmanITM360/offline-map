# Native command reproduction

Run Git operations only from `/Users/ghilmankhan/workprojects/offline-map`. Native commands use the existing isolated delivered consumer recorded in README, never an alternate Git checkout.

Android prebuild: `CI=1 npx expo prebuild --platform android --no-install` (exit0).

Android native build from its android directory: `ANDROID_HOME=/Users/ghilmankhan/Library/Android/sdk ANDROID_SDK_ROOT=/Users/ghilmankhan/Library/Android/sdk JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home CI=1 ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=1 --no-parallel --no-daemon -Dorg.gradle.jvmargs='-Xmx2048m -XX:MaxMetaspaceSize=512m'` (exit0,3m39s).

Emulator: `~/Library/Android/sdk/emulator/emulator -avd Ijtema_API_36_Play -gpu host -no-snapshot-load -no-snapshot-save -no-boot-anim`. No wipe, no other AVD. Install preserved new APK using `adb -s emulator-5554 install -r <APK>`; `adb shell am start -W -n com.example.sdkconsumer/.MainActivity`. UI driver commands and exact labels/bounds are in android-commands.jsonl; screenshots/XML named android-*. The tracked driver has a durable default output path and optional SDK_NATIVE_EVIDENCE.

iOS prebuild: `CI=1 npx expo prebuild --platform ios --no-install`; from ios: `CI=1 pod install --no-repo-update` (both exit0).

iOS build from consumer:

```sh
CI=1 NODE_ENV=production ENTRY_FILE=/private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer/index.js xcodebuild -workspace ios/SDKConsumer.xcworkspace -scheme SDKConsumer -configuration Release -sdk iphonesimulator -destination 'id=7A124E27-1A57-4346-B164-72710BADD963' -derivedDataPath /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01/ios-derived -jobs 1 CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES
```

Exit0; initial identical command without ENTRY_FILE exited65 (/tmp alias mismatch). See both build logs. Never reuse the initial failed output as an accepted app.

Install/launch: `xcrun simctl install <UDID> <recorded .app>`; `xcrun simctl launch <UDID> com.example.sdkconsumer`. UI actions used cua_repl Simulator AX buttons with a freshly read tree, including demo tools, language, guide steps, real permission prompt, candidate cancel/confirm, native pack self-test and Finish. Live adapter explicitly switched from simulated to device. Screenshots used `xcrun simctl io <UDID> screenshot <path>`.

Fonts: `xcrun simctl ui <UDID> content_size large`, `extra-large`, `accessibility-extra-extra-extra-large`; reverse/repeat and restore large. OS light was unchanged.

Native walk exact command/fixture/log PID and timing: ios-native-walk.json, walking-fixture.json. Native app log: `xcrun simctl spawn <UDID> log stream --level info --style compact --predicate 'process == "SDKConsumer"'`; stopped own collector after test. Restore: `simctl location <UDID> clear`, `simctl shutdown <UDID>`. Android restoration is recorded in RESTORATION.json.

No full source suites/audits/routing goldens were rerun or reclassified in this native-only batch. No artifact regeneration or production source correction. Validation checks JSON/link integrity, hash inventories, driver syntax, scoped secrets and Git diff.
