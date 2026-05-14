// Runtime environment detection. We use feature checks rather than build-time
// constants so a single `dist/` bundle can be shipped to web, Electron, and
// Capacitor without rebuilding.

import { Capacitor } from "@capacitor/core";

/** @public */
export type Platform = "web" | "desktop" | "tablet";

export function detectPlatform(): Platform {
	if (typeof window === "undefined") return "web";
	if (window.modernInterviewerNative) return "desktop";
	try {
		if (Capacitor.isNativePlatform()) return "tablet";
	} catch {
		// Capacitor not initialised — fall through.
	}
	return "web";
}

export const PLATFORM = detectPlatform();

export const APP_NAME = "Network Canvas Interviewer";
export const APP_VERSION = (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0") as string;

declare const __APP_VERSION__: string;
