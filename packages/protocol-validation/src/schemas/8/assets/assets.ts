import { faker } from "@faker-js/faker";
import { z } from "~/utils/zod-mock-extension";

const fileNames = ["background.jpg", "logo.png", "map.geojson", "classmates.csv"];
const mockVideoNames = ["intro_video.mp4", "tutorial.mp4", "outro.mov"];
const mockAudioNames = ["01.mp3", "02.mp3", "03.mp3"];

const baseAssetSchema = z.object({
	id: z.string().optional(),
	name: z.string(),
});

const videoAudioAssetSchema = baseAssetSchema.extend({
	type: z.enum(["video", "audio"]),
	source: z.string().generateMock(() => faker.helpers.arrayElement([...mockVideoNames, ...mockAudioNames])),
	loop: z.boolean().optional(),
});

const fileAssetSchema = baseAssetSchema.extend({
	type: z.enum(["image", "network", "geojson"]),
	source: z.string().generateMock(() => faker.helpers.arrayElement(fileNames)),
});

const apiKeyAssetSchema = baseAssetSchema.extend({
	type: z.enum(["apikey"]),
	value: z.string(),
});

export const assetSchema = z.discriminatedUnion("type", [fileAssetSchema, apiKeyAssetSchema, videoAudioAssetSchema]);

export type Asset = z.infer<typeof assetSchema>;
