import { describe, expect, it } from "vitest";

import type { RootState } from "~/ducks/modules/root";
import { getSociogramTypeUsageIndex, getTypeUsageIndex, makeGetDeleteImpact, makeGetUsageForType } from "../usage";

const mockStateWithProtocol = {
	activeProtocol: {
		present: {
			codebook: {
				node: {
					bar: {
						variables: {
							alpha: { name: "ALPHA", type: "text" },
							bravo: { name: "BRAVO", type: "text" },
							charlie: { name: "CHARLIE", type: "location" },
						},
					},
				},
			},
			timeline: {
				start: "bazz",
				entities: [
					{
						id: "bazz",
						type: "Stage",
						stageType: "NameGenerator",
						label: "Bazz",
						subject: { entity: "node", type: "foo" },
					},
					{
						id: "pip",
						type: "Stage",
						stageType: "NameGenerator",
						label: "Pip",
						subject: { entity: "node", type: "pop" },
					},
					{
						id: "buzz",
						type: "Stage",
						stageType: "NameGenerator",
						label: "Buzz",
						prompts: [
							{
								id: "fizz",
								subject: { entity: "node", type: "foo" },
							},
						],
					},
					{
						id: "foxtrot",
						type: "Stage",
						stageType: "NameGenerator",
						label: "Foxtrot",
						prompts: [
							{
								id: "golf",
								subject: { entity: "node", type: "foo" },
							},
							{
								id: "hotel",
								subject: { entity: "node", type: "pop" },
							},
						],
					},
					{
						id: "alpha",
						type: "Stage",
						stageType: "Sociogram",
						label: "Alpha",
						prompts: [
							{
								id: "bravo",
								edges: {
									creates: "charlie",
									display: ["delta", "echo"],
								},
							},
						],
					},
					{
						id: "mike",
						type: "Stage",
						stageType: "Sociogram",
						label: "Mike",
						prompts: [
							{
								id: "oscar",
							},
						],
					},
				],
			},
			forms: {
				bar: {
					entity: "node",
					type: "foo",
				},
			},
		},
	},
};

describe("usage selectors", () => {
	it("getSociogramTypeUsageIndex()", () => {
		const result = getSociogramTypeUsageIndex(mockStateWithProtocol as unknown as RootState);

		expect(result).toEqual([
			{
				owner: { promptId: "bravo", stageId: "alpha", type: "prompt" },
				subject: { entity: "edge", type: "charlie" },
			},
			{
				owner: { promptId: "bravo", stageId: "alpha", type: "prompt" },
				subject: { entity: "edge", type: "delta" },
			},
			{
				owner: { promptId: "bravo", stageId: "alpha", type: "prompt" },
				subject: { entity: "edge", type: "echo" },
			},
		]);
	});

	it("getTypeUsageIndex()", () => {
		const result = getTypeUsageIndex(mockStateWithProtocol as unknown as RootState);

		expect(result).toEqual([
			{
				owner: { id: "bar", type: "form" },
				subject: { entity: "node", type: "foo" },
			},
			{
				owner: { id: "bazz", type: "stage" },
				subject: { entity: "node", type: "foo" },
			},
			{
				owner: { id: "pip", type: "stage" },
				subject: { entity: "node", type: "pop" },
			},
			{
				owner: { promptId: "fizz", stageId: "buzz", type: "prompt" },
				subject: { entity: "node", type: "foo" },
			},
			{
				owner: { promptId: "golf", stageId: "foxtrot", type: "prompt" },
				subject: { entity: "node", type: "foo" },
			},
			{
				owner: { promptId: "hotel", stageId: "foxtrot", type: "prompt" },
				subject: { entity: "node", type: "pop" },
			},
			{
				owner: { promptId: "bravo", stageId: "alpha", type: "prompt" },
				subject: { entity: "edge", type: "charlie" },
			},
			{
				owner: { promptId: "bravo", stageId: "alpha", type: "prompt" },
				subject: { entity: "edge", type: "delta" },
			},
			{
				owner: { promptId: "bravo", stageId: "alpha", type: "prompt" },
				subject: { entity: "edge", type: "echo" },
			},
		]);
	});

	describe("makeGetUsageForType()", () => {
		const getUsageForType = makeGetUsageForType(mockStateWithProtocol as unknown as RootState);

		it('returns correct results for ["node", "pop"]', () => {
			const result = getUsageForType("node", "pop");

			expect(result).toEqual([
				{
					owner: { id: "pip", type: "stage" },
					subject: { entity: "node", type: "pop" },
				},
				{
					owner: { promptId: "hotel", stageId: "foxtrot", type: "prompt" },
					subject: { entity: "node", type: "pop" },
				},
			]);
		});

		it('returns correct results for ["node", "foo"]', () => {
			const result = getUsageForType("node", "foo");

			expect(result).toEqual([
				{
					owner: { id: "bar", type: "form" },
					subject: { entity: "node", type: "foo" },
				},
				{
					owner: { id: "bazz", type: "stage" },
					subject: { entity: "node", type: "foo" },
				},
				{
					owner: { promptId: "fizz", stageId: "buzz", type: "prompt" },
					subject: { entity: "node", type: "foo" },
				},
				{
					owner: { promptId: "golf", stageId: "foxtrot", type: "prompt" },
					subject: { entity: "node", type: "foo" },
				},
			]);
		});
	});

	it('makeGetDeleteImpact("node", "foo")', () => {
		const getDeleteImpact = makeGetDeleteImpact(mockStateWithProtocol as unknown as RootState);

		const result = getDeleteImpact("node", "foo");

		expect(result).toEqual([
			{ id: "bar", type: "form" },
			{ id: "bazz", type: "stage" },
			{ id: "buzz", type: "stage" },
			{ promptId: "golf", stageId: "foxtrot", type: "prompt" },
		]);
	});
});
