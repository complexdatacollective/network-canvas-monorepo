import { describe, expect, it } from "vitest";
import type { RootState } from "~/ducks/modules/root";
import { getIsProtocolDirty } from "../protocol";

function makeState(pastLength: number) {
	return { activeProtocol: { past: new Array(pastLength).fill({}), present: {}, future: [] } };
}

describe("getIsProtocolDirty", () => {
	it("is false when there are no undo entries", () => {
		expect(getIsProtocolDirty(makeState(0) as unknown as RootState)).toBe(false);
	});

	it("is true when there are undo entries", () => {
		expect(getIsProtocolDirty(makeState(3) as unknown as RootState)).toBe(true);
	});
});
