import type { CursorFieldConfig } from "../config";
import type { CursorId, InterpolatedCursor } from "../types";
import { FlagResolver } from "./FlagResolver";

type RendererConfig = {
	lineThreshold: number;
	lineWidth: number;
	lineColour: string;
	lineMaxOpacity: number;
	cursorSize: number;
	showOwnCursor: boolean;
	staleThreshold: number;
	staleFadeDuration: number;
};

// Mutable version of the config for runtime updates
type MutableRendererConfig = {
	-readonly [K in keyof RendererConfig]: RendererConfig[K];
};

export class CanvasRenderer {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private config: MutableRendererConfig;
	private ownCursorId: CursorId | null = null;
	private flagResolver: FlagResolver;

	private width = 0;
	private height = 0;

	constructor(container: HTMLElement, configInput: CursorFieldConfig) {
		this.config = {
			lineThreshold: configInput.lineThreshold ?? 0.2,
			lineWidth: configInput.lineWidth ?? 1,
			lineColour: configInput.lineColour ?? "rgba(255, 255, 255, 0.8)",
			lineMaxOpacity: configInput.lineMaxOpacity ?? 0.6,
			cursorSize: configInput.cursorSize ?? 32,
			showOwnCursor: configInput.showOwnCursor ?? false,
			staleThreshold: configInput.staleThreshold ?? 2000,
			staleFadeDuration: configInput.staleFadeDuration ?? 1000,
		};

		this.flagResolver = new FlagResolver();

		this.canvas = document.createElement("canvas");
		this.canvas.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			pointer-events: none;
		`;

		const ctx = this.canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get 2D context");
		}
		this.ctx = ctx;

		container.appendChild(this.canvas);

		this.updateDimensions();
		window.addEventListener("resize", this.handleResize);
	}

	setOwnCursorId(id: CursorId): void {
		this.ownCursorId = id;
	}

	updateConfig(configInput: Partial<CursorFieldConfig>): void {
		if (configInput.lineThreshold !== undefined) this.config.lineThreshold = configInput.lineThreshold;
		if (configInput.lineWidth !== undefined) this.config.lineWidth = configInput.lineWidth;
		if (configInput.lineColour !== undefined) this.config.lineColour = configInput.lineColour;
		if (configInput.lineMaxOpacity !== undefined) this.config.lineMaxOpacity = configInput.lineMaxOpacity;
		if (configInput.cursorSize !== undefined) this.config.cursorSize = configInput.cursorSize;
		if (configInput.showOwnCursor !== undefined) this.config.showOwnCursor = configInput.showOwnCursor;
		if (configInput.staleThreshold !== undefined) this.config.staleThreshold = configInput.staleThreshold;
		if (configInput.staleFadeDuration !== undefined) this.config.staleFadeDuration = configInput.staleFadeDuration;
	}

	render(cursors: Map<CursorId, InterpolatedCursor>, ownPosition?: { x: number; y: number } | null): void {
		this.ctx.clearRect(0, 0, this.width, this.height);

		const now = Date.now();
		const remoteCursors = this.getRemoteCursors(cursors);

		this.renderLines(remoteCursors, ownPosition ?? null);

		for (const cursor of remoteCursors) {
			this.renderCursor(cursor, now);
		}
	}

	destroy(): void {
		window.removeEventListener("resize", this.handleResize);
		this.canvas.remove();
	}

	private getRemoteCursors(cursors: Map<CursorId, InterpolatedCursor>): InterpolatedCursor[] {
		const remote: InterpolatedCursor[] = [];

		for (const cursor of cursors.values()) {
			if (cursor.id === this.ownCursorId) {
				continue;
			}
			remote.push(cursor);
		}

		return remote;
	}

	private renderLines(remoteCursors: InterpolatedCursor[], ownPosition: { x: number; y: number } | null): void {
		const threshold = this.config.lineThreshold;
		this.ctx.lineWidth = this.config.lineWidth;

		// Draw lines between remote cursors
		for (let i = 0; i < remoteCursors.length; i++) {
			for (let j = i + 1; j < remoteCursors.length; j++) {
				const a = remoteCursors[i];
				const b = remoteCursors[j];

				if (!a || !b) continue;

				this.drawLineIfClose(a.renderX, a.renderY, b.renderX, b.renderY, threshold);
			}
		}

		// Draw lines from own cursor to remote cursors (using real-time mouse position)
		if (ownPosition && this.config.showOwnCursor) {
			for (const remote of remoteCursors) {
				this.drawLineIfClose(ownPosition.x, ownPosition.y, remote.renderX, remote.renderY, threshold);
			}
		}
	}

	private drawLineIfClose(x1: number, y1: number, x2: number, y2: number, threshold: number): void {
		const dx = x1 - x2;
		const dy = y1 - y2;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist < threshold) {
			const opacity = (1 - dist / threshold) * this.config.lineMaxOpacity;

			this.ctx.strokeStyle = this.applyOpacity(this.config.lineColour, opacity);

			this.ctx.beginPath();
			this.ctx.moveTo(x1 * this.width, y1 * this.height);
			this.ctx.lineTo(x2 * this.width, y2 * this.height);
			this.ctx.stroke();
		}
	}

	private renderCursor(cursor: InterpolatedCursor, now: number): void {
		const x = cursor.renderX * this.width;
		const y = cursor.renderY * this.height;

		let opacity = 1;
		const age = now - cursor.lastUpdate;

		if (age > this.config.staleThreshold) {
			const fadeProgress = (age - this.config.staleThreshold) / this.config.staleFadeDuration;
			opacity = Math.max(0, 1 - fadeProgress);
		}

		if (opacity <= 0) return;

		const flag = this.flagResolver.resolve(cursor.countryCode);

		this.ctx.globalAlpha = opacity;

		this.ctx.font = `${this.config.cursorSize}px serif`;
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		this.ctx.fillText(flag, x, y);

		this.ctx.globalAlpha = 1;
	}

	private applyOpacity(colour: string, opacity: number): string {
		const rgbaMatch = colour.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);

		if (rgbaMatch) {
			const [, r, g, b] = rgbaMatch;
			return `rgba(${r}, ${g}, ${b}, ${opacity})`;
		}

		if (colour.startsWith("#")) {
			const hex = colour.slice(1);
			const r = Number.parseInt(hex.slice(0, 2), 16);
			const g = Number.parseInt(hex.slice(2, 4), 16);
			const b = Number.parseInt(hex.slice(4, 6), 16);
			return `rgba(${r}, ${g}, ${b}, ${opacity})`;
		}

		return colour;
	}

	private handleResize = (): void => {
		this.updateDimensions();
	};

	private updateDimensions(): void {
		this.width = window.innerWidth;
		this.height = window.innerHeight;

		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = this.width * dpr;
		this.canvas.height = this.height * dpr;
		this.ctx.scale(dpr, dpr);
	}
}
