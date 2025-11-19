// Setup file for vitest tests
// Mock window.devicePixelRatio for canvas tests
if (typeof window !== "undefined") {
	Object.defineProperty(window, "devicePixelRatio", {
		writable: true,
		configurable: true,
		value: 1,
	});
}
