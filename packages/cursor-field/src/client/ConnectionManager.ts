import type { CursorFieldConfig } from "../config";
import type { ClientMessage, ConnectionState, ServerMessage } from "../types";

export type ConnectionManagerEvents = {
	onMessage: (message: ServerMessage) => void;
	onStateChange: (state: ConnectionState) => void;
	onError: (error: Error) => void;
};

type ConnectionConfig = {
	partyHost: string;
	room: string;
	autoReconnect: boolean;
	maxReconnectAttempts: number;
	reconnectBaseDelay: number;
};

export class ConnectionManager {
	private ws: WebSocket | null = null;
	private reconnectAttempts = 0;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private state: ConnectionState = "disconnected";
	private config: ConnectionConfig;
	private events: ConnectionManagerEvents;

	constructor(config: CursorFieldConfig, events: ConnectionManagerEvents) {
		this.events = events;
		this.config = {
			partyHost: config.partyHost,
			room: config.room ?? "home",
			autoReconnect: config.autoReconnect ?? true,
			maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
			reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
		};
	}

	connect(): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			return;
		}

		this.setState("connecting");

		const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
		const url = `${protocol}//${this.config.partyHost}/party/${this.config.room}`;

		try {
			this.ws = new WebSocket(url);
			this.setupEventHandlers();
		} catch (error) {
			this.events.onError(error as Error);
			this.handleDisconnect();
		}
	}

	disconnect(): void {
		this.config.autoReconnect = false;
		this.clearReconnectTimeout();

		if (this.ws) {
			this.ws.close(1000, "Client disconnect");
			this.ws = null;
		}

		this.setState("disconnected");
	}

	send(message: ClientMessage): void {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			return;
		}

		try {
			this.ws.send(JSON.stringify(message));
		} catch (error) {
			this.events.onError(error as Error);
		}
	}

	getState(): ConnectionState {
		return this.state;
	}

	private setupEventHandlers(): void {
		if (!this.ws) return;

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.setState("connected");
		};

		this.ws.onclose = (event) => {
			if (event.code !== 1000) {
				this.handleDisconnect();
			} else {
				this.setState("disconnected");
			}
		};

		this.ws.onerror = () => {
			this.events.onError(new Error("WebSocket error"));
		};

		this.ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data as string) as ServerMessage;
				this.events.onMessage(message);
			} catch {
				// Invalid message format, silently ignore
			}
		};
	}

	private handleDisconnect(): void {
		this.ws = null;

		if (!this.config.autoReconnect) {
			this.setState("disconnected");
			return;
		}

		if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
			this.setState("disconnected");
			this.events.onError(new Error("Max reconnection attempts exceeded"));
			return;
		}

		this.setState("reconnecting");

		const delay = this.config.reconnectBaseDelay * 2 ** this.reconnectAttempts;

		this.reconnectTimeout = setTimeout(() => {
			this.reconnectAttempts++;
			this.connect();
		}, delay);
	}

	private setState(state: ConnectionState): void {
		if (this.state !== state) {
			this.state = state;
			this.events.onStateChange(state);
		}
	}

	private clearReconnectTimeout(): void {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
	}
}
