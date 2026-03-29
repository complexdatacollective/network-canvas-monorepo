import { z } from "~/utils/zod-mock-extension";
import type { BranchEntity } from "./branch";
import { branchEntitySchema } from "./branch";

type StageEntityBase = { id: string; type: "Stage"; stageType: string; label: string; [key: string]: unknown };

type CollectionEntityType = {
	id: string;
	type: "Collection";
	name: string;
	children: EntityType[];
};

type EntityType = StageEntityBase | BranchEntity | CollectionEntityType;

const permissiveStageSchema = z
	.object({
		id: z.string(),
		type: z.literal("Stage"),
		stageType: z.string(),
		label: z.string(),
	})
	.passthrough();

export const collectionEntitySchema: z.ZodType<CollectionEntityType> = z.lazy(() =>
	z.strictObject({
		id: z.string(),
		type: z.literal("Collection"),
		name: z.string(),
		children: z.array(entitySchema).min(1),
	}),
);

export const entitySchema: z.ZodType<EntityType> = z.lazy(() =>
	z.union([permissiveStageSchema, collectionEntitySchema, branchEntitySchema]),
);
