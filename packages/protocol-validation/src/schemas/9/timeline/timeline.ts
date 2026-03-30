import { z } from "~/utils/zod-mock-extension";
import { entitySchema } from "./entity";

export const timelineSchema = z.strictObject({
	start: z.string(),
	entities: z.array(entitySchema).min(1),
});

export type Timeline = z.infer<typeof timelineSchema>;
