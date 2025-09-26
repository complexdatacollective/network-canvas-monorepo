import { faker } from "@faker-js/faker";
import { getAssetId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { geospatialPromptSchema, NodeStageSubjectSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

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
	tokenAssetId: z.string().generateMock(() => getAssetId(0)),
	style: styleOptions.generateMock(() => faker.helpers.arrayElement(mapboxStyleOptions).value),
	center: z.tuple([z.number(), z.number()]),
	initialZoom: z
		.number()
		.min(0, { message: "Zoom must be at least 0" })
		.max(22, { message: "Zoom must be less than or equal to 22" })
		.generateMock(() => faker.number.int({ min: 0, max: 22 })),
	dataSourceAssetId: z.string().generateMock(() => getAssetId(1)),
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

export const geospatialStage = baseStageSchema.extend({
	type: z.literal("Geospatial"),
	subject: NodeStageSubjectSchema,
	filter: FilterSchema.optional(),
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
});
