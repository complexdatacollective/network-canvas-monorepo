import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import ProtocolSchema from "../schema";
import { stageSchema } from "../stages";

describe("Mock Protocol", () => {
	it("generates a valid mock protocol", () => {
		const protocol = ProtocolSchema.generateMock();

		const result = ProtocolSchema.safeParse(protocol);
		if (!result.success) {
			console.error("Validation errors:", result.error);
		}

		// should pass validation - this is currently failing due to complex integration issues
		// stages need to reference codebook items, which are randomly generated
		expect(result.success).toBe(true);

		// simple checks. should expand later.
		expect(protocol.schemaVersion).toBe(8);
		expect(protocol.stages.length).toBeGreaterThan(0);

		// log summary for debugging
		console.log("Mock Protocol:");
		console.log("- Description:", protocol.description);
		console.log("- Number of stages:", protocol.stages.length);
		console.log("- Stage types:", protocol.stages.map((s) => s.type).join(", "));
	});

	it("generates different stage types", () => {
		const stageTypes = new Set(Array.from({ length: 10 }, () => stageSchema.generateMock().type));

		expect(stageTypes.size).toBeGreaterThan(1);
		console.log("Generated stage types:", Array.from(stageTypes));
	});

	it("saves mock protocol to file", () => {
		const protocol = ProtocolSchema.generateMock();
		const outputPath = path.join(__dirname, "mock-protocol.json");

		fs.writeFileSync(outputPath, JSON.stringify(protocol, null, 2));
		console.log(`Mock protocol saved to ${outputPath}`);
	});
});
