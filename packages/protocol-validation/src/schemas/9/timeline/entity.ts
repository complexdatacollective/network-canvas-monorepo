import { z } from "~/utils/zod-mock-extension";
import { type StageEntity, stageEntitySchema } from "../stages";
import type { BranchEntity } from "./branch";
import { branchEntitySchema } from "./branch";

export type CollectionEntityType = {
	id: string;
	type: "Collection";
	name: string;
	children: Entity[];
};

export type Entity = StageEntity | BranchEntity | CollectionEntityType;

export const collectionEntitySchema: z.ZodType<CollectionEntityType> = z.lazy(() =>
	z.strictObject({
		id: z.string(),
		type: z.literal("Collection"),
		name: z.string(),
		children: z.array(entitySchema).min(1),
	}),
);

export const entitySchema: z.ZodType<Entity> = z.lazy(() =>
	z.union([stageEntitySchema, collectionEntitySchema, branchEntitySchema]),
);
