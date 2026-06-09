package org.complexdatacollective.networkcanvas.interviewer;

import android.app.Application;
import android.content.SharedPreferences;

import com.posthog.android.PostHogAndroid;
import com.posthog.android.PostHogAndroidConfig;

/**
 * Initialises the PostHog Android SDK for native crash/error tracking.
 *
 * <p>The renderer (WebView) cannot call the native SDK directly, so it mirrors
 * the user's analytics preference into Capacitor Preferences. On Android,
 * Capacitor Preferences persists values in the {@code CapacitorStorage}
 * SharedPreferences file, which we read here — before any web code runs — so
 * the native SDK honours the same opt-out choice as the JS layer.
 *
 * <p>Because we read the flag at launch, toggling analytics in Settings takes
 * effect for native error capture on the next app start. No participant data is
 * ever captured: screen views, autocapture, and session replay are all
 * disabled, leaving only crash/error reports keyed to the anonymous
 * installation id.
 *
 * @see <a href="https://posthog.com/docs/error-tracking/installation/android">PostHog Android error tracking</a>
 */
public class AnalyticsApplication extends Application {
    private static final String POSTHOG_API_KEY =
            "phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c";
    private static final String POSTHOG_HOST = "https://ph-relay.networkcanvas.com";

    @Override
    public void onCreate() {
        super.onCreate();

        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        // Default to enabled (matches StoredSettings.analyticsEnabled) until the
        // renderer has written a value.
        boolean analyticsEnabled = !"false".equals(prefs.getString("analytics_enabled", "true"));

        PostHogAndroidConfig config = new PostHogAndroidConfig(POSTHOG_API_KEY, POSTHOG_HOST);
        config.setCaptureScreenViews(false);
        config.setCaptureDeepLinks(false);
        config.setSessionReplay(false);
        config.setOptOut(!analyticsEnabled);

        PostHogAndroid.Companion.setup(this, config);
    }
}
