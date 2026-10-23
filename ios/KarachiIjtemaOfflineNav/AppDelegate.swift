import Expo
import React
import ReactAppDependencyProvider
#if targetEnvironment(simulator)
import MapLibre
#endif

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if targetEnvironment(simulator)
    // Explicit acceptance-only launch option. No device or ordinary-launch network policy change.
    if ProcessInfo.processInfo.environment["IJTEMA_MAP_NETWORK_DENY"] == "1" {
      let configuration = URLSessionConfiguration.ephemeral
      configuration.protocolClasses = [B7MapNetworkDenyProtocol.self]
      configuration.urlCache = nil
      configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
      MLNNetworkConfiguration.sharedManager.sessionConfiguration = configuration
      NSLog("B7 map-native HTTP isolation enabled; local file transport unchanged")
      // Same session configuration as native MapLibre: proves interception without DNS/egress.
      let session = URLSession(configuration: configuration)
      session.dataTask(with: URL(string: "https://example.invalid/b7-egress-probe")!) { _, _, error in
        let error = error as NSError?
        NSLog("B7 map-native probe error domain=%@ code=%ld", error?.domain ?? "none", error?.code ?? 0)
        session.finishTasksAndInvalidate()
      }.resume()
    }
#endif
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

#if targetEnvironment(simulator)
// B7 protocol: scoped to the explicitly configured native MapLibre session, never registered globally.
final class B7MapNetworkDenyProtocol: URLProtocol {
  override class func canInit(with request: URLRequest) -> Bool {
    guard let scheme = request.url?.scheme?.lowercased() else { return false }
    return scheme == "http" || scheme == "https"
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    // No URL/path/coordinates recorded. No forwarding session or network connection is created.
    NSLog("B7 map-native HTTP request denied")
    client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
  }

  override func stopLoading() {}
}
#endif
