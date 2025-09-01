import { z } from "zod";

const baseAssetSchema = z.object({
	id: z.string().optional(),
	name: z.string(),
});

const videoAudioAssetSchema = baseAssetSchema.extend({
	type: z.enum(["video", "audio"]),
	source: z.string(),
	loop: z.boolean().optional(),
});

const fileAssetSchema = baseAssetSchema.extend({
	type: z.enum(["image", "network", "geojson"]),
	source: z.string(),
});

const apiKeyAssetSchema = baseAssetSchema.extend({
	type: z.enum(["apikey"]),
	value: z.string(),
});

export const assetSchema = z.discriminatedUnion("type", [fileAssetSchema, apiKeyAssetSchema, videoAudioAssetSchema]);

export type Asset = z.infer<typeof assetSchema>;
