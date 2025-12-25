import type { CursorFieldConfig } from "../config";
import { CursorFieldCore } from "../core";
import type { ConnectionState } from "../types";

export type CursorFieldInstance = {
	/**
	 * Start the cursor field.
	 */
	start(): void;

	/**
	 * Stop and disconnect.
	 */
	stop(): void;

	/**
	 * Fully destroy and remove from DOM.
	 */
	destroy(): void;

	/**
	 * Get current connection state.
	 */
	getConnectionState(): ConnectionState;

	/**
	 * Get current cursor count.
	 */
	getCursorCount(): number;

	/**
	 * Update configuration at runtime.
	 */
	updateConfig(config: Partial<CursorFieldConfig>): void;
};

function isTouchOnlyDevice(): boolean {
	return "ontouchstart" in window && !window.matchMedia("(pointer: fine)").matches;
}

/**
 * Mount CursorField to the DOM.
 *
 * @example
 * ```js
 * const cf = CursorField.mount({
 *   partyHost: 'cursors.example.partykit.dev',
 *   room: 'homepage',
 * });
 *
 * // Later...
 * cf.destroy();
 * ```
 */
export function mount(config: CursorFieldConfig): CursorFieldInstance {
	if (isTouchOnlyDevice()) {
		return {
			start: () => {},
			stop: () => {},
			destroy: () => {},
			getConnectionState: () => "disconnected",
			getCursorCount: () => 0,
			updateConfig: () => {},
		};
	}

	const container = document.createElement("div");
	container.id = "cursorfield-container";
	container.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: ${config.zIndex ?? 9999};
	`;
	document.body.appendChild(container);

	const core = new CursorFieldCore(container, config);
	void core.start();

	return {
		start: () => void core.start(),
		stop: () => core.stop(),
		destroy: () => {
			core.destroy();
			container.remove();
		},
		getConnectionState: () => core.getConnectionState(),
		getCursorCount: () => core.getCursorCount(),
		updateConfig: (newConfig) => core.updateConfig(newConfig),
	};
}

if (typeof window !== "undefined") {
	(window as unknown as { CursorField: { mount: typeof mount } }).CursorField = { mount };
}
