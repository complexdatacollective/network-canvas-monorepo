/**
 * Shared protocol types for cursor-field client/server communication.
 * This file defines the API contract between the client package and PartyKit server.
 */

/**
 * Unique identifier for a cursor session.
 * Format: UUID v4
 */
export type CursorId = string;

/**
 * ISO 3166-1 alpha-2 country code (uppercase).
 * Example: "GB", "US", "ZA"
 * "XX" is used when geolocation fails or is unavailable.
 */
export type CountryCode = string;

/**
 * Complete cursor state as stored and transmitted.
 */
export type Cursor = {
	/** Unique session identifier */
	id: CursorId;

	/** Normalised X position (0-1) */
	x: number;

	/** Normalised Y position (0-1) */
	y: number;

	/** ISO country code for flag display */
	countryCode: CountryCode;

	/** Unix timestamp (ms) of last position update */
	lastUpdate: number;

	/** Optional display name for identity integration */
	displayName?: string;

	/** Optional custom colour override */
	colour?: string;
};

/**
 * Messages sent from client to server.
 */
export type ClientMessage = ClientMoveMessage | ClientJoinMessage | ClientPingMessage;

export type ClientMoveMessage = {
	type: "move";
	x: number;
	y: number;
	timestamp: number;
};

export type ClientJoinMessage = {
	type: "join";
	sessionId: CursorId;
	displayName?: string;
	/** Client-detected country code from browser locale (optional, server uses IP as fallback) */
	countryCode?: CountryCode;
};

export type ClientPingMessage = {
	type: "ping";
	timestamp: number;
};

/**
 * Messages sent from server to client.
 */
export type ServerMessage =
	| ServerSyncMessage
	| ServerUpdateMessage
	| ServerLeaveMessage
	| ServerWelcomeMessage
	| ServerPongMessage;

export type ServerWelcomeMessage = {
	type: "welcome";
	/** Assigned cursor ID (may differ from requested sessionId) */
	cursorId: CursorId;
	/** Detected country code */
	countryCode: CountryCode;
	/** Current server timestamp for clock sync */
	serverTime: number;
};

export type ServerSyncMessage = {
	type: "sync";
	/** Full state of all cursors in room */
	cursors: Cursor[];
};

export type ServerUpdateMessage = {
	type: "update";
	/** Single cursor update */
	cursor: Cursor;
};

export type ServerLeaveMessage = {
	type: "leave";
	/** ID of cursor that left */
	cursorId: CursorId;
};

export type ServerPongMessage = {
	type: "pong";
	/** Echoed client timestamp */
	clientTime: number;
	/** Server timestamp */
	serverTime: number;
};
