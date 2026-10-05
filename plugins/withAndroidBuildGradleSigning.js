/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * `expo prebuild --clean` fully regenerates `android/app/build.gradle` from Expo's default
 * template, discarding all hand-written logic in that file — Expo has no built-in mechanism for
 * build.gradle content, so anything hand-edited there is silently wiped on every `--clean`
 * prebuild. This plugin restores it after prebuild by patching the freshly-generated file.
 *
 * Two things are restored, all previously hand-written directly in build.gradle:
 *   1. Release-signing resolution (android/keystore.properties -> ANDROID_RELEASE_* env vars)
 *      feeding a conditional `signingConfigs.release` block and the release buildType's
 *      signingConfig selection.
 *   2. A hard-fail gate (gradle.taskGraph.whenReady) that refuses to run assembleRelease /
 *      bundleRelease without a configured production keystore, unless explicitly overridden
 *      with -PallowInsecureReleaseSigning=true / ALLOW_INSECURE_RELEASE_SIGNING=true.
 *
 * See docs/RELEASE_SECURITY_PRIVACY.md for why this exists.
 *
 * Implementation notes:
 *   - Uses `withAppBuildGradle`, the config-plugins mod that hands back build.gradle's raw
 *     text (`config.modResults.contents`) for string patching.
 *   - Anchors on stable, boilerplate lines Expo's default template always emits (verified by
 *     running `expo prebuild --clean` against a disposable worktree and diffing the output):
 *     `apply plugin: "com.facebook.react"`, the stock debug signingConfig
 *     block, and `buildTypes {`. These are RN/Expo template scaffolding, not project-specific
 *     content, so they're expected to remain stable across ordinary dependency bumps.
 *   - Idempotent: the injected block is wrapped in a marker comment; if the marker is already
 *     present the whole patch is skipped. This matters because a non-`--clean` `expo prebuild`
 *     re-runs mods against the *existing* (already-patched) file rather than a fresh template,
 *     so re-patching unconditionally would double-insert declarations and fail to compile.
 *   - Deliberately does NOT reuse Expo's own local variable names (`projectRoot`, etc.) for the
 *     injected variables, so insertion doesn't depend on — or collide with — however Expo's
 *     template happens to name things upstream.
 */

const MARKER_START = '// >>> karachi-ijtema release signing (auto-injected by plugins/withAndroidBuildGradleSigning.js — do not hand-edit; edit that file instead) >>>';
const MARKER_END = '// <<< karachi-ijtema release signing <<<';

const APPLY_REACT_PLUGIN_ANCHOR = 'apply plugin: "com.facebook.react"';

