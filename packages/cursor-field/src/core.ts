import { ConnectionManager } from "./client/ConnectionManager";
import { IdentityManager } from "./client/IdentityManager";
import { InputTracker } from "./client/InputTracker";
import { InterpolationEngine } from "./client/InterpolationEngine";
import { detectCountryFromLocale } from "./client/LocaleDetector";
import { StateStore } from "./client/StateStore";
import type { CursorFieldConfig } from "./config";
import { DEFAULT_CONFIG } from "./config";
import { CanvasRenderer } from "./rendering/CanvasRenderer";
import { RenderLoop } from "./rendering/RenderLoop";
import type { ConnectionState, CursorId, InterpolatedCursor, ServerMessage } from "./types";

export type CursorSubscriber = (cursors: Map<CursorId, InterpolatedCursor>) => void;
export type OwnCursorIdCallback = (id: CursorId) => void;

type MergedConfig = CursorFieldConfig & typeof DEFAULT_CONFIG;

export class CursorFieldCore {
	private readonly config: MergedConfig;
	private readonly connectionManager: ConnectionManager;
	private readonly stateStore: StateStore;
	private readonly identityManager: IdentityManager;
	private readonly inputTracker: InputTracker;
	private readonly interpolationEngine: InterpolationEngine;
	private readonly renderLoop: RenderLoop;
	private readonly renderer: CanvasRenderer;

	private ownCursorIdCallbacks: Set<OwnCursorIdCallback> = new Set();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;
	private isStarted = false;

	constructor(container: HTMLElement, config: CursorFieldConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config } as MergedConfig;

		this.stateStore = new StateStore();
		this.identityManager = new IdentityManager(this.config);

		this.connectionManager = new ConnectionManager(this.config, {
			onMessage: this.handleServerMessage,
			onStateChange: this.handleConnectionStateChange,
			onError: this.handleError,
		});

		this.inputTracker = new InputTracker(this.handlePositionUpdate, this.config);

		this.interpolationEngine = new InterpolationEngine(this.stateStore, this.config);

		this.renderer = new CanvasRenderer(container, this.config);

		this.renderLoop = new RenderLoop(this.handleRenderFrame);
	}

	async start(): Promise<void> {
		if (this.isStarted) return;
		this.isStarted = true;

		const identity = await this.identityManager.initialise();
		this.stateStore.setOwnCursorId(identity.sessionId);
		this.renderer.setOwnCursorId(identity.sessionId);

		for (const callback of this.ownCursorIdCallbacks) {
			callback(identity.sessionId);
		}

		this.connectionManager.connect();

		this.inputTracker.start();

		if (this.config.enableInterpolation) {
			this.interpolationEngine.start();
		}
		this.renderLoop.start();

		this.cleanupInterval = setInterval(() => {
			this.stateStore.cleanupStale(this.config.removeThreshold);
		}, 1000);
	}

	stop(): void {
		if (!this.isStarted) return;
		this.isStarted = false;

		this.connectionManager.disconnect();
		this.inputTracker.stop();
		this.interpolationEngine.stop();
		this.renderLoop.stop();

		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	destroy(): void {
		this.stop();
		this.renderer.destroy();
	}

	getConnectionState(): ConnectionState {
		return this.connectionManager.getState();
	}

	getCursorCount(): number {
		return this.stateStore.getCursorCount();
	}

	subscribe(callback: CursorSubscriber): () => void {
		return this.stateStore.subscribe(callback);
	}

	onOwnCursorIdChange(callback: OwnCursorIdCallback): () => void {
		this.ownCursorIdCallbacks.add(callback);
		return () => this.ownCursorIdCallbacks.delete(callback);
	}

	updateConfig(newConfig: Partial<CursorFieldConfig>): void {
		Object.assign(this.config, newConfig);
		this.renderer.updateConfig(newConfig);
	}

	private handleServerMessage = (message: ServerMessage): void => {
		switch (message.type) {
			case "welcome": {
				const identity = this.identityManager.getIdentity();
				if (identity) {
					// Detect country from browser locale (server uses IP as fallback)
					const localeCountryCode = detectCountryFromLocale();

					// Send join with our sessionId - the server will use this as our cursor ID
					this.connectionManager.send({
						type: "join",
						sessionId: identity.sessionId,
						displayName: identity.displayName,
						countryCode: localeCountryCode !== "XX" ? localeCountryCode : undefined,
					});
					// Don't update ownCursorId here - the server will switch to using
					// our sessionId after receiving the join message
				}
				break;
			}

			case "sync":
				this.stateStore.syncCursors(message.cursors);
				this.config.onCursorCountChange?.(this.stateStore.getCursorCount());
				break;

			case "update":
				this.stateStore.updateCursor(message.cursor);
				this.config.onCursorCountChange?.(this.stateStore.getCursorCount());
				break;

			case "leave":
				this.stateStore.removeCursor(message.cursorId);
				this.config.onCursorCountChange?.(this.stateStore.getCursorCount());
				break;

			case "pong":
				// Could use for latency measurement
				break;
		}
	};

	private handleConnectionStateChange = (state: ConnectionState): void => {
		this.config.onConnectionChange?.(state);
	};

	private handleError = (error: Error): void => {
		this.config.onError?.({
			code: "CONNECTION_ERROR",
			message: error.message,
			recoverable: true,
		});
	};

	private handlePositionUpdate = (position: { x: number; y: number }): void => {
		this.connectionManager.send({
			type: "move",
			x: position.x,
			y: position.y,
			timestamp: Date.now(),
		});
	};

	private handleRenderFrame = (_timestamp: number, deltaTime: number): void => {
		if (this.config.enableInterpolation) {
			// Update interpolation if not handled by InterpolationEngine
			if (!this.interpolationEngine.isRunning()) {
				this.stateStore.updateInterpolation(deltaTime, this.config.interpolationDuration);
			}
		} else {
			// No interpolation - snap to target positions immediately
			this.stateStore.skipToTargets();
		}

		// Only render if canvas is enabled
		if (this.config.enableCanvas) {
			const ownPosition = this.inputTracker.getLastPosition();
			this.renderer.render(this.stateStore.getCursors(), ownPosition);
		}
	};
}
