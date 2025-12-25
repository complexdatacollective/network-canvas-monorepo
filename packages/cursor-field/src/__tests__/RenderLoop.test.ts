import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderLoop } from "../rendering/RenderLoop";

describe("RenderLoop", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(performance, "now").mockReturnValue(0);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("should call callback on each frame", () => {
		const callback = vi.fn();
		const loop = new RenderLoop(callback);

		loop.start();

		vi.spyOn(performance, "now").mockReturnValue(16);
		vi.advanceTimersToNextTimer();

		expect(callback).toHaveBeenCalledWith(16, 16);
	});

	it("should calculate correct delta time between frames", () => {
		const callback = vi.fn();
		const loop = new RenderLoop(callback);

		loop.start();

		vi.spyOn(performance, "now").mockReturnValue(16);
		vi.advanceTimersToNextTimer();

		vi.spyOn(performance, "now").mockReturnValue(33);
		vi.advanceTimersToNextTimer();

		expect(callback).toHaveBeenLastCalledWith(33, 17);
	});

	it("should stop calling callback after stop", () => {
		const callback = vi.fn();
		const loop = new RenderLoop(callback);

		loop.start();

		vi.spyOn(performance, "now").mockReturnValue(16);
		vi.advanceTimersToNextTimer();

		loop.stop();
		callback.mockClear();

		vi.spyOn(performance, "now").mockReturnValue(32);
		vi.advanceTimersToNextTimer();

		expect(callback).not.toHaveBeenCalled();
	});

	it("should not start twice", () => {
		const requestAnimationFrameSpy = vi.spyOn(globalThis, "requestAnimationFrame");
		const callback = vi.fn();
		const loop = new RenderLoop(callback);

		loop.start();
		loop.start();

		expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
	});

	it("should cancel animation frame on stop", () => {
		const cancelAnimationFrameSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
		const callback = vi.fn();
		const loop = new RenderLoop(callback);

		loop.start();
		loop.stop();

		expect(cancelAnimationFrameSpy).toHaveBeenCalled();
	});
});