const INJECTED_TOP_BLOCK = `
${MARKER_START}
/**
 * Production (release) signing configuration.
 *
 * Credentials are never hardcoded here. They are resolved, in order, from:
 *   1. android/keystore.properties (gitignored — copy from keystore.properties.example)
 *   2. ANDROID_RELEASE_STORE_FILE / ANDROID_RELEASE_STORE_PASSWORD /
 *      ANDROID_RELEASE_KEY_ALIAS / ANDROID_RELEASE_KEY_PASSWORD environment variables
 *
 * See docs/RELEASE_SECURITY_PRIVACY.md for the \`keytool\` command used to generate the keystore
 * itself and where to place it. Until a developer configures one of the above, \`release\`
 * build types fall back to the debug signingConfig so \`./gradlew assembleRelease\` keeps
 * working out of the box for local/dev builds.
 */
def karachiIjtemaKeystorePropertiesFile = rootProject.file("keystore.properties")
def karachiIjtemaKeystoreProperties = new Properties()
if (karachiIjtemaKeystorePropertiesFile.exists()) {
    karachiIjtemaKeystoreProperties.load(new FileInputStream(karachiIjtemaKeystorePropertiesFile))
}

def karachiIjtemaResolveReleaseSigningValue = { String propertyKey, String envKey ->
    def fromProperties = karachiIjtemaKeystoreProperties.getProperty(propertyKey)
    if (fromProperties) return fromProperties
    return System.getenv(envKey)
}

def karachiIjtemaReleaseStoreFilePath = karachiIjtemaResolveReleaseSigningValue("storeFile", "ANDROID_RELEASE_STORE_FILE")
def karachiIjtemaReleaseStorePassword = karachiIjtemaResolveReleaseSigningValue("storePassword", "ANDROID_RELEASE_STORE_PASSWORD")
def karachiIjtemaReleaseKeyAlias = karachiIjtemaResolveReleaseSigningValue("keyAlias", "ANDROID_RELEASE_KEY_ALIAS")
def karachiIjtemaReleaseKeyPassword = karachiIjtemaResolveReleaseSigningValue("keyPassword", "ANDROID_RELEASE_KEY_PASSWORD")

def karachiIjtemaHasReleaseSigningConfig = (karachiIjtemaReleaseStoreFilePath && karachiIjtemaReleaseStorePassword && karachiIjtemaReleaseKeyAlias && karachiIjtemaReleaseKeyPassword) as boolean

if (!karachiIjtemaHasReleaseSigningConfig) {
    println "WARNING: No production keystore configured (android/keystore.properties or ANDROID_RELEASE_* env vars)." +
        " Release builds will be signed with the debug keystore until this is set up — see docs/RELEASE_SECURITY_PRIVACY.md."
}

/**
 * Fail-safe: hard-stop actual release-artifact builds (assembleRelease / bundleRelease and any
 * install/CI task that depends on them) when no production keystore is configured, instead of
 * silently shipping a debug-signed artifact.
 *
 * This only gates tasks that produce/install the final \`release\` variant output for this module
 * (":app"). It intentionally does NOT gate verification-only tasks that happen to have "Release"
 * in their name (e.g. lintRelease, testReleaseUnitTest, compileReleaseSources) — those are safe
 * to run without a keystore and are part of normal CI/dev workflows.
 *
 * Escape hatch for an intentional debug-signed release-shaped artifact (local testing only):
 *   ./gradlew assembleRelease -PallowInsecureReleaseSigning=true
 *   ALLOW_INSECURE_RELEASE_SIGNING=true ./gradlew assembleRelease
 *
 * See docs/RELEASE_SECURITY_PRIVACY.md.
 */
def karachiIjtemaReleaseArtifactTaskNamePattern = ~/^(assemble|bundle)[A-Za-z0-9]*Release$/

def karachiIjtemaAllowInsecureReleaseSigning = (
    findProperty("allowInsecureReleaseSigning") ?: System.getenv("ALLOW_INSECURE_RELEASE_SIGNING") ?: "false"
).toString().toBoolean()

gradle.taskGraph.whenReady { taskGraph ->
    def karachiIjtemaMatchedReleaseArtifactTasks = taskGraph.allTasks.findAll { task ->
        task.project == project && (task.name ==~ karachiIjtemaReleaseArtifactTaskNamePattern)
    }

    if (karachiIjtemaMatchedReleaseArtifactTasks && !karachiIjtemaHasReleaseSigningConfig) {
        def karachiIjtemaMatchedTaskPaths = karachiIjtemaMatchedReleaseArtifactTasks*.path.join(", ")

        if (karachiIjtemaAllowInsecureReleaseSigning) {
            println "WARNING: Building release-artifact task(s) [$karachiIjtemaMatchedTaskPaths] WITHOUT a configured production" +
                " keystore. The output will be signed with the DEBUG keystore (publicly-known credentials:" +
                " storePassword/keyPassword 'android', keyAlias 'androiddebugkey')." +
                " This artifact MUST NOT be distributed to users, testers, or the Play Store." +
                " (-PallowInsecureReleaseSigning=true / ALLOW_INSECURE_RELEASE_SIGNING=true was set.)"
        } else {
            throw new GradleException(
                "Refusing to run release-artifact task(s) [$karachiIjtemaMatchedTaskPaths]: no production keystore is configured" +
                " (android/keystore.properties or ANDROID_RELEASE_* env vars are missing/incomplete)." +
                " Building now would silently sign the release artifact with the public debug keystore.\\n" +
                "Fix: configure a real release keystore — see docs/RELEASE_SECURITY_PRIVACY.md.\\n" +
                "Intentional debug-signed release-shaped build for local testing only: re-run with" +
                " -PallowInsecureReleaseSigning=true (or ALLOW_INSECURE_RELEASE_SIGNING=true)."
            )
        }
    }
}
${MARKER_END}
`;

