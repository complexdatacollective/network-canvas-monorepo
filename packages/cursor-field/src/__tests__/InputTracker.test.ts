import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputTracker } from "../client/InputTracker";

describe("InputTracker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(globalThis, "innerWidth", { value: 1000, writable: true });
		Object.defineProperty(globalThis, "innerHeight", { value: 800, writable: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("start/stop", () => {
		it("should add event listeners on start", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });

			tracker.start();

			expect(addEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
		});

		it("should remove event listeners on stop", () => {
			const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });

			tracker.start();
			tracker.stop();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
		});

		it("should not start if disabled", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");
			const callback = vi.fn();
			const tracker = new InputTracker(callback, {
				partyHost: "test.com",
				disableInput: true,
			});

			tracker.start();

			expect(addEventListenerSpy).not.toHaveBeenCalled();
		});

		it("should not start twice", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });

			tracker.start();
			tracker.start();

			expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("position tracking", () => {
		it("should normalise mouse position to 0-1 range", () => {
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });
			tracker.start();

			const event = new MouseEvent("mousemove", {
				clientX: 500,
				clientY: 400,
			});
			window.dispatchEvent(event);

			expect(callback).toHaveBeenCalledWith({
				x: 0.5,
				y: 0.5,
			});
		});

		it("should handle edge positions", () => {
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });
			tracker.start();

			const cornerEvent = new MouseEvent("mousemove", {
				clientX: 0,
				clientY: 0,
			});
			window.dispatchEvent(cornerEvent);

			expect(callback).toHaveBeenCalledWith({
				x: 0,
				y: 0,
			});

			vi.advanceTimersByTime(100);

			const oppositeCornerEvent = new MouseEvent("mousemove", {
				clientX: 1000,
				clientY: 800,
			});
			window.dispatchEvent(oppositeCornerEvent);

			expect(callback).toHaveBeenLastCalledWith({
				x: 1,
				y: 1,
			});
		});

		it("should return last position", () => {
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });
			tracker.start();

			expect(tracker.getLastPosition()).toBeNull();

			const event = new MouseEvent("mousemove", {
				clientX: 250,
				clientY: 200,
			});
			window.dispatchEvent(event);

			expect(tracker.getLastPosition()).toEqual({
				x: 0.25,
				y: 0.25,
			});
		});
	});

	describe("throttling", () => {
		it("should throttle position updates", () => {
			const callback = vi.fn();
			const tracker = new InputTracker(callback, {
				partyHost: "test.com",
				updateInterval: 50,
			});
			tracker.start();

			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 200 }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 300 }));

			expect(callback).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(50);

			expect(callback).toHaveBeenCalledTimes(2);
			expect(callback).toHaveBeenLastCalledWith({
				x: 0.3,
				y: 0.375,
			});
		});

		it("should respect custom update interval", () => {
			const callback = vi.fn();
			const tracker = new InputTracker(callback, {
				partyHost: "test.com",
				updateInterval: 100,
			});
			tracker.start();

			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 200 }));

			vi.advanceTimersByTime(50);
			expect(callback).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(50);
			expect(callback).toHaveBeenCalledTimes(2);
		});
	});

	describe("mouse leave", () => {
		it("should clear last position on mouse leave", () => {
			const callback = vi.fn();
			const tracker = new InputTracker(callback, { partyHost: "test.com" });
			tracker.start();

			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, clientY: 400 }));
			expect(tracker.getLastPosition()).not.toBeNull();

			document.dispatchEvent(new MouseEvent("mouseleave"));
			expect(tracker.getLastPosition()).toBeNull();
		});
	});
});
