import {
	egoProperty,
	entityAttributesProperty,
	entityPrimaryKeyProperty,
	ncUUIDProperty,
	nodeExportIDProperty,
} from "@codaco/shared-consts";
import { beforeEach, describe, expect, it } from "vitest";
import { mockCodebook, mockExportOptions } from "../../../__tests__/mockObjects";
import { makeWriteableStream } from "../../../__tests__/setupTestEnv";
import { AttributeListFormatter, asAttributeList, toCSVStream } from "../attribute-list";

const node = {
	[egoProperty]: 123,
	[entityPrimaryKeyProperty]: 1,
	[entityAttributesProperty]: {
		name: "Jane",
	},
};

const baseCSVAttributes = [nodeExportIDProperty, egoProperty, ncUUIDProperty];

describe("asAttributeList", () => {
	it("transforms a network to nodes", () => {
		const network = { nodes: [{ id: 1 }], edges: [] };
		expect(asAttributeList(network as never, mockCodebook, mockExportOptions)).toEqual(network.nodes);
	});
});

describe("toCSVStream", () => {
	let writable: ReturnType<typeof makeWriteableStream>;
	let testNode: typeof node;

	beforeEach(() => {
		writable = makeWriteableStream();
		testNode = node;
	});

	it("writes a simple CSV", async () => {
		toCSVStream([testNode] as never, writable);

		const csv = await writable.asString();

		const result = [...baseCSVAttributes, "name\r\n", 123, 1, "Jane\r\n"].join(",");
		expect(csv).toEqual(result);
	});

	it("escapes quotes", async () => {
		toCSVStream(
			[
				{
					...testNode,
					[entityAttributesProperty]: {
						name: '"Nicky"',
					},
				},
			] as never,
			writable,
		);

		const csv = await writable.asString();

		const result = [...baseCSVAttributes, "name\r\n", 123, 1, '"""Nicky"""\r\n'].join(",");
		expect(csv).toEqual(result);
	});

	it("escapes quotes in attr names", async () => {
		toCSVStream(
			[
				{
					...testNode,
					[entityAttributesProperty]: {
						'"quoted"': 1,
					},
				},
			] as never,
			writable,
		);

		const csv = await writable.asString();

		const result = [...baseCSVAttributes, '"""quoted"""\r\n', 123, 1, "1\r\n"].join(",");
		expect(csv).toEqual(result);
	});

	it("stringifies and quotes objects", async () => {
		toCSVStream(
			[
				{
					...testNode,
					[entityAttributesProperty]: {
						location: { x: 1, y: 1 },
					},
				},
			] as never,
			writable,
		);
		const csv = await writable.asString();
		const result = [...baseCSVAttributes, "location\r\n", 123, 1, '"{""x"":1,""y"":1}"\r\n'].join(",");
		expect(csv).toEqual(result);
	});

	it("exports undefined values as blank", async () => {
		toCSVStream(
			[
				{
					...testNode,
					[entityAttributesProperty]: {
						prop: undefined,
					},
				},
			] as never,
			writable,
		);

		const csv = await writable.asString();

		const result = [...baseCSVAttributes, "prop\r\n", 123, 1, "\r\n"].join(",");
		expect(csv).toEqual(result);
	});

	it("exports null values as blank", async () => {
		toCSVStream(
			[
				{
					...testNode,
					[entityAttributesProperty]: {
						prop: null,
					},
				},
			] as never,
			writable,
		);

		const csv = await writable.asString();

		const result = [...baseCSVAttributes, "prop\r\n", 123, 1, "\r\n"].join(",");
		expect(csv).toEqual(result);
	});

	it('exports `false` values as "false"', async () => {
		toCSVStream(
			[
				{
					...testNode,
					[entityAttributesProperty]: {
						prop: false,
					},
				},
			] as never,
			writable,
		);

		const csv = await writable.asString();

		const result = [...baseCSVAttributes, "prop\r\n", 123, 1, "false\r\n"].join(",");
		expect(csv).toEqual(result);
	});
});

describe("AttributeListFormatter", () => {
	let writable: ReturnType<typeof makeWriteableStream>;

	beforeEach(() => {
		writable = makeWriteableStream();
	});

	it("writeToStream returns an abort controller", () => {
		const formatter = new AttributeListFormatter({} as never, mockCodebook, mockExportOptions);
		const controller = formatter.writeToStream(writable);
		expect(controller.abort).toBeInstanceOf(Function);
	});
});
