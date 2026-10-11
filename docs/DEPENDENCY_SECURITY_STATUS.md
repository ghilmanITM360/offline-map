# Complete package-level dependency triage

Current tracking: [#370](https://github.com/ghilmanITM360/offline-map/issues/370), superseding reliance on the older exception in #62. Audited lockfile is unchanged by PRs #367–369.

## Scope and result

All 66 package entries in the preserved fresh npm audit have been assigned to their underlying advisory groups. There are 8 vulnerable root packages and 12 individual advisories; propagated parents are not independent vulnerability mechanisms. Exact package/version/severity mapping appears below and in advisory-mapping.json. This completes package-level classification, consumer inspection and explicit deferral rationale. It does not constitute an exploit test, complete bundle inventory, native binary audit or certification that all downstream code is safe.

No proven high-risk attendee-input mobile runtime vulnerability was established. Toolchain vulnerabilities remain genuine findings and must not be erased from release reporting. Runtime wrapper packages including Expo, MapLibre and Reanimated inherit advisories through config/CLI/test dependencies; their presence alone does not prove the vulnerable Node function executes in the shipped native app. Native runtime/bundle verification remains unperformed. Every group is deferred to a dedicated security maintenance issue/PR, with compatibility reasons below; no application or lockfile mutation occurred.

## Actual consumers, inputs and disposition

### shell-quote 1.10.0: GHSA-pqg4-j6r4-53mv, critical

Lock chain: react-native -> react-devtools-core -> shell-quote (^1.6.1). Installed react-devtools-core/dist/standalone.js embeds shell parsing in module8923 and calls exported parse (fm.Q) for developer-controlled REACT_EDITOR. Editor launching uses child_process.spawn with separate arguments on macOS/Linux, and cmd.exe /C on Windows. The embedded module inspected exports parse; a quote(parse(...).concat(untrustedInput)) chain was not established. No application source requests attendee text to launch an editor. Therefore the specific quote/comment/line-terminator advisory is not demonstrated on this caller path. Windows editor launching retains its own host shell risk; not claimed eliminated. Earlier bounded report's no-caller implication is superseded by this evidence.

Patched release1.11.0, within declared ^1.6.1 range. A targeted lock update is a reasonable dedicated security PR candidate, with React DevTools/editor smoke tests; bundled standalone code may not change merely by updating separately installed shell-quote. Inspect actual bundled version before claiming mitigation. Do not classify mobile RCE without an actual vulnerable quote and shell-execution chain.

Source: https://github.com/advisories/GHSA-pqg4-j6r4-53mv

### node-forge 1.4.0: GHSA-86w9-cpqp-85rv, high

Lock consumers: Expo CLI (^1.3.3) and @expo/code-signing-certificates (^1.3.3). Expo-updates depends on the latter through its code-signing CLI; configureCodeSigningAsync reads caller-provided certificate/key files and calls validateSelfSignedCertificate. Certificate helper calls certificate.verify(certificate), and generated-signature verification calls certificate.publicKey.verify. Expo CLI utils/codesigning.js reads configured local signing certificate/private key paths; development signing can fetch/cache Expo development certificates. iOS Security.js parses certificate returned by macOS security executable. These are real certificate parsing/verification consumers, including externally obtained development certificate chains; not only inert dependency metadata.

Advisory affects PKCS#1 verification with low-exponent public keys and malformed nested DigestAlgorithm elements. Existing Expo config does not enable codeSigningCertificate or an OTA endpoint; tracked Android updates.ENABLED=false. ErrorBoundary imports Expo Updates only for reload. The inspected JS signing consumers run in Node tooling, not a demonstrated native OTA verifier. Do not infer safety of future OTA/signing configuration from current absence. No patched version is listed in current primary advisory. Consequently no truthful safe version override can be offered. Dedicated maintenance must track upstream fix, review key exponent/trust requirements and certificate input boundaries, and reassess before OTA activation. npm audit's Expo downgrades are not an appropriate fix.

Source: https://github.com/advisories/GHSA-86w9-cpqp-85rv

### image-size 1.2.1: GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr, high

Lock consumer Metro (^1.0.2). Metro src/Assets.js imports image-size and calls it with filesystem asset content during getAssetSize. Extension allowlist excludes JXL/HEIF/ICNS, but image-size detects formats from buffer content, so merely renaming malicious content to an allowed extension is not proven safe. Asset inputs are project/dependency files and development server asset processing, not an attendee upload feature. No matching JXL/HEIF/ICNS files found in tracked assets/src. Untrusted pull requests/dependency assets can therefore threaten build/dev host availability; current app attendee-input exploit not established.

Both advisories patched in2.0.3; incompatible with Metro ^1.0.2. Blind global override may break export/API expectations. Dedicated PR must test Metro integration or apply a reviewed narrow upstream patch/adapted compatible version; no automatic override recommended.

Sources: https://github.com/advisories/GHSA-5p2g-fcmc-qvqq ; https://github.com/advisories/GHSA-w3rx-r6r6-pgpr

### braces3.0.3: GHSA-vfj7-8cjw-p6xm, high

Lock consumer micromatch (^3.0.3), reached by Jest, Metro file map, patch-package workspace discovery and related propagated parent packages. Inputs are developer/project/config glob patterns and filesystem matching. No Directory query passed into micromatch identified. Deeply nested attacker-controlled glob configuration can exhaust Node stack; repository config supplied by untrusted PR is a tooling boundary. Current advisory lists no patched release, so do not invent a safe override. Dedicated issue should track upstream depth guard/fix and constrain untrusted build config; broad Jest/Metro upgrades unrelated to localization remain deferred.

Source: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

### postcss8.4.x: four advisories

Lock consumer @expo/metro-config pins ~8.4.32. Its transform-worker/postcss.js creates PostCSS processor and invokes process(src, processOptions), with from:file and source-map settings. Inputs are local CSS from project/dependencies, not mobile Directory/location text. Source scan found no CSS/SCSS under assets/src. The Expo web/build pipeline still contains a real vulnerable consumer if CSS enters it; untrusted repository/dependency CSS could read build-host files. No mobile CSS ingestion or browser HTML style injection feature found.

GHSA-qx2v-qp2m-jg93: CSS stringify embedded in HTML style can cause XSS; no application HTML embedding consumer established. Patched8.5.10.
GHSA-6g55-p6wh-862q: malicious CSS sourceMappingURL triggers arbitrary host file read. Patched8.5.12.
GHSA-r28c-9q8g-f849: incomplete earlier fix permits .map traversal. Patched8.5.18.
GHSA-fxqj-rqcc-2cmp: additional incomplete fix when from unset. Expo consumer supplies from, reducing that exact condition; older installed code still has prior vulnerabilities. Patched8.5.23.

Cumulative candidate8.5.23 violates Expo ~8.4.32 pin, although same major. Dedicated override PR merits investigation with actual Expo CSS/source-map fixtures and full build/test compatibility. Do not assert compatibility from semver major alone. Restrict untrusted CSS/build inputs meanwhile; not a runtime mobile blocker established by this audit.

Sources: https://github.com/advisories/GHSA-qx2v-qp2m-jg93 ; https://github.com/advisories/GHSA-6g55-p6wh-862q ; https://github.com/advisories/GHSA-r28c-9q8g-f849 ; https://github.com/advisories/GHSA-fxqj-rqcc-2cmp

### source-map-js1.2.1: GHSA-68fv-2mgg-jv7q, high

Lock consumer PostCSS (^1.2.1), which consumes previous source maps from CSS processing. Attacker-controlled indexed map offsets can block build-host event loop. Same source-map input boundary as preceding group; no mobile runtime import chain demonstrated. Patched1.2.2 is within declared range. Targeted lock update is a reasonable dedicated security PR candidate with source-map fixture verification, but does not fix PostCSS file-read advisories by itself.

Source: https://github.com/advisories/GHSA-68fv-2mgg-jv7q

### sprintf-js1.0.3: GHSA-hp3w-g68c-fv3c, moderate

Lock chain babel-plugin-istanbul -> @istanbuljs/load-nyc-config -> js-yaml -> argparse -> sprintf-js (~1.0.2). argparse argument_parser.js supplies fixed error formatting templates and options/error values as arguments. The advisory requires attacker-controlled format precision strings; that path was not established through observed fixed templates. Coverage config and developer CLI inputs remain toolchain boundaries. No patched release listed; defer to dedicated maintenance and verify all format-string construction if custom coverage CLI configuration changes. No fictitious override version.

Source: https://github.com/advisories/GHSA-hp3w-g68c-fv3c

### uuid7.x: GHSA-w5hq-g745-h8pq, moderate

Lock consumer xcode (^7.0.3), propagated via Expo config/config-plugins/prebuild. xcode/lib/pbxProject.js generateUuid uses uuid.v4() without supplied output buffer, not advisory's v3/v5/v6 insufficient-buffer path. Thus actual inspected caller is outside vulnerable API condition. Still record vulnerable package and maintenance debt. Patched11.1.1 (also12.0.1/13.0.1) violates xcode ^7.0.3 and may change module/API compatibility; blind override not appropriate. Prefer upstream xcode-compatible upgrade after dedicated prebuild/iOS project fixtures. No iOS build was run.

Source: https://github.com/advisories/GHSA-w5hq-g745-h8pq

## Explicit unresolved boundaries

- No confirmed high-risk mobile runtime blocker from these advisory mechanisms; this is an evidence-bound conclusion, not a zero-vulnerability claim.
- Node tooling accepts repository/dependency assets/configuration. Untrusted PR/dependency builds remain potentially exploitable through PostCSS/image-size/braces; isolate CI and never provide privileged credentials to untrusted execution.
- node-forge has real signing verification consumers and no listed fix. Development certificate/signing trust conditions need separate maintenance before enabling OTA or claiming signing verification is hardened.
- Installed React DevTools bundles may embed library code independently of package-lock leaf updates. Remediation must test actual bundled caller rather than merely reduce audit count.
- No proof-of-exploit, native bundle inspection, emulator/device test or dependency upgrade validation performed. All changes deferred to dedicated security PRs to avoid unrelated localization regressions.

## All 66 package mapping

| Package | Severity | Locked versions | Underlying root groups | Explicit disposition |
|---|---|---|---|---|
| @expo/cli | high | 54.0.27 | braces, node-forge, postcss, uuid | Dedicated maintenance; exact group rationale above. |
| @expo/code-signing-certificates | high | 0.0.6 | node-forge | Dedicated maintenance; exact group rationale above. |
| @expo/config | moderate | 12.0.14 | uuid | Dedicated maintenance; exact group rationale above. |
| @expo/config-plugins | moderate | 54.0.5 | uuid | Dedicated maintenance; exact group rationale above. |
| @expo/metro | high | 54.2.0 | braces | Dedicated maintenance; exact group rationale above. |
| @expo/metro-config | high | 54.0.17 | braces, postcss, uuid | Dedicated maintenance; exact group rationale above. |
| @expo/prebuild-config | moderate | 54.0.9 | uuid | Dedicated maintenance; exact group rationale above. |
| @istanbuljs/load-nyc-config | moderate | 1.1.0 | sprintf-js | Dedicated maintenance; exact group rationale above. |
| @jest/console | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| @jest/core | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| @jest/environment | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| @jest/expect | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| @jest/fake-timers | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| @jest/globals | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| @jest/reporters | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| @jest/test-result | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| @jest/test-sequencer | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| @jest/transform | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| @maplibre/maplibre-react-native | high | 11.5.0 | braces, node-forge, postcss, uuid | Dedicated maintenance; exact group rationale above. |
| @react-native/community-cli-plugin | high | 0.81.5 | braces | Dedicated maintenance; exact group rationale above. |
| @types/jest | high | 29.5.14 | braces | Dedicated maintenance; exact group rationale above. |
| argparse | moderate | 1.0.10, 2.0.1 | sprintf-js | Dedicated maintenance; exact group rationale above. |
| babel-jest | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| babel-plugin-istanbul | moderate | 6.1.1 | sprintf-js | Dedicated maintenance; exact group rationale above. |
| braces | high | 3.0.3 | braces | Dedicated maintenance; exact group rationale above. |
| create-jest | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| expect | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| expo | high | 54.0.37 | braces, node-forge, postcss, uuid | Dedicated maintenance; exact group rationale above. |
| expo-asset | moderate | 12.0.13 | uuid | Dedicated maintenance; exact group rationale above. |
| expo-constants | moderate | 18.0.14 | uuid | Dedicated maintenance; exact group rationale above. |
| expo-manifests | moderate | 1.0.11 | uuid | Dedicated maintenance; exact group rationale above. |
| expo-updates | high | 29.0.20 | node-forge, uuid | Dedicated maintenance; exact group rationale above. |
| find-yarn-workspace-root | high | 2.0.0 | braces | Dedicated maintenance; exact group rationale above. |
| image-size | high | 1.2.1 | image-size | Dedicated maintenance; exact group rationale above. |
| jest | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-circus | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-cli | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-config | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-environment-jsdom | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| jest-environment-node | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| jest-expo | high | 54.0.18 | braces, sprintf-js, uuid | Dedicated maintenance; exact group rationale above. |
| jest-haste-map | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| jest-message-util | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| jest-resolve | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| jest-resolve-dependencies | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-runner | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-runtime | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-snapshot | high | 29.7.0 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-watch-typeahead | high | 2.2.1 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| jest-watcher | high | 29.7.0 | braces | Dedicated maintenance; exact group rationale above. |
| js-yaml | moderate | 3.15.2, 4.3.2 | sprintf-js | Dedicated maintenance; exact group rationale above. |
| metro | high | 0.83.3 | braces | Dedicated maintenance; exact group rationale above. |
| metro-config | high | 0.83.3 | braces | Dedicated maintenance; exact group rationale above. |
| metro-file-map | high | 0.83.3 | braces | Dedicated maintenance; exact group rationale above. |
| metro-transform-worker | high | 0.83.3 | braces | Dedicated maintenance; exact group rationale above. |
| micromatch | high | 4.0.8 | braces | Dedicated maintenance; exact group rationale above. |
| node-forge | high | 1.4.0 | node-forge | Dedicated maintenance; exact group rationale above. |
| patch-package | high | 8.0.1 | braces | Dedicated maintenance; exact group rationale above. |
| postcss | high | 8.4.49 | postcss | Dedicated maintenance; exact group rationale above. |
| react-native | high | 0.81.5 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| react-native-reanimated | high | 4.1.7 | braces, sprintf-js | Dedicated maintenance; exact group rationale above. |
| shell-quote | critical | 1.10.0 | shell-quote | Dedicated maintenance; exact group rationale above. |
| source-map-js | high | 1.2.1 | source-map-js | Dedicated maintenance; exact group rationale above. |
| sprintf-js | moderate | 1.0.3 | sprintf-js | Dedicated maintenance; exact group rationale above. |
| uuid | moderate | 7.0.3 | uuid | Dedicated maintenance; exact group rationale above. |
| xcode | moderate | 3.0.1 | uuid | Dedicated maintenance; exact group rationale above. |
