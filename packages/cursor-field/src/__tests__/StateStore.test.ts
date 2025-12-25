import { describe, expect, it, vi } from "vitest";
import { StateStore } from "../client/StateStore";
import type { Cursor } from "../types";

function createMockCursor(overrides: Partial<Cursor> = {}): Cursor {
	return {
		id: "test-cursor-1",
		x: 0.5,
		y: 0.5,
		countryCode: "US",
		lastUpdate: Date.now(),
		...overrides,
	};
}

describe("StateStore", () => {
	describe("cursor management", () => {
		it("should set and get own cursor id", () => {
			const store = new StateStore();
			expect(store.getOwnCursorId()).toBeNull();

			store.setOwnCursorId("my-cursor");
			expect(store.getOwnCursorId()).toBe("my-cursor");
		});

		it("should sync cursors from server", () => {
			const store = new StateStore();
			const cursors = [createMockCursor({ id: "cursor-1" }), createMockCursor({ id: "cursor-2", x: 0.3, y: 0.7 })];

			store.syncCursors(cursors);

			expect(store.getCursorCount()).toBe(2);
			expect(store.getCursor("cursor-1")).toBeDefined();
			expect(store.getCursor("cursor-2")).toBeDefined();
		});

		it("should clear existing cursors on sync", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "old-cursor" })]);
			expect(store.getCursor("old-cursor")).toBeDefined();

			store.syncCursors([createMockCursor({ id: "new-cursor" })]);
			expect(store.getCursor("old-cursor")).toBeUndefined();
			expect(store.getCursor("new-cursor")).toBeDefined();
		});

		it("should update existing cursor target position", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1", x: 0.2, y: 0.3 })]);

			store.updateCursor(createMockCursor({ id: "cursor-1", x: 0.8, y: 0.9 }));

			const cursor = store.getCursor("cursor-1");
			expect(cursor?.x).toBe(0.8);
			expect(cursor?.y).toBe(0.9);
			expect(cursor?.targetX).toBe(0.8);
			expect(cursor?.targetY).toBe(0.9);
		});

		it("should add new cursor on update if not exists", () => {
			const store = new StateStore();
			expect(store.getCursorCount()).toBe(0);

			store.updateCursor(createMockCursor({ id: "new-cursor" }));
			expect(store.getCursorCount()).toBe(1);
		});

		it("should remove cursor", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1" })]);
			expect(store.getCursorCount()).toBe(1);

			store.removeCursor("cursor-1");
			expect(store.getCursorCount()).toBe(0);
		});
	});

	describe("smoothing", () => {
		it("should initialize render position at target", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1", x: 0.5, y: 0.5 })]);

			const cursor = store.getCursor("cursor-1");
			expect(cursor?.renderX).toBe(0.5);
			expect(cursor?.renderY).toBe(0.5);
		});

		it("should move render position toward target over time", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1", x: 0, y: 0 })]);

			store.updateCursor(createMockCursor({ id: "cursor-1", x: 1, y: 1 }));

			store.updateInterpolation(16, 120);

			const cursor = store.getCursor("cursor-1");
			expect(cursor?.renderX).toBeGreaterThan(0);
			expect(cursor?.renderY).toBeGreaterThan(0);
			expect(cursor?.renderX).toBeLessThan(1);
			expect(cursor?.renderY).toBeLessThan(1);
		});

		it("should update velocity during smoothing", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1", x: 0, y: 0 })]);

			store.updateCursor(createMockCursor({ id: "cursor-1", x: 1, y: 1 }));

			const cursorBefore = store.getCursor("cursor-1");
			expect(cursorBefore?.velocityX).toBe(0);
			expect(cursorBefore?.velocityY).toBe(0);

			store.updateInterpolation(16, 120);

			const cursorAfter = store.getCursor("cursor-1");
			expect(cursorAfter?.velocityX).toBeGreaterThan(0);
			expect(cursorAfter?.velocityY).toBeGreaterThan(0);
		});

		it("should converge to target position with enough updates", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1", x: 0, y: 0 })]);

			store.updateCursor(createMockCursor({ id: "cursor-1", x: 0.5, y: 0.5 }));

			for (let i = 0; i < 200; i++) {
				store.updateInterpolation(16, 120);
			}

			const cursor = store.getCursor("cursor-1");
			expect(cursor?.renderX).toBeCloseTo(0.5, 2);
			expect(cursor?.renderY).toBeCloseTo(0.5, 2);
		});

		it("should settle velocity to near zero when at target", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1", x: 0, y: 0 })]);

			store.updateCursor(createMockCursor({ id: "cursor-1", x: 0.5, y: 0.5 }));

			for (let i = 0; i < 200; i++) {
				store.updateInterpolation(16, 120);
			}

			const cursor = store.getCursor("cursor-1");
			expect(Math.abs(cursor?.velocityX ?? 1)).toBeLessThan(0.01);
			expect(Math.abs(cursor?.velocityY ?? 1)).toBeLessThan(0.01);
		});
	});

	describe("staleness cleanup", () => {
		it("should remove stale cursors", () => {
			const store = new StateStore();
			const oldTimestamp = Date.now() - 10000;
			store.syncCursors([
				createMockCursor({ id: "old-cursor", lastUpdate: oldTimestamp }),
				createMockCursor({ id: "new-cursor", lastUpdate: Date.now() }),
			]);

			const removed = store.cleanupStale(5000);

			expect(removed).toContain("old-cursor");
			expect(store.getCursor("old-cursor")).toBeUndefined();
			expect(store.getCursor("new-cursor")).toBeDefined();
		});

		it("should return empty array if no stale cursors", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "fresh-cursor", lastUpdate: Date.now() })]);

			const removed = store.cleanupStale(5000);
			expect(removed).toHaveLength(0);
		});
	});

	describe("subscriptions", () => {
		it("should notify subscribers on sync", () => {
			const store = new StateStore();
			const subscriber = vi.fn();
			store.subscribe(subscriber);

			store.syncCursors([createMockCursor()]);

			expect(subscriber).toHaveBeenCalledTimes(1);
		});

		it("should notify subscribers on update", () => {
			const store = new StateStore();
			const subscriber = vi.fn();
			store.subscribe(subscriber);

			store.updateCursor(createMockCursor());

			expect(subscriber).toHaveBeenCalledTimes(1);
		});

		it("should notify subscribers on remove", () => {
			const store = new StateStore();
			store.syncCursors([createMockCursor({ id: "cursor-1" })]);

			const subscriber = vi.fn();
			store.subscribe(subscriber);
			store.removeCursor("cursor-1");

			expect(subscriber).toHaveBeenCalledTimes(1);
		});

		it("should allow unsubscribing", () => {
			const store = new StateStore();
			const subscriber = vi.fn();
			const unsubscribe = store.subscribe(subscriber);

			unsubscribe();
			store.syncCursors([createMockCursor()]);

			expect(subscriber).not.toHaveBeenCalled();
		});
	});
});
