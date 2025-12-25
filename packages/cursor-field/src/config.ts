import type { ConnectionState, CursorFieldError, RoomId } from "./types";

export type CursorFieldConfig = {
	// === Connection ===

	/**
	 * PartyKit server host.
	 * Example: "cursors.yoursite.partykit.dev"
	 */
	partyHost: string;

	/**
	 * Room identifier for cursor isolation.
	 * @default "home"
	 */
	room?: RoomId;

	/**
	 * Automatic reconnection on disconnect.
	 * @default true
	 */
	autoReconnect?: boolean;

	/**
	 * Maximum reconnection attempts before giving up.
	 * @default 5
	 */
	maxReconnectAttempts?: number;

	/**
	 * Base delay between reconnection attempts (ms).
	 * Uses exponential backoff: delay * 2^attempt
	 * @default 1000
	 */
	reconnectBaseDelay?: number;

	// === Input ===

	/**
	 * Throttle interval for position updates (ms).
	 * Lower values = smoother but more bandwidth.
	 * @default 50 (20 updates/second)
	 */
	updateInterval?: number;

	/**
	 * Ignore cursor input entirely (useful for debugging).
	 * @default false
	 */
	disableInput?: boolean;

	// === Rendering ===

	/**
	 * Enable/disable the canvas overlay.
	 * When false, only cursor elements are rendered (no lines).
	 * @default true
	 */
	enableCanvas?: boolean;

	/**
	 * Distance threshold for line rendering (0-1 normalised).
	 * Lines appear between cursors closer than this distance.
	 * @default 0.2 (20% of viewport diagonal)
	 */
	lineThreshold?: number;

	/**
	 * Line stroke width in pixels.
	 * @default 1
	 */
	lineWidth?: number;

	/**
	 * Line colour (CSS colour string).
	 * @default "rgba(255, 255, 255, 0.8)"
	 */
	lineColour?: string;

	/**
	 * Maximum line opacity (0-1).
	 * Actual opacity scales from 0 at threshold to this value at distance 0.
	 * @default 0.6
	 */
	lineMaxOpacity?: number;

	/**
	 * Cursor size in pixels.
	 * @default 32
	 */
	cursorSize?: number;

	/**
	 * Show own cursor in the visualisation.
	 * @default false
	 */
	showOwnCursor?: boolean;

	/**
	 * Z-index for the overlay container.
	 * @default 9999
	 */
	zIndex?: number;

	// === Smoothing ===

	/**
	 * Enable position smoothing for fluid movement.
	 * @default true
	 */
	enableInterpolation?: boolean;

	/**
	 * Smoothing factor (ms).
	 * Higher values = smoother but slower to reach target.
	 * Lower values = more responsive but potentially jittery.
	 * @default 120
	 */
	interpolationDuration?: number;

	// === Staleness ===

	/**
	 * Time after last update before cursor begins fading (ms).
	 * @default 2000
	 */
	staleThreshold?: number;

	/**
	 * Time after last update before cursor is removed (ms).
	 * @default 5000
	 */
	removeThreshold?: number;

	/**
	 * Fade duration when cursor becomes stale (ms).
	 * @default 1000
	 */
	staleFadeDuration?: number;

	// === Identity ===

	/**
	 * Enable session persistence via localStorage.
	 * @default true
	 */
	persistSession?: boolean;

	/**
	 * localStorage key for session data.
	 * @default "cursorfield_session"
	 */
	sessionStorageKey?: string;

	/**
	 * Custom identity provider integration.
	 * When provided, this function is called to resolve user identity.
	 */
	identityProvider?: () => Promise<{
		externalId: string;
		displayName?: string;
	} | null>;

	// === Callbacks ===

	/**
	 * Called when connection state changes.
	 */
	onConnectionChange?: (state: ConnectionState) => void;

	/**
	 * Called when cursor count changes.
	 */
	onCursorCountChange?: (count: number) => void;

	/**
	 * Called on any error.
	 */
	onError?: (error: CursorFieldError) => void;
};

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
	room: "home",
	autoReconnect: true,
	maxReconnectAttempts: 5,
	reconnectBaseDelay: 1000,
	updateInterval: 50,
	disableInput: false,
	enableCanvas: true,
	lineThreshold: 0.2,
	lineWidth: 10,
	lineColour: "rgba(255, 255, 255, 0.8)",
	lineMaxOpacity: 0.6,
	cursorSize: 32,
	showOwnCursor: false,
	zIndex: 9999,
	enableInterpolation: true,
	interpolationDuration: 12,
	staleThreshold: 2000,
	removeThreshold: 5000,
	staleFadeDuration: 1000,
	persistSession: true,
	sessionStorageKey: "cursorfield_session",
} as const satisfies Required<
	Omit<CursorFieldConfig, "partyHost" | "identityProvider" | "onConnectionChange" | "onCursorCountChange" | "onError">
>;

export type ResolvedConfig = typeof DEFAULT_CONFIG & Pick<CursorFieldConfig, "partyHost">;
