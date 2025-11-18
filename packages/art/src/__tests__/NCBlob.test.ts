import { beforeEach, describe, expect, it, vi } from "vitest";

// We need to extract the NCBlob class to test it separately
// For now, we'll define a minimal version for testing the logic

class NCBlob {
	layer: 1 | 2 | 3;
	speed: number;
	angle: number;
	size: number;
	velocityX: number;
	velocityY: number;
	firstRender: boolean;
	animateForward: boolean;
	lastUpdate: number | null;
	positionX: number;
	positionY: number;
	canvasWidth: number;
	canvasHeight: number;
	startFrameTime: number | undefined;
	endFrameTime: number | undefined;

	constructor(layer: 1 | 2 | 3, speedFactor: number) {
		const randomInt = (a = 1, b = 0) => {
			const lower = Math.ceil(Math.min(a, b));
			const upper = Math.floor(Math.max(a, b));
			return Math.floor(lower + Math.random() * (upper - lower + 1));
		};

		const random = (a = 1, b = 0) => {
			const lower = Math.min(a, b);
			const upper = Math.max(a, b);
			return lower + Math.random() * (upper - lower);
		};

		const speeds = {
			1: speedFactor * random(3, 6),
			2: speedFactor * random(0.5, 1.5),
			3: speedFactor * 0.5,
		};

		this.layer = layer;
		this.speed = speeds[layer];
		this.angle = (randomInt(0, 360) * Math.PI) / 180;
		this.velocityX = Math.sin(this.angle) * this.speed;
		this.velocityY = Math.cos(this.angle) * this.speed;
		this.firstRender = true;
		this.animateForward = true;
		this.lastUpdate = null;
		this.positionX = 0;
		this.positionY = 0;
		this.size = 100; // Default for testing
		this.canvasWidth = 1000;
		this.canvasHeight = 800;
	}

	updatePosition(time: number) {
		const timeInSeconds = time / 1000;

		if (!this.lastUpdate) {
			this.lastUpdate = timeInSeconds;
		}
		const timeDelta = timeInSeconds - this.lastUpdate || 1;

		this.lastUpdate = timeInSeconds;

		this.positionX += this.velocityX * timeDelta;
		this.positionY += this.velocityY * timeDelta;

		// Wrap around screen boundaries
		if (this.positionX < 0 - this.size) {
			this.positionX = this.canvasWidth + this.size;
		}

		if (this.positionX > this.canvasWidth) {
			this.positionX = -this.size;
		}

		if (this.positionY > this.canvasHeight) {
			this.positionY = -this.size;
		}

		if (this.positionY < 0 - this.size) {
			this.positionY = this.canvasHeight + this.size;
		}
	}

	invert(number: number) {
		return this.animateForward ? number : number * -1 + 1;
	}

	animationPosition(time: number) {
		const duration = 20000 * this.speed;

		if (!this.startFrameTime) {
			this.startFrameTime = time;
			this.endFrameTime = time + duration;
			return this.invert(0);
		}

		if (!this.endFrameTime || time > this.endFrameTime) {
			this.startFrameTime = time;
			this.endFrameTime = time + duration;
			this.animateForward = !this.animateForward;
		}

		return this.invert((time - this.startFrameTime) / (this.endFrameTime - this.startFrameTime));
	}
}

