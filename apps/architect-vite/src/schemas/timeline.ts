import { z } from "zod";

// Base types
export const EntityId = z.string().min(1);
export const EntityType = z.enum(["Stage", "Branch", "Collection", "Start", "Finish"]);

// Interface types for stages
export const InterfaceType = z.enum([
	"Information",
	"EgoForm",
	"NameGenerator",
	"NameGeneratorQuickAdd",
	"NameGeneratorRoster",
	"Sociogram",
	"DyadCensus",
	"TieStrengthCensus",
	"OrdinalBin",
	"CategoricalBin",
	"Narrative",
	"AlterForm",
	"AlterEdgeForm",
	"Anonymisation",
	"OneToManyDyadCensus",
	"FamilyTreeCensus",
	"Geospatial",
]);

// Stage schema (regular interview stages)
const StageSchemaBase = z.object({
	id: EntityId,
	type: z.literal("Stage"),
	name: z.string().min(1),
	interfaceType: InterfaceType,
	target: EntityId,
});

export const StageSchema = StageSchemaBase;

// Start node schema (single entry point)
const StartSchemaBase = z.object({
	id: EntityId,
	type: z.literal("Start"),
	name: z.string().min(1),
	target: EntityId, // Must have exactly one target
});

export const StartSchema = StartSchemaBase;

// Finish node schema (single exit point)
const FinishSchemaBase = z.object({
	id: EntityId,
	type: z.literal("Finish"),
	name: z.string().min(1),
	// No target property - finish nodes don't point anywhere
});

export const FinishSchema = FinishSchemaBase;

// Branch schema with exit slots (conditions)
const BranchSchemaBase = z.object({
	id: EntityId,
	type: z.literal("Branch"),
	name: z.string().min(1),
	conditions: z.record(z.string().min(1), EntityId),
});

export const BranchSchema = BranchSchemaBase.refine((branch) => Object.keys(branch.conditions).length >= 2, {
	message: "Branch must have at least two exit slots (conditions)",
});

// Collection schema - now a nested Timeline with target property
export const CollectionSchema = z.object({
	id: EntityId,
	type: z.literal("Collection"),
	name: z.string().min(1),
	target: EntityId, // Where this collection connects to in parent timeline
	timeline: z.lazy(() => TimelineSchema), // Nested timeline with its own start/finish
});

// Union type for any entity
export const EntitySchema = z.discriminatedUnion("type", [
	StageSchemaBase,
	BranchSchemaBase,
	CollectionSchema,
	StartSchemaBase,
	FinishSchemaBase,
]);

// Timeline schema
export const TimelineSchema = z
	.object({
		entities: z.array(EntitySchema),
	})
	.refine(
		(timeline) => {
			const entityIds = new Set(timeline.entities.map((e) => e.id));
			return entityIds.size === timeline.entities.length;
		},
		{ message: "All entity IDs must be unique" },
	)
	.refine(
		(timeline) => {
			// Exactly one start node
			const startNodes = timeline.entities.filter((e) => e.type === "Start");
			return startNodes.length === 1;
		},
		{ message: "Timeline must have exactly one start node" },
	)
	.refine(
		(timeline) => {
			// Exactly one finish node
			const finishNodes = timeline.entities.filter((e) => e.type === "Finish");
			return finishNodes.length === 1;
		},
		{ message: "Timeline must have exactly one finish node" },
	)
	.refine(
		(timeline) => {
			// Validate all referenced IDs exist
			const entityIds = new Set(timeline.entities.map((e) => e.id));

			for (const entity of timeline.entities) {
				if ((entity.type === "Stage" || entity.type === "Start") && entity.target) {
					if (!entityIds.has(entity.target)) {
						return false;
					}
				} else if (entity.type === "Branch") {
					for (const targetId of Object.values(entity.conditions)) {
						if (!entityIds.has(targetId)) {
							return false;
						}
					}
				} else if (entity.type === "Collection") {
					// Collections now have target property pointing to entities in parent timeline
					if (!entityIds.has(entity.target)) {
						return false;
					}
				}
				// Finish nodes don't have targets, so no validation needed
			}
			return true;
		},
		{ message: "All referenced entity IDs must exist" },
	);

// Type exports
export type Stage = z.infer<typeof StageSchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Start = z.infer<typeof StartSchema>;
export type Finish = z.infer<typeof FinishSchema>;

export type Entity = z.infer<typeof EntitySchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
export type InterfaceType = z.infer<typeof InterfaceType>;
