package com.aicrafted.karachiijtema

import android.app.Activity
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.lang.ref.WeakReference

/**
 * #130 TTFD. JS tells us once the startup destination (LocationsDirectory) is drawn and usable;
 * Android's launch metrics only exist per Activity, so the readiness is kept here and reported
 * once for the current Activity, and once more for any Activity recreated later (warm start)
 * while the app stays ready.
 */
object StartupReadiness {
  @Volatile private var ready = false
  private var reported: WeakReference<Activity>? = null

  fun markReady(activity: Activity?) {
    ready = true
    report(activity)
  }

  fun onActivityResumed(activity: Activity) {
    if (ready) report(activity)
  }

  private fun report(activity: Activity?) {
    if (activity == null) return
    synchronized(this) {
      if (reported?.get() === activity) return
      reported = WeakReference(activity)
    }
    activity.runOnUiThread { activity.reportFullyDrawn() }
  }
}

class StartupReadinessModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "StartupReadiness"

  @ReactMethod
  fun markFullyUsable() {
    StartupReadiness.markReady(context.currentActivity)
  }
}

class StartupReadinessPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(StartupReadinessModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
