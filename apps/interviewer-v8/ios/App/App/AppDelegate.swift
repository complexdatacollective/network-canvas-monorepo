import UIKit
import Capacitor
import PostHog

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // PostHog API key + proxy host, matching the JS layer and Android.
    private let posthogApiKey = "phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c"
    private let posthogHost = "https://ph-relay.networkcanvas.com"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        setUpAnalytics()
        return true
    }

    // Initialises the PostHog iOS SDK for native crash/error tracking.
    //
    // The renderer (WebView) cannot call the native SDK directly, so it mirrors
    // the user's analytics preference into Capacitor Preferences. On iOS,
    // Capacitor Preferences stores values in UserDefaults with the key prefixed
    // by its group, so the flag lives at "CapacitorStorage.analytics_enabled".
    // We read it here — before any web code runs — so the native SDK honours the
    // same opt-out choice as the JS layer. A toggle therefore takes effect for
    // native error capture on the next launch.
    //
    // No participant data is ever captured: screen views, app-lifecycle
    // autocapture, and session replay are all disabled, leaving only
    // crash/error reports keyed to the anonymous installation id.
    // https://posthog.com/docs/error-tracking/installation/ios
    private func setUpAnalytics() {
        // Default to enabled (matches StoredSettings.analyticsEnabled) until the
        // renderer has written a value.
        let stored = UserDefaults.standard.string(forKey: "CapacitorStorage.analytics_enabled")
        let analyticsEnabled = stored != "false"

        let config = PostHogConfig(apiKey: posthogApiKey, host: posthogHost)
        config.captureScreenViews = false
        config.captureApplicationLifecycleEvents = false
        config.sessionReplay = false
        config.optOut = !analyticsEnabled

        PostHogSDK.shared.setup(config)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
