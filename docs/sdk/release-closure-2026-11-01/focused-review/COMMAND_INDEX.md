# Fresh reviewer command index

Fresh executions only. Raw stdout/stderr retained together. npm audit exit1 is expected and preserved. NODE_PATH unset. Wall durations use monotonic time. Node24.14.0/npm11.9.0.

## archive-verifier

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:47:00.110499+00:00
- exit: 0; wall seconds: 0.141
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/archive-verifier.log
- log SHA-256: a1c08d3c5a5a4b2ac673d0aa0c6870474284fe412b0fc85182fb6fda0628e90f

```sh
node scripts/sdk-package/test-bundle.mjs /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/delivery-1a913b9-final.tgz /private/tmp/offline-sdk-focused-review-7987d90b0152
```

## final-code-diff

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:47:17.880856+00:00
- exit: 0; wall seconds: 0.049
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/final-code-diff.log
- log SHA-256: 031f71f960dd32065ef68a4c967c4fb4f5696c97fd1d985055d9a90334e54505

```sh
git diff 923a604be161c749bd5bf50d8fdd8c036ba4bcbb..18847f7fb11fe846af1766b99c2c835910d93fb3 -- package.json package-lock.json examples/expo-consumer/package.json scripts/sdk-package/bundle.mjs scripts/sdk-package/inventory.mjs scripts/sdk-package/test-bundle.mjs scripts/test-dependency-security.mjs
```

## issue-393

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:47:18.035654+00:00
- exit: 0; wall seconds: 0.876
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/issue-393.log
- log SHA-256: 4a9299054ff03a0d34c616bf295dbd5dc8ee7e003c34de0b5bb6c1b510fe06c1

```sh
gh issue view 393 --repo ghilmanITM360/offline-map --json number,title,body,comments,state,url
```

