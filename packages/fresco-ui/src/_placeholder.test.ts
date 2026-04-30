import { describe, expect, it } from "vitest";
import { placeholder } from "./_placeholder";

describe("_placeholder", () => {
	it("exports the placeholder string", () => {
		expect(placeholder).toBe("__fresco-ui-build-ok__");
	});

	it("uses jsdom environment", () => {
		expect(typeof window).toBe("object");
		expect(typeof document).toBe("object");
	});
});
