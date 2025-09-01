import { z } from "zod";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { geospatialPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
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
	tokenAssetId: z.string(),
	style: styleOptions,
	center: z.tuple([z.number(), z.number()]),
	initialZoom: z
		.number()
		.min(0, { message: "Zoom must be at least 0" })
		.max(22, { message: "Zoom must be less than or equal to 22" }),
	dataSourceAssetId: z.string(),
	color: z.string(),
	targetFeatureProperty: z.string(), // property of geojson to select
});

export type MapOptions = z.infer<typeof mapOptions>;

export const geospatialStage = baseStageSchema.extend({
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
});
