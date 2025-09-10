import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import ProtocolSchema from "../schema";

describe("Mock Protocol", () => {
	it("consistently generates valid mock protocols", () => {
		// due to variety in random generation, run multiple times to check for issues
		for (let i = 0; i < 20; i++) {
			const protocol = ProtocolSchema.generateMock();
			const result = ProtocolSchema.safeParse(protocol);
			if (!result.success) {
				console.error(`Validation errors on iteration ${i + 1}:`, result.error);
				// write invalid protocol to file in development only
				const outputPath = path.join(__dirname, `mock-protocol-failure-${i + 1}.json`);
				fs.writeFileSync(outputPath, JSON.stringify(protocol, null, 2));
			}
			expect(result.success).toBe(true);
		}
	});
});
