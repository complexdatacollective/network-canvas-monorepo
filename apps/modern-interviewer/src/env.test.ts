import { describe, expect, it } from "vitest";
import { APP_NAME, APP_VERSION, detectPlatform } from "./env";

describe("env", () => {
	it("detects web in a jsdom environment", () => {
		expect(detectPlatform()).toBe("web");
	});

	it("exposes basic app metadata", () => {
		expect(APP_NAME).toBe("Network Canvas Interviewer");
		expect(APP_VERSION).toBeTypeOf("string");
	});
});
