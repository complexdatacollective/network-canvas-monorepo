import type { Cursor, CursorId, InterpolatedCursor } from "../types";

export type StateSubscriber = (cursors: Map<CursorId, InterpolatedCursor>) => void;

export class StateStore {
	private cursors: Map<CursorId, InterpolatedCursor> = new Map();
	private ownCursorId: CursorId | null = null;
	private subscribers: Set<StateSubscriber> = new Set();

	setOwnCursorId(id: CursorId): void {
		this.ownCursorId = id;
	}

	getOwnCursorId(): CursorId | null {
		return this.ownCursorId;
	}

	syncCursors(cursors: Cursor[]): void {
		this.cursors.clear();

		for (const cursor of cursors) {
			this.cursors.set(cursor.id, this.toInterpolatedCursor(cursor));
		}

		this.notify();
	}

	updateCursor(cursor: Cursor): void {
		const existing = this.cursors.get(cursor.id);

		if (existing) {
			existing.targetX = cursor.x;
			existing.targetY = cursor.y;
			existing.x = cursor.x;
			existing.y = cursor.y;
			existing.lastUpdate = cursor.lastUpdate;
			existing.countryCode = cursor.countryCode;
			existing.displayName = cursor.displayName;
			existing.colour = cursor.colour;
		} else {
			this.cursors.set(cursor.id, this.toInterpolatedCursor(cursor));
		}

		this.notify();
	}

	removeCursor(cursorId: CursorId): void {
		this.cursors.delete(cursorId);
		this.notify();
	}

	getCursors(): Map<CursorId, InterpolatedCursor> {
		return this.cursors;
	}

	getCursor(id: CursorId): InterpolatedCursor | undefined {
		return this.cursors.get(id);
	}

	getCursorCount(): number {
		return this.cursors.size;
	}

	subscribe(subscriber: StateSubscriber): () => void {
		this.subscribers.add(subscriber);
		return () => this.subscribers.delete(subscriber);
	}

	skipToTargets(): void {
		for (const cursor of this.cursors.values()) {
			cursor.renderX = cursor.targetX;
			cursor.renderY = cursor.targetY;
			cursor.velocityX = 0;
			cursor.velocityY = 0;
		}
	}

	updateInterpolation(deltaTime: number, smoothingFactor: number): void {
		const dt = deltaTime / 1000;
		const stiffness = 1 / (smoothingFactor / 1000);
		const damping = 2 * Math.sqrt(stiffness);

		for (const cursor of this.cursors.values()) {
			const dx = cursor.targetX - cursor.renderX;
			const dy = cursor.targetY - cursor.renderY;

			const springForceX = dx * stiffness;
			const springForceY = dy * stiffness;

			const dampingForceX = -cursor.velocityX * damping;
			const dampingForceY = -cursor.velocityY * damping;

			cursor.velocityX += (springForceX + dampingForceX) * dt;
			cursor.velocityY += (springForceY + dampingForceY) * dt;

			cursor.renderX += cursor.velocityX * dt;
			cursor.renderY += cursor.velocityY * dt;

			if (
				Math.abs(dx) < 0.0001 &&
				Math.abs(dy) < 0.0001 &&
				Math.abs(cursor.velocityX) < 0.0001 &&
				Math.abs(cursor.velocityY) < 0.0001
			) {
				cursor.renderX = cursor.targetX;
				cursor.renderY = cursor.targetY;
				cursor.velocityX = 0;
				cursor.velocityY = 0;
			}
		}
	}

	cleanupStale(removeThreshold: number): CursorId[] {
		const now = Date.now();
		const removed: CursorId[] = [];

		for (const [id, cursor] of this.cursors) {
			if (now - cursor.lastUpdate > removeThreshold) {
				this.cursors.delete(id);
				removed.push(id);
			}
		}

		if (removed.length > 0) {
			this.notify();
		}

		return removed;
	}

	private toInterpolatedCursor(cursor: Cursor): InterpolatedCursor {
		return {
			...cursor,
			targetX: cursor.x,
			targetY: cursor.y,
			renderX: cursor.x,
			renderY: cursor.y,
			velocityX: 0,
			velocityY: 0,
		};
	}

	private notify(): void {
		for (const subscriber of this.subscribers) {
			subscriber(this.cursors);
		}
	}
}