// The stock debug signingConfig block Expo's default build.gradle template emits. Used both as
// an anchor (to find where to inject the conditional release signingConfig) and, implicitly, as
// a canary — if this text isn't found, the template shape changed and we fail loudly rather than
// silently skip the release-signing patch.
const SIGNING_CONFIGS_DEBUG_BLOCK = `debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const SIGNING_CONFIGS_RELEASE_INJECTION = `
        if (karachiIjtemaHasReleaseSigningConfig) {
            release {
                storeFile file(karachiIjtemaReleaseStoreFilePath)
                storePassword karachiIjtemaReleaseStorePassword
                keyAlias karachiIjtemaReleaseKeyAlias
                keyPassword karachiIjtemaReleaseKeyPassword
            }
        }`;

const BUILD_TYPES_ANCHOR = 'buildTypes {';
const STOCK_SIGNING_CONFIG_DEBUG_LINE = 'signingConfig signingConfigs.debug';
const RELEASE_SIGNING_CONFIG_LINE =
  'signingConfig karachiIjtemaHasReleaseSigningConfig ? signingConfigs.release : signingConfigs.debug';

function assertFound(condition, description) {
  if (!condition) {
    throw new Error(
      `withAndroidBuildGradleSigning: expected to find ${description} in android/app/build.gradle, but it was not found. ` +
        'Expo\'s default build.gradle template may have changed shape — update plugins/withAndroidBuildGradleSigning.js anchors.'
    );
  }
}

function patchAndroidBuildGradle(contents) {
  if (contents.includes(MARKER_START)) {
    // Already patched (e.g. a non-`--clean` prebuild re-running mods over an already-patched
    // file) — re-inserting would double-declare every `def` above and fail to compile.
    return contents;
  }

  // 1. Inject release-signing resolution + the hard-fail gate near the top of the
  // file, right after the React Native/Facebook plugin is applied.
  const reactPluginIndex = contents.indexOf(APPLY_REACT_PLUGIN_ANCHOR);
  assertFound(reactPluginIndex !== -1, `the anchor line \`${APPLY_REACT_PLUGIN_ANCHOR}\``);
  const afterReactPluginLineIndex = contents.indexOf('\n', reactPluginIndex) + 1;
  contents =
    contents.slice(0, afterReactPluginLineIndex) +
    INJECTED_TOP_BLOCK +
    contents.slice(afterReactPluginLineIndex);

  // 2. Add the conditional signingConfigs.release block right after the stock debug block,
  // still inside signingConfigs { ... }.
  const debugSigningBlockIndex = contents.indexOf(SIGNING_CONFIGS_DEBUG_BLOCK);
  assertFound(debugSigningBlockIndex !== -1, 'the stock `signingConfigs { debug { ... } }` block');
  const afterDebugSigningBlockIndex = debugSigningBlockIndex + SIGNING_CONFIGS_DEBUG_BLOCK.length;
  contents =
    contents.slice(0, afterDebugSigningBlockIndex) +
    SIGNING_CONFIGS_RELEASE_INJECTION +
    contents.slice(afterDebugSigningBlockIndex);

  // 3. Point buildTypes.release at the real signingConfig when available. `buildTypes {` is
  // unique in the file; within it, "signingConfig signingConfigs.debug" appears twice (debug
  // buildType, then release buildType) — we want the second occurrence.
  const buildTypesIndex = contents.indexOf(BUILD_TYPES_ANCHOR);
  assertFound(buildTypesIndex !== -1, `the anchor \`${BUILD_TYPES_ANCHOR}\` block`);
  const firstOccurrence = contents.indexOf(STOCK_SIGNING_CONFIG_DEBUG_LINE, buildTypesIndex);
  assertFound(firstOccurrence !== -1, '`signingConfig signingConfigs.debug` inside buildTypes.debug');
  const secondOccurrence = contents.indexOf(
    STOCK_SIGNING_CONFIG_DEBUG_LINE,
    firstOccurrence + STOCK_SIGNING_CONFIG_DEBUG_LINE.length
  );
  assertFound(secondOccurrence !== -1, '`signingConfig signingConfigs.debug` inside buildTypes.release');
  contents =
    contents.slice(0, secondOccurrence) +
    RELEASE_SIGNING_CONFIG_LINE +
    contents.slice(secondOccurrence + STOCK_SIGNING_CONFIG_DEBUG_LINE.length);

  return contents;
}

function withAndroidBuildGradleSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'withAndroidBuildGradleSigning: expected android/app/build.gradle to be Groovy, got ' +
          config.modResults.language
      );
    }
    config.modResults.contents = patchAndroidBuildGradle(config.modResults.contents);
    return config;
  });
}

module.exports = withAndroidBuildGradleSigning;
module.exports.patchAndroidBuildGradle = patchAndroidBuildGradle;
module.exports.MARKER_START = MARKER_START;
module.exports.MARKER_END = MARKER_END;
