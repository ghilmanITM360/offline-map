// SPDX-License-Identifier: Apache-2.0
import CoreLocation
import ExpoModulesCore

// Capability reader only: it never requests permission and never starts location updates, and it returns no coordinates.
public class SdkLocationPrecisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SdkLocationPrecision")

    // 'full' or 'reduced' only while foreground location is authorized; 'none' otherwise, so precision is never assumed.
    AsyncFunction("getAccuracyAuthorization") { () -> String in
      let manager = CLLocationManager()
      switch manager.authorizationStatus {
      case .authorizedWhenInUse, .authorizedAlways:
        return manager.accuracyAuthorization == .fullAccuracy ? "full" : "reduced"
      default:
        return "none"
      }
    }.runOnQueue(.main)
  }
}
