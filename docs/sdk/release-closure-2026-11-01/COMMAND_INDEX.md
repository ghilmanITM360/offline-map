# Raw command index

Expected RED probes and rejected candidate failures are preserved; only hotfix-* and accepted-* runs establish final acceptance. Each JSON records cwd, exit and duration; paired .log/.stderr contains raw output.

| Record | Exit | Seconds | Command |
| --- | --- | --- | --- |
| accepted-bundle-build.json | 0 | 66.23688883300001 | `node scripts/sdk-package/bundle.mjs /private/tmp/offline-sdk-delivery-1a913b9-20261101` |
| accepted-consumer-audit.execution.json | 1 | 6.290014166000001 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| accepted-delivered-ci.json | 0 | 4.977595 | `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| accepted-delivered-jest.json | 0 | 7.407487083 | `/private/tmp/offline-sdk-delivery-1a913b9-20261101.verification/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer/node_modules/.bin/jest --ci --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/accepted-delivered-jest-results.json` |
| accepted-delivered-metro-android.json | 0 | 14.475283625 | `/private/tmp/offline-sdk-delivery-1a913b9-20261101.verification/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer/node_modules/.bin/expo export --platform android --output-dir export-delivered-android --dump-sourcemap --max-workers 1` |
| accepted-delivered-metro-ios.json | 0 | 13.443504791 | `/private/tmp/offline-sdk-delivery-1a913b9-20261101.verification/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer/node_modules/.bin/expo export --platform ios --output-dir export-delivered-ios --dump-sourcemap --max-workers 1` |
| accepted-delivered-security.json | 0 | 0.12714054100000002 | `node /Users/ghilmankhan/workprojects/offline-map/scripts/test-dependency-security.mjs /private/tmp/offline-sdk-delivery-1a913b9-20261101.verification/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer` |
| accepted-delivered-types.json | 0 | 1.495901542 | `/private/tmp/offline-sdk-delivery-1a913b9-20261101.verification/offline-sdk-delivery-1a913b9-20261101/examples/expo-consumer/node_modules/.bin/tsc --noEmit -p .` |
| components-full.json | 0 | 107.157588542 | `npm run test:components -- --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/components-full-results.json` |
| consumer-audit.execution.json | 1 | 44.531149750000004 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| consumer-lock-resolve.json | 0 | 71.680620292 | `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` |
| consumer-selected-audit.execution.json | 1 | 11.546115791 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| dependency-green-complete.json | 1 | 0.258082792 | `npm run test:dependency-security` |
| dependency-green-confirmed.json | 0 | 0.31545016600000003 | `npm run test:dependency-security` |
| dependency-green-final.json | 1 | 0.289382167 | `npm run test:dependency-security` |
| dependency-green-metadata-fixed.json | 1 | 0.24771429200000003 | `npm run test:dependency-security` |
| dependency-green-v2.json | 0 | 0.296967084 | `npm run test:dependency-security` |
| dependency-security.json | 0 | 0.16308125 | `npm run test:dependency-security` |
| final-bundle.json | 0 | 81.859685833 | `node scripts/sdk-package/bundle.mjs /private/tmp/offline-sdk-delivery-10bb3b4-20261101` |
| final-components.json | 0 | 92.09333245799999 | `npm run test:components -- --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/final-components-results.json` |
| final-delivered-ci.json | 0 | 5.332977125 | `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| final-delivered-jest.json | 0 | 8.906502416 | `/private/tmp/offline-sdk-delivery-10bb3b4-20261101.verification/offline-sdk-delivery-10bb3b4-20261101/examples/expo-consumer/node_modules/.bin/jest --ci --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/delivered-jest-results.json` |
| final-delivered-metro-android.json | 1 | 5.859722792 | `/private/tmp/offline-sdk-delivery-10bb3b4-20261101.verification/offline-sdk-delivery-10bb3b4-20261101/examples/expo-consumer/node_modules/.bin/expo export --platform android --output-dir export-delivered-android --dump-sourcemap --max-workers 1` |
| final-delivered-security.json | 0 | 0.145831625 | `node /Users/ghilmankhan/workprojects/offline-map/scripts/test-dependency-security.mjs /private/tmp/offline-sdk-delivery-10bb3b4-20261101.verification/offline-sdk-delivery-10bb3b4-20261101/examples/expo-consumer` |
| final-delivered-types.json | 0 | 2.056846667 | `/private/tmp/offline-sdk-delivery-10bb3b4-20261101.verification/offline-sdk-delivery-10bb3b4-20261101/examples/expo-consumer/node_modules/.bin/tsc --noEmit -p .` |
| final-dependency-security.json | 0 | 0.25141725 | `npm run test:dependency-security` |
| final-lint.json | 0 | 5.08514425 | `npm run lint` |
| final-npm-test.json | 0 | 57.906407333 | `npm test` |
| final-sdk-package.json | 0 | 4.972861958 | `npm run test:sdk-package` |
| final-typecheck.json | 0 | 5.707010041 | `npm run typecheck` |
| hotfix-components.json | 0 | 83.578295416 | `npm run test:components -- --runInBand --watchman=false --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/hotfix-components-results.json` |
| hotfix-consumer-audit.execution.json | 1 | 3.210407291000001 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| hotfix-consumer-lock.json | 0 | 0.9528466250000001 | `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| hotfix-dependency-security.json | 0 | 0.227128583 | `npm run test:dependency-security` |
| hotfix-fresh-consumer-audit.execution.json | 1 | 1.758731917 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| hotfix-fresh-lock.json | 0 | 4.720694542 | `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| hotfix-lint.json | 0 | 4.547474458 | `npm run lint` |
| hotfix-npm-test.json | 0 | 53.946572540999995 | `npm test` |
| hotfix-root-audit.execution.json | 1 | 14.42838975 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| hotfix-sdk-package.json | 0 | 4.5342259579999995 | `npm run test:sdk-package` |
| hotfix-typecheck.json | 0 | 5.075237416999999 | `npm run typecheck` |
| image-size-red.json | 1 | 0.757476959 | `npm run test:dependency-security` |
| image-size-update.json | 0 | 1.1799952080000002 | `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| lint.json | 0 | 6.743590833000001 | `npm run lint` |
| metro-debug-android.json | 1 | 3.547965709 | `env EXPO_DEBUG=1 ./node_modules/.bin/expo export --platform android --output-dir export-debug-android --dump-sourcemap --max-workers 1` |
| metro-file-api-green.json | 0 | 0.290604875 | `npm run test:dependency-security` |
| metro-file-api-red.json | 1 | 0.296518167 | `npm run test:dependency-security` |
| metro-hotfix-install.json | 0 | 1.7127067919999999 | `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| npm-test.json | 0 | 71.112550167 | `npm test` |
| postcss-green-materialized.json | 0 | 0.39421966599999997 | `npm run test:dependency-security` |
| postcss-green.json | 1 | 0.458130666 | `npm run test:dependency-security` |
| postcss-install.json | 0 | 1.353802167 | `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| postcss-lock-update.json | 0 | 1.754112916 | `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| postcss-materialize.json | 1 | 29.474566915999997 | `npm install postcss@8.5.32 --no-save --package-lock=false --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| postcss-red.json | 1 | 4.808964833 | `node scripts/test-dependency-security.mjs` |
| postcss-revalidate-install.json | 0 | 1.697151375 | `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| postcss-target-update.json | 0 | 4.850552709 | `npm update postcss --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=20000` |
| postreview-npm-test.json | 0 | 58.425569959 | `npm test` |
| reg-baseline.json | 0 | 198.185726042 | `npm run test:components -- --runInBand --watchman=false --runTestsByPath src/__tests__/LocationsDirectoryScreen.test.tsx src/__tests__/DirectoryRecentManagement.test.tsx --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/reg-baseline-results.json` |
| reg-repeat1.json | 0 | 7.198182708 | `npm run test:components -- --runInBand --watchman=false --runTestsByPath src/__tests__/LocationsDirectoryScreen.test.tsx src/__tests__/DirectoryRecentManagement.test.tsx --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/reg-repeat1-results.json` |
| reg-repeat2.json | 0 | 6.939755458 | `npm run test:components -- --runInBand --watchman=false --runTestsByPath src/__tests__/LocationsDirectoryScreen.test.tsx src/__tests__/DirectoryRecentManagement.test.tsx --json --outputFile=/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/resume-20261101/reg-repeat2-results.json` |
| root-audit.execution.json | 1 | 34.975058125 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| root-final-audit.execution.json | 1 | 14.690768917 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| root-patched-audit.execution.json | 1 | 12.420379833 | `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000` |
| sdk-package.json | 0 | 5.130579834 | `npm run test:sdk-package` |
| typecheck.json | 0 | 12.702305292 | `npm run typecheck` |
