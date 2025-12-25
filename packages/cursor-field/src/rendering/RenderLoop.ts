export type RenderCallback = (timestamp: number, deltaTime: number) => void;

export class RenderLoop {
	private animationFrameId: number | null = null;
	private lastFrameTime = 0;
	private isRunning = false;
	private callback: RenderCallback;

	constructor(callback: RenderCallback) {
		this.callback = callback;
	}

	start(): void {
		if (this.isRunning) return;

		this.isRunning = true;
		this.lastFrameTime = performance.now();
		this.tick();
	}

	stop(): void {
		this.isRunning = false;

		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	private tick = (): void => {
		if (!this.isRunning) return;

		const now = performance.now();
		const deltaTime = now - this.lastFrameTime;
		this.lastFrameTime = now;

		this.callback(now, deltaTime);

		this.animationFrameId = requestAnimationFrame(this.tick);
	};
}
