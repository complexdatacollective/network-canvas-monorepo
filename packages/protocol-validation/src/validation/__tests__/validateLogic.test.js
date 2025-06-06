import { describe, expect, it } from "vitest";
import { validateLogic } from "../validateLogic";
import invalidProtocol from "./invalidProtocol.json";

describe("validateLogic", () => {
	it("A well formed protocol will return an array of errors", () => {
		const logicErrors = validateLogic(invalidProtocol);
		expect(logicErrors).toMatchSnapshot();
	});

	it("It can handle undefined values in the protocol", () => {
		invalidProtocol.stages[0].skipLogic.filter.rules = undefined;

		expect(() => {
			validateLogic(invalidProtocol);
		}).not.toThrow();
	});
});
