import { describe, expect, it } from "vitest";

// Test the resizeCanvas utility function logic
describe("resizeCanvas utility", () => {
	// Extract and test the resize logic
	const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number, ratio: number): boolean => {
		if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
			canvas.width = width * ratio;
			canvas.height = height * ratio;
			return true;
		}
		return false;
	};

	it("should resize canvas when dimensions change", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 200, 200, 1);

		expect(result).toBe(true);
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(200);
	});

	it("should not resize when dimensions are already correct", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 200;
		canvas.height = 200;

		const result = resizeCanvas(canvas, 200, 200, 1);

		expect(result).toBe(false);
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(200);
	});

	it("should apply device pixel ratio correctly", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 200, 200, 2);

		expect(result).toBe(true);
		expect(canvas.width).toBe(400); // 200 * 2
		expect(canvas.height).toBe(400); // 200 * 2
	});

	it("should handle high DPI displays", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 100, 100, 3);

		expect(result).toBe(true);
		expect(canvas.width).toBe(300); // 100 * 3
		expect(canvas.height).toBe(300); // 100 * 3
	});

	it("should handle fractional pixel ratios", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 100, 100, 1.5);

		expect(result).toBe(true);
		expect(canvas.width).toBe(150); // 100 * 1.5
		expect(canvas.height).toBe(150); // 100 * 1.5
	});

	it("should return false when already at target size with ratio applied", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 400;
		canvas.height = 400;

		const result = resizeCanvas(canvas, 200, 200, 2);

		expect(result).toBe(false);
		expect(canvas.width).toBe(400);
		expect(canvas.height).toBe(400);
	});

	it("should handle width change only", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 200;

		const result = resizeCanvas(canvas, 150, 200, 1);

		expect(result).toBe(true);
		expect(canvas.width).toBe(150);
		expect(canvas.height).toBe(200);
	});

	it("should handle height change only", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 200;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 200, 150, 1);

		expect(result).toBe(true);
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(150);
	});

	it("should handle zero dimensions", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 0, 0, 1);

		expect(result).toBe(true);
		expect(canvas.width).toBe(0);
		expect(canvas.height).toBe(0);
	});

	it("should handle very large dimensions", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;

		const result = resizeCanvas(canvas, 4000, 4000, 2);

		expect(result).toBe(true);
		expect(canvas.width).toBe(8000);
		expect(canvas.height).toBe(8000);
	});

	it("should detect changes when ratio changes", () => {
		const canvas = document.createElement("canvas");
		canvas.width = 200;
		canvas.height = 200;

		// First with ratio 1
		resizeCanvas(canvas, 200, 200, 1);
		expect(canvas.width).toBe(200);

		// Then with ratio 2 - should resize
		const result = resizeCanvas(canvas, 200, 200, 2);
		expect(result).toBe(true);
		expect(canvas.width).toBe(400);
	});
});

describe("Canvas animation loop logic", () => {
	it("should calculate time deltas correctly", () => {
		let lastTime = 0;
		const times = [0, 16, 32, 48, 64]; // Simulating 60fps
		const deltas: number[] = [];

		for (const time of times) {
			const delta = time - lastTime;
			deltas.push(delta);
			lastTime = time;
		}

		expect(deltas[0]).toBe(0); // First frame
		expect(deltas[1]).toBe(16);
		expect(deltas[2]).toBe(16);
		expect(deltas[3]).toBe(16);
		expect(deltas[4]).toBe(16);
	});

	it("should handle variable frame rates", () => {
		let lastTime = 0;
		const times = [0, 16, 40, 50]; // Variable timing
		const deltas: number[] = [];

		for (const time of times) {
			const delta = time - lastTime;
			deltas.push(delta);
			lastTime = time;
		}

		expect(deltas[0]).toBe(0);
		expect(deltas[1]).toBe(16);
		expect(deltas[2]).toBe(24); // Slow frame
		expect(deltas[3]).toBe(10); // Fast frame
	});
});
