/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
const { withMainActivity, withMainApplication } = require('expo/config-plugins');

// RN0.81.5 contains native font-context/cache invalidation behind a disabled flag.
// Use its initializer once, with the selected stock provider and only this flag changed.
// Its Kotlin-internal API is deliberately version-pinned; no force/reset/reflection.
const APPLICATION_METHOD = `
  @Suppress("INVISIBLE_MEMBER", "INVISIBLE_REFERENCE")
  private fun loadReactNativeWithFontScale() {
    try {
      com.facebook.soloader.SoLoader.init(this, com.facebook.react.soloader.OpenSourceMergedSoMapping)
    } catch (error: java.io.IOException) {
      throw RuntimeException(error)
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      val stock: com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider = when (DefaultNewArchitectureEntryPoint.releaseLevel) {
        ReleaseLevel.EXPERIMENTAL -> com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android()
        ReleaseLevel.CANARY -> com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android()
        ReleaseLevel.STABLE -> com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android(true, true, true)
      }
      DefaultNewArchitectureEntryPoint.loadWithFeatureFlags(
        object : com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider by stock {
          override fun enableFontScaleChangesUpdatingLayout() = true
        }
      )
    }
    if (BuildConfig.IS_EDGE_TO_EDGE_ENABLED) {
      com.facebook.react.views.view.setEdgeToEdgeFeatureFlagOn()
    }
  }
`;
const ACTIVITY_METHOD = `
  private var sdkFontScale = 1f

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    val fontScaleChanged = sdkFontScale != newConfig.fontScale
    super.onConfigurationChanged(newConfig)
    sdkFontScale = newConfig.fontScale
    if (fontScaleChanged) {
      // Measure the React surface itself; measuring only decorView is insufficient.
      reactDelegate?.reactRootView?.requestLayout()
    }
  }
`;

const SUPPORTED_REACT_NATIVE = '0.81.5';
function checkVersion(version) {
  if (version !== SUPPORTED_REACT_NATIVE) throw new Error(`Android font-layout workaround requires revalidation for RN ${version}; expected ${SUPPORTED_REACT_NATIVE}`);
}
function appendMethod(contents, method) {
  if (!/}\s*$/.test(contents)) throw new Error('Unrecognized Android Kotlin class ending');
  return contents.replace(/}\s*$/, `${method}}\n`);
}
function patchApplication(contents, version) {
  checkVersion(version);
  if (contents.includes('private fun loadReactNativeWithFontScale()')) return contents;
  if ((contents.match(/loadReactNative\(this\)/g) ?? []).length !== 1 || !contents.includes('DefaultNewArchitectureEntryPoint.releaseLevel')) {
    throw new Error('Unrecognized RN0.81.5 MainApplication initializer; preserve custom initialization explicitly');
  }
  return appendMethod(contents.replace('loadReactNative(this)', 'loadReactNativeWithFontScale()')
    .replace('import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative\n', ''), APPLICATION_METHOD);
}
function patchActivity(contents, version) {
  checkVersion(version);
  if (contents.includes('private var sdkFontScale = 1f')) return contents;
  if (contents.includes('override fun onConfigurationChanged') || (contents.match(/super.onCreate\(null\)/g) ?? []).length !== 1) {
    throw new Error('Unrecognized MainActivity lifecycle; integrate font invalidation explicitly');
  }
  return appendMethod(contents.replace('super.onCreate(null)', 'super.onCreate(null)\n    sdkFontScale = resources.configuration.fontScale'), ACTIVITY_METHOD);
}
function withAndroidFontScale(config) {
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Android font-layout workaround requires Kotlin MainApplication');
    const version = require(require.resolve('react-native/package.json', { paths: [mod.modRequest.projectRoot] })).version;
    mod.modResults.contents = patchApplication(mod.modResults.contents, version);
    return mod;
  });
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Android font-layout workaround requires Kotlin MainActivity');
    const version = require(require.resolve('react-native/package.json', { paths: [mod.modRequest.projectRoot] })).version;
    mod.modResults.contents = patchActivity(mod.modResults.contents, version);
    return mod;
  });
}
module.exports = withAndroidFontScale;
module.exports.SUPPORTED_REACT_NATIVE = SUPPORTED_REACT_NATIVE;
module.exports.patchApplication = patchApplication;
module.exports.patchActivity = patchActivity;
