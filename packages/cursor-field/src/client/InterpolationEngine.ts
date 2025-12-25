import type { CursorFieldConfig } from "../config";
import type { StateStore } from "./StateStore";

export class InterpolationEngine {
	private lastFrameTime = 0;
	private animationFrameId: number | null = null;
	private duration: number;
	private store: StateStore;

	constructor(store: StateStore, config: CursorFieldConfig) {
		this.store = store;
		this.duration = config.interpolationDuration ?? 80;
	}

	start(): void {
		if (this.animationFrameId !== null) return;

		this.lastFrameTime = performance.now();
		this.tick();
	}

	stop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	isRunning(): boolean {
		return this.animationFrameId !== null;
	}

	private tick = (): void => {
		const now = performance.now();
		const deltaTime = now - this.lastFrameTime;
		this.lastFrameTime = now;

		this.store.updateInterpolation(deltaTime, this.duration);

		this.animationFrameId = requestAnimationFrame(this.tick);
	};
}
