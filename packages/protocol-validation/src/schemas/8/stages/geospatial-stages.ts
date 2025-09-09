import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { geospatialPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => crypto.randomUUID()),
	})
	.strict();

const mapboxStyleOptions = [
	{ label: "Standard", value: "mapbox://styles/mapbox/standard" },
	{
		label: "Standard Satellite",
		value: "mapbox://styles/mapbox/standard-satellite",
	},
	{ label: "Streets", value: "mapbox://styles/mapbox/streets-v12" },
	{ label: "Outdoors", value: "mapbox://styles/mapbox/outdoors-v12" },
	{ label: "Light", value: "mapbox://styles/mapbox/light-v11" },
	{ label: "Dark", value: "mapbox://styles/mapbox/dark-v11" },
	{ label: "Satellite", value: "mapbox://styles/mapbox/satellite-v9" },
	{
		label: "Satellite Streets",
		value: "mapbox://styles/mapbox/satellite-streets-v12",
	},
	{
		label: "Navigation Day",
		value: "mapbox://styles/mapbox/navigation-day-v1",
	},
	{
		label: "Navigation Night",
		value: "mapbox://styles/mapbox/navigation-night-v1",
	},
];

const styleOptions = z.enum(mapboxStyleOptions.map((option) => option.value) as [string, ...string[]]);

const mapOptions = z.object({
	tokenAssetId: z.string().generateMock(() => crypto.randomUUID()),
	style: styleOptions.generateMock(() => faker.helpers.arrayElement(mapboxStyleOptions).value),
	center: z.tuple([z.number(), z.number()]),
	initialZoom: z
		.number()
		.min(0, { message: "Zoom must be at least 0" })
		.max(22, { message: "Zoom must be less than or equal to 22" })
		.generateMock(() => faker.helpers.arrayElement([10, 12, 14, 16])),
	dataSourceAssetId: z.string().generateMock(() => crypto.randomUUID()),
	color: z
		.string()
		.generateMock(() =>
			faker.helpers.arrayElement([
				"node-color-seq-1",
				"node-color-seq-2",
				"node-color-seq-3",
				"node-color-seq-4",
				"node-color-seq-5",
			]),
		),
	targetFeatureProperty: z
		.string()
		.generateMock(() => faker.helpers.arrayElement(["name", "location_type", "category"])), // property of geojson to select
});

export type MapOptions = z.infer<typeof mapOptions>;

export const geospatialStage = baseStageSchema
	.extend({
		type: z.literal("Geospatial"),
		subject: NodeStageSubjectSchema,
		mapOptions: mapOptions,
		prompts: z
			.array(geospatialPromptSchema)
			.min(1)
			.superRefine((prompts, ctx) => {
				// Check for duplicate prompt IDs
				const duplicatePromptId = findDuplicateId(prompts);
				if (duplicatePromptId) {
					ctx.addIssue({
						code: "custom" as const,
						message: `Prompts contain duplicate ID "${duplicatePromptId}"`,
						path: [],
					});
				}
			}),
	})
	.generateMock((base) => ({
		...base,
		type: "Geospatial",
		mapOptions: {
			tokenAssetId: crypto.randomUUID(),
			style: "mapbox://styles/mapbox/streets-v12",
			center: [-74.006, 40.7128],
			initialZoom: 12,
			dataSourceAssetId: crypto.randomUUID(),
			color: "node-color-seq-1",
			targetFeatureProperty: "name",
		},
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"Where does this person live?",
					"Please mark where this person works",
					"Select the geographic location for each person.",
				]),
				variable: crypto.randomUUID(),
			},
		],
	}));
