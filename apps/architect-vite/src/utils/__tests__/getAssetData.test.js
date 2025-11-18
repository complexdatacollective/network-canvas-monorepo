import fs from "fs-extra";
import { describe, expect, it, vi } from "vitest";
import getAssetData from "../getAssetData";

const mockData = {
	nodes: [],
	edges: [],
};

fs.readFile = vi.fn((_path, _format, resolve) => resolve(null, JSON.stringify(mockData)));

describe("getAssetData", () => {
	it("can load a json network", async () => {
		const source = "/dev/null/myMockSource.json";
		const type = "network";

		const data = await getAssetData(source, type);
		expect(data).toEqual(mockData);
	});

	it("it caches responses", async () => {
		const source = "/dev/null/myMockSource.json";
		const type = "network";

		const results = await Promise.all([getAssetData(source, type), getAssetData(source, type)]);

		const isSameObject = results.every((result, _index, all) => result === all[0]);

		expect(isSameObject).toBe(true);
	});
});
