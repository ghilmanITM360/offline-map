package com.aicrafted.karachiijtema

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(StartupReadinessPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNativeWithFontScale()
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

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
}
