import type { CountryCode } from "../types";

/**
 * Detects the user's country code from browser locale settings.
 * Falls back to "XX" if detection fails.
 */
export function detectCountryFromLocale(): CountryCode {
	try {
		// Try navigator.language first (e.g., "en-US", "en-GB", "fr-FR")
		const locale = navigator.language;
		const countryCode = extractCountryCode(locale);
		if (countryCode) return countryCode;

		// Try navigator.languages array for more options
		if (navigator.languages?.length) {
			for (const lang of navigator.languages) {
				const code = extractCountryCode(lang);
				if (code) return code;
			}
		}

		// Fallback: unknown
		return "XX";
	} catch {
		return "XX";
	}
}

/**
 * Extracts country code from a locale string.
 * Handles formats like "en-US", "en_GB", "fr-FR", "zh-Hans-CN"
 */
function extractCountryCode(locale: string): CountryCode | null {
	if (!locale) return null;

	// Split by hyphen or underscore
	const parts = locale.split(/[-_]/);

	// Look for a 2-letter uppercase country code
	for (const part of parts) {
		// Country codes are 2 uppercase letters
		if (part.length === 2 && /^[A-Z]{2}$/.test(part.toUpperCase())) {
			const upper = part.toUpperCase();
			// Skip language codes that look like country codes (e.g., "en", "fr")
			// Check if it's after the first part (first part is usually language)
			if (parts.indexOf(part) > 0) {
				return upper;
			}
		}
	}

	// Check last part specifically for formats like "zh-Hans-CN"
	const lastPart = parts[parts.length - 1];
	if (lastPart && lastPart.length === 2) {
		return lastPart.toUpperCase();
	}

	return null;
}