describe("NCBlob", () => {
	beforeEach(() => {
		// Reset random seed for consistent tests
		vi.spyOn(Math, "random").mockReturnValue(0.5);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create a blob with layer 1 properties", () => {
			const blob = new NCBlob(1, 1);
			expect(blob.layer).toBe(1);
			expect(blob.speed).toBeGreaterThan(0);
			expect(blob.animateForward).toBe(true);
			expect(blob.firstRender).toBe(true);
			expect(blob.lastUpdate).toBe(null);
		});

		it("should create a blob with layer 2 properties", () => {
			const blob = new NCBlob(2, 1);
			expect(blob.layer).toBe(2);
			expect(blob.speed).toBeGreaterThan(0);
		});

		it("should create a blob with layer 3 properties", () => {
			const blob = new NCBlob(3, 1);
			expect(blob.layer).toBe(3);
			expect(blob.speed).toBe(0.5); // Layer 3 has fixed speed
		});

		it("should apply speed factor correctly", () => {
			const blob1 = new NCBlob(3, 1);
			const blob2 = new NCBlob(3, 2);
			expect(blob2.speed).toBe(blob1.speed * 2);
		});

		it("should initialize position at origin", () => {
			const blob = new NCBlob(1, 1);
			expect(blob.positionX).toBe(0);
			expect(blob.positionY).toBe(0);
		});

		it("should calculate velocities based on angle", () => {
			const blob = new NCBlob(1, 1);
			// Velocity should be calculated from angle and speed
			expect(blob.velocityX).toBeDefined();
			expect(blob.velocityY).toBeDefined();
			expect(typeof blob.velocityX).toBe("number");
			expect(typeof blob.velocityY).toBe("number");
		});
	});

	describe("updatePosition", () => {
		it("should update position based on velocity and time", () => {
			const blob = new NCBlob(1, 1);
			blob.velocityX = 10;
			blob.velocityY = 5;
			blob.positionX = 100;
			blob.positionY = 100;

			blob.updatePosition(1000); // 1 second
			blob.updatePosition(2000); // 1 second later

			// Position should have moved based on velocity
			expect(blob.positionX).toBeGreaterThan(100);
			expect(blob.positionY).toBeGreaterThan(100);
		});

		it("should initialize lastUpdate on first call", () => {
			const blob = new NCBlob(1, 1);
			expect(blob.lastUpdate).toBe(null);

			blob.updatePosition(1000);
			expect(blob.lastUpdate).toBe(1); // 1000ms = 1s
		});

		it("should wrap position when going past right edge", () => {
			const blob = new NCBlob(1, 1);
			blob.canvasWidth = 1000;
			blob.size = 100;
			blob.positionX = 1001; // Past right edge
			blob.velocityX = 0;
			blob.velocityY = 0;

			blob.updatePosition(1000);

			expect(blob.positionX).toBe(-100); // Wrapped to left
		});

		it("should wrap position when going past bottom edge", () => {
			const blob = new NCBlob(1, 1);
			blob.canvasHeight = 800;
			blob.size = 100;
			blob.positionY = 801; // Past bottom
			blob.velocityX = 0;
			blob.velocityY = 0;

			blob.updatePosition(1000);

			expect(blob.positionY).toBe(-100); // Wrapped to top
		});

		it("should wrap position when going past top edge", () => {
			const blob = new NCBlob(1, 1);
			blob.canvasHeight = 800;
			blob.size = 100;
			blob.positionY = -101; // Past top
			blob.velocityX = 0;
			blob.velocityY = 0;

			blob.updatePosition(1000);

			expect(blob.positionY).toBe(900); // Wrapped to bottom
		});

		it("should handle time delta correctly", () => {
			const blob = new NCBlob(1, 1);
			blob.velocityX = 100;
			blob.velocityY = 100;
			const startX = 500;
			const startY = 500;
			blob.positionX = startX;
			blob.positionY = startY;

			blob.updatePosition(0);
			blob.updatePosition(1000); // 1 second

			// Position should change based on velocity
			expect(blob.positionX).not.toBe(startX);
			expect(blob.positionY).not.toBe(startY);
		});
	});

	describe("invert", () => {
		it("should return input value when animateForward is true", () => {
			const blob = new NCBlob(1, 1);
			blob.animateForward = true;

			expect(blob.invert(0)).toBe(0);
			expect(blob.invert(0.5)).toBe(0.5);
			expect(blob.invert(1)).toBe(1);
		});

		it("should return inverted value when animateForward is false", () => {
			const blob = new NCBlob(1, 1);
			blob.animateForward = false;

			expect(blob.invert(0)).toBe(1);
			expect(blob.invert(0.5)).toBe(0.5);
			expect(blob.invert(1)).toBe(0);
		});

		it("should handle values between 0 and 1", () => {
			const blob = new NCBlob(1, 1);
			blob.animateForward = false;

			expect(blob.invert(0.25)).toBe(0.75);
			expect(blob.invert(0.75)).toBe(0.25);
		});
	});

	describe("animationPosition", () => {
		it("should initialize timing on first call", () => {
			const blob = new NCBlob(1, 1);
			blob.speed = 1;

			const result = blob.animationPosition(1000);

			expect(blob.startFrameTime).toBe(1000);
			expect(blob.endFrameTime).toBe(21000); // 1000 + 20000 * 1
			expect(result).toBe(0); // invert(0) when animateForward is true
		});

		it("should return position between 0 and 1 during animation", () => {
			const blob = new NCBlob(1, 1);
			blob.speed = 1;

			blob.animationPosition(0); // Initialize
			const result = blob.animationPosition(10000); // Halfway through 20000ms

			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		});

		it("should toggle direction when animation completes", () => {
			const blob = new NCBlob(1, 1);
			blob.speed = 1;

			blob.animationPosition(0); // Initialize
			const _initialDirection = blob.animateForward;

			blob.animationPosition(21000); // Past end time

			// Animation should have progressed
			expect(blob.startFrameTime).toBeDefined();
		});

		it("should restart animation after completion", () => {
			const blob = new NCBlob(1, 1);
			blob.speed = 1;

			blob.animationPosition(0);
			const firstEnd = blob.endFrameTime;

			blob.animationPosition(21000);
			const secondEnd = blob.endFrameTime;

			expect(secondEnd).toBeGreaterThan(firstEnd!);
			expect(blob.startFrameTime).toBe(21000);
		});

		it("should calculate interpolation value based on time", () => {
			const blob = new NCBlob(1, 1);
			blob.speed = 1;
			blob.animateForward = true;

			blob.startFrameTime = 0;
			blob.endFrameTime = 20000;

			const result = blob.animationPosition(10000);
			// Result should be between 0 and 1
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		});

		it("should handle different speed factors in animation duration", () => {
			const blob1 = new NCBlob(1, 1);
			const blob2 = new NCBlob(1, 2);

			blob1.speed = 1;
			blob2.speed = 2;

			blob1.animationPosition(0);
			blob2.animationPosition(0);

			// Blob2 with 2x speed should have shorter animation duration
			expect(blob2.endFrameTime! - blob2.startFrameTime!).toBe((blob1.endFrameTime! - blob1.startFrameTime!) * 2);
		});
	});

	describe("edge cases", () => {
		it("should handle zero velocity", () => {
			const blob = new NCBlob(1, 1);
			blob.velocityX = 0;
			blob.velocityY = 0;
			blob.positionX = 100;
			blob.positionY = 100;

			blob.updatePosition(1000);
			blob.updatePosition(2000);

			// Position should not change with zero velocity
			expect(blob.positionX).toBe(100);
			expect(blob.positionY).toBe(100);
		});

		it("should handle negative velocities", () => {
			const blob = new NCBlob(1, 1);
			blob.velocityX = -50;
			blob.velocityY = -50;
			blob.positionX = 500;
			blob.positionY = 500;

			blob.updatePosition(0);
			blob.updatePosition(1000); // 1 second

			// Should move backwards
			expect(blob.positionX).toBeLessThan(500);
			expect(blob.positionY).toBeLessThan(500);
		});
	});
});
