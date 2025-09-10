import { describe, expect, it } from "vitest";
import ProtocolSchema from "../schema";

describe("Mock Protocol", () => {
	it("consistently generates valid mock protocols", () => {
		// due to variety in random generation, run multiple times to check for issues
		for (let i = 0; i < 10; i++) {
			const protocol = ProtocolSchema.generateMock();
			const result = ProtocolSchema.safeParse(protocol);
			expect(result.success).toBe(true);
		}
	});
});
