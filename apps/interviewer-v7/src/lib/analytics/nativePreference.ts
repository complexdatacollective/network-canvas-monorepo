import { isCapacitor } from '../platform/platform';
import { NATIVE_ANALYTICS_PREF_KEY } from './config';

// Mirrors the analytics-enabled flag into Capacitor Preferences so the native
// iOS/Android crash + error SDKs can honour the user's choice at launch. The
// renderer (WebView) cannot call the native PostHog SDK directly, so we persist
// the preference where native code can read it:
//   - iOS:     UserDefaults, key "CapacitorStorage.analytics_enabled"
//   - Android: SharedPreferences file "CapacitorStorage", key "analytics_enabled"
// Native init reads this value (see ios/App/App/AppDelegate.swift and
// android/.../AnalyticsApplication.kt). A toggle therefore takes effect for
// native error capture on the next app launch.
export async function writeNativeAnalyticsPreference(
  enabled: boolean,
): Promise<void> {
  if (!isCapacitor) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({
      key: NATIVE_ANALYTICS_PREF_KEY,
      value: enabled ? 'true' : 'false',
    });
  } catch {
    // Best effort — a failure here only affects native crash capture, never
    // the JS-side preference, which is the source of truth.
  }
}
