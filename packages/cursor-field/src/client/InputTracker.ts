import type { CursorFieldConfig } from "../config";
import type { NormalisedPosition } from "../types";

export type PositionCallback = (position: NormalisedPosition) => void;

export class InputTracker {
	private lastPosition: NormalisedPosition | null = null;
	private throttleTimeout: ReturnType<typeof setTimeout> | null = null;
	private updateInterval: number;
	private disabled: boolean;
	private isTracking = false;
	private callback: PositionCallback;

	constructor(callback: PositionCallback, config: CursorFieldConfig) {
		this.callback = callback;
		this.updateInterval = config.updateInterval ?? 50;
		this.disabled = config.disableInput ?? false;
	}

	start(): void {
		if (this.disabled || this.isTracking) return;

		this.isTracking = true;
		window.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseleave", this.handleMouseLeave);
		document.addEventListener("mouseout", this.handleMouseOut);
	}

	stop(): void {
		this.isTracking = false;
		window.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseleave", this.handleMouseLeave);
		document.removeEventListener("mouseout", this.handleMouseOut);
		this.clearThrottle();
	}

	getLastPosition(): NormalisedPosition | null {
		return this.lastPosition;
	}

	private handleMouseMove = (event: MouseEvent): void => {
		const x = event.clientX / window.innerWidth;
		const y = event.clientY / window.innerHeight;

		// Check if mouse is within viewport bounds
		if (x < 0 || x > 1 || y < 0 || y > 1) {
			this.lastPosition = null;
			return;
		}

		const position: NormalisedPosition = { x, y };
		this.lastPosition = position;

		if (!this.throttleTimeout) {
			this.callback(position);

			this.throttleTimeout = setTimeout(() => {
				this.throttleTimeout = null;

				if (this.lastPosition) {
					this.callback(this.lastPosition);
				}
			}, this.updateInterval);
		}
	};

	private handleMouseLeave = (): void => {
		this.lastPosition = null;
	};

	private handleMouseOut = (event: MouseEvent): void => {
		// Check if mouse is leaving the document entirely (not just moving between elements)
		if (event.relatedTarget === null) {
			this.lastPosition = null;
		}
	};

	private clearThrottle(): void {
		if (this.throttleTimeout) {
			clearTimeout(this.throttleTimeout);
			this.throttleTimeout = null;
		}
	}
}
