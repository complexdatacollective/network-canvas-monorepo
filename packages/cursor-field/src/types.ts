/**
 * Re-export shared protocol types (API contract with server).
 */
export type {
	ClientJoinMessage,
	ClientMessage,
	ClientMoveMessage,
	ClientPingMessage,
	CountryCode,
	Cursor,
	CursorId,
	ServerLeaveMessage,
	ServerMessage,
	ServerPongMessage,
	ServerSyncMessage,
	ServerUpdateMessage,
	ServerWelcomeMessage,
} from "./shared/protocol";

import type { Cursor, CursorId } from "./shared/protocol";

/**
 * Room identifier for cursor isolation.
 * Alphanumeric with hyphens and underscores, max 64 characters.
 */
export type RoomId = string;

/**
 * Normalised position coordinates.
 * Values are in range [0, 1] representing percentage of viewport.
 * Origin (0, 0) is top-left.
 */
export type NormalisedPosition = {
	x: number;
	y: number;
};

/**
 * Cursor state with interpolation data for smooth rendering.
 */
export type InterpolatedCursor = Cursor & {
	/** Target X position (latest from server) */
	targetX: number;
	targetY: number;

	/** Calculated render position after smoothing */
	renderX: number;
	renderY: number;

	/** Velocity for momentum-based smoothing */
	velocityX: number;
	velocityY: number;
};

/**
 * Identity token for session persistence.
 */
export type SessionIdentity = {
	/** Persistent session ID (stored in localStorage) */
	sessionId: CursorId;

	/** Optional external identity provider reference */
	externalId?: string;

	/** Identity provider type */
	provider?: "anonymous" | "custom";

	/** User-provided or provider-supplied display name */
	displayName?: string;
};

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export type CursorFieldError = {
	code: string;
	message: string;
	recoverable: boolean;
};