## consumer-npm-ci

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:47:16.673749+00:00
- exit: 0; wall seconds: 9.131
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/consumer-npm-ci.log
- log SHA-256: 74a0e44afb647430c8d223c785f26ccfb424624e9b1c087fb629a3e1f12622b0

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefer-offline
```

## consumer-types

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:47:29.394215+00:00
- exit: 0; wall seconds: 2.166
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/consumer-types.log
- log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

```sh
./node_modules/.bin/tsc --noEmit -p .
```

## root-lock-audit

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:47:30.553201+00:00
- exit: 1; wall seconds: 21.423
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/root-lock-audit.log
- log SHA-256: 498fdd54348e09d2c2376251bb587a3a1956d8920a6d74f70334ef849e17442b

```sh
npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000
```

## consumer-lock-audit

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:47:48.740488+00:00
- exit: 1; wall seconds: 4.859
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/consumer-lock-audit.log
- log SHA-256: 6b40530f48f0ff03d8d4b778b23a931075187e494ec8dfc27bb10e81258871ca

```sh
npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000
```

## consumer-security

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:47:59.563348+00:00
- exit: 0; wall seconds: 0.402
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/consumer-security.log
- log SHA-256: 284549def7e7fa1281232df0cb5f018c1204a40d4b8f1adcfd78c2a6692f0783

```sh
node /Users/ghilmankhan/workprojects/offline-map/scripts/test-dependency-security.mjs /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
```

## root-security

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:48:00.123736+00:00
- exit: 0; wall seconds: 0.35
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/root-security.log
- log SHA-256: c0b22a842b13edf298e7a7e0133fd0247d9d441d747d1bb3f6d636710b2a076d

```sh
node scripts/test-dependency-security.mjs
```

## consumer-tests

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:47:47.614460+00:00
- exit: 0; wall seconds: 18.985
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/consumer-tests.log
- log SHA-256: 851d622de54d68b89c58ce2f6d6acc30d431f57a274f9f0fcce3be560508562d

```sh
./node_modules/.bin/jest --ci --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/consumer-tests-results.json
```

## root-typecheck

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:48:00.610582+00:00
- exit: 0; wall seconds: 10.189
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/root-typecheck.log
- log SHA-256: 1f526e8af8d7c0d50bd938d1a64afe9bf80f625bb4334c9f9ee4dad104f98a77

```sh
npm run typecheck
```

## android-export

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:48:20.068660+00:00
- exit: 0; wall seconds: 22.121
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/android-export.log
- log SHA-256: 5bef4f995e9e47b6faf2d5a7932b2a926d2a3db2c8c4b61a9c4285dfb0d0b2b5

```sh
env CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform android --output-dir export-android --dump-sourcemap --max-workers 1
```

## component-config

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:48:42.553330+00:00
- exit: 0; wall seconds: 0.426
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/component-config.log
- log SHA-256: 2ece84824892538e3a38b729eda38c1ae6b8ee007b272968f7c7d14f9fbf7e9b

```sh
./node_modules/.bin/jest --showConfig
```

## ios-export

- cwd: /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer
- UTC: 2026-11-01T06:48:47.090328+00:00
- exit: 0; wall seconds: 25.969
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/ios-export.log
- log SHA-256: 03e1e896c86d5e8bd94b5dde3a1fcfed24c9d3f4d34d2949a66a031840480e04

```sh
env CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform ios --output-dir export-ios --dump-sourcemap --max-workers 1
```

## delivery-export-verification

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:49:34.081924+00:00
- exit: 0; wall seconds: 0.515
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/delivery-export-verification.log
- log SHA-256: 6002a4cb5c7f66bd0bd36ea57937da2e25e228506085cefdb6419dd20a275eea

```sh
python3 /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/verify-evidence.py
```

## root-lint

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:49:29.444502+00:00
- exit: 0; wall seconds: 6.461
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/root-lint.log
- log SHA-256: b6951e6f52ec6da067c00639fa3036473af3c19b1bf42f198a81b76fb2a85c98

```sh
npm run lint
```

## focused-components

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:49:39.392699+00:00
- exit: 0; wall seconds: 17.097
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/focused-components.log
- log SHA-256: 9f53a95c60762b2cf90f7d1ca57e31889ac011a63b23a2945603dd08ffeef1a7

```sh
npm run test:components -- --runInBand --watchman=false --runTestsByPath src/__tests__/LocationsDirectoryScreen.test.tsx src/__tests__/DirectoryRecentManagement.test.tsx --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/focused-components-results.json
```

## audit-graph-comparison

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:50:08.190623+00:00
- exit: 0; wall seconds: 0.092
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/audit-graph-comparison.log
- log SHA-256: 61bdcd86cc34950add8c4d53eb02341f5e16695da8a97199cfa3ae8fce548216

```sh
python3 /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/compare-audits.py
```

## component-scenarios

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:50:36.780809+00:00
- exit: 0; wall seconds: 0.061
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/component-scenarios.log
- log SHA-256: baa289d96450c4ec3bca807b6fa8920febe3c54411de77a6f51f3284c7d3c203

```sh
rg -n 'remount|clear|remove|timeout|skip|setTimeout' src/__tests__/LocationsDirectoryScreen.test.tsx src/__tests__/DirectoryRecentManagement.test.tsx jest.config.js
```

## full-components

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:50:15.111256+00:00
- exit: 0; wall seconds: 148.995
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/full-components.log
- log SHA-256: 48bad9e348702e200e28a3a1fed8af70ae25f50452db9937b66864b32bde7538

```sh
npm run test:components -- --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/full-components-results.json
```

## diff-check

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:52:59.960398+00:00
- exit: 0; wall seconds: 0.035
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/diff-check.log
- log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

```sh
git diff --check
```

## final-state

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:53:00.320594+00:00
- exit: 0; wall seconds: 2.58
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/final-state.log
- log SHA-256: 8c14eebe6fb5b8e8203537f388805e4399dea3f354b6b352a2b78ed4da96190d

```sh
python3 /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/check-state.py
```

## reproducibility-first

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:54:07.004878+00:00
- exit: 0; wall seconds: 2.513
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/reproducibility-first.log
- log SHA-256: c52c3b69295292afb5360ca713343701aea4e8e06bae1c587d59c512191355e8

```sh
node scripts/sdk-package/pack.mjs /private/tmp/offline-sdk-focused-review-7987d90b0152/proof-first
```

## reproducibility-second

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:54:22.916810+00:00
- exit: 0; wall seconds: 3.246
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/reproducibility-second.log
- log SHA-256: b5ba56ab20ed0e456c2c409392ab22a088da1cdcb95547f0ccbaddb4945f05c8

```sh
node scripts/sdk-package/pack.mjs /private/tmp/offline-sdk-focused-review-7987d90b0152/proof-second
```

## reproducibility-hashes

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:54:36.863472+00:00
- exit: 0; wall seconds: 0.144
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/reproducibility-hashes.log
- log SHA-256: 7945d8b345f5597ebf30865b2a2b5f9ec3d142b36f99cb924e836d5ed0d524f7

```sh
shasum -a 256 /private/tmp/offline-sdk-focused-review-7987d90b0152/proof-first/muslim-ummah-offline-navigation-0.1.0.tgz /private/tmp/offline-sdk-focused-review-7987d90b0152/proof-second/muslim-ummah-offline-navigation-0.1.0.tgz /private/tmp/offline-sdk-focused-review-7987d90b0152/offline-sdk-delivery-1a913b9-20261101/package/muslim-ummah-offline-navigation-0.1.0.tgz
```

## final-state-after-proof

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:54:37.101768+00:00
- exit: 0; wall seconds: 2.797
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/final-state-after-proof.log
- log SHA-256: 31e125ed97c58fafce374d0355f47e45ad5ed8fc50bbf8d9ca57b3323fe65bb1

```sh
python3 /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/check-state.py
```

## component-default-timeout

- cwd: /Users/ghilmankhan/workprojects/offline-map
- UTC: 2026-11-01T06:54:58.917550+00:00
- exit: 0; wall seconds: 0.021
- log: /Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/focused-review-20261101/review-20261101T064656Z-e05b19c7/component-default-timeout.log
- log SHA-256: 889b3f4c925bf5542c8272b16e19912b612110543012e782b68edf9c3026c07a

```sh
rg -n 'testTimeout|5000' node_modules/jest-circus/build/state.js src/__tests__/jest.setup.ts jest.config.js
```
