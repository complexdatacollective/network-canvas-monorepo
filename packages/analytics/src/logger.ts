import type { ErrorProperties, EventProperties } from "./types";

const STYLES = {
	badge: "background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
	eventName: "color: #22c55e; font-weight: bold;",
	errorName: "color: #ef4444; font-weight: bold;",
	metadata: "color: #94a3b8;",
	label: "color: #64748b; font-weight: bold;",
	value: "color: #e2e8f0;",
};

export function logEvent(eventType: string, properties?: EventProperties): void {
	const metadata = properties?.metadata;

	console.groupCollapsed("%c📊 Analytics %c%s", STYLES.badge, STYLES.eventName, eventType);

	if (metadata && Object.keys(metadata).length > 0) {
		console.log("%cMetadata:", STYLES.label);
		for (const [key, value] of Object.entries(metadata)) {
			console.log(`  %c${key}: %c${JSON.stringify(value)}`, STYLES.metadata, STYLES.value);
		}
	}

	console.groupEnd();
}

export function logError(errorProperties: ErrorProperties): void {
	console.groupCollapsed("%c📊 Analytics %c%s", STYLES.badge, STYLES.errorName, `Error: ${errorProperties.name}`);

	console.log("%cMessage: %c%s", STYLES.label, STYLES.value, errorProperties.message);

	if (errorProperties.stack) {
		console.log("%cStack:", STYLES.label);
		console.log("%c%s", STYLES.metadata, errorProperties.stack);
	}

	if (errorProperties.metadata && Object.keys(errorProperties.metadata).length > 0) {
		console.log("%cMetadata:", STYLES.label);
		for (const [key, value] of Object.entries(errorProperties.metadata)) {
			console.log(`  %c${key}: %c${JSON.stringify(value)}`, STYLES.metadata, STYLES.value);
		}
	}

	console.groupEnd();
}

export function logDisabled(reason: string): void {
	console.log("%c📊 Analytics %c(disabled: %s)", STYLES.badge, STYLES.metadata, reason);
}

export function logInit(product: string, installationId?: string): void {
	console.groupCollapsed("%c📊 Analytics %cInitialized", STYLES.badge, STYLES.eventName);
	console.log("%cProduct: %c%s", STYLES.label, STYLES.value, product);
	if (installationId) {
		console.log("%cInstallation ID: %c%s", STYLES.label, STYLES.value, installationId);
	}
	console.groupEnd();
}
