import {
	BranchSchema,
	CollectionSchema,
	EntitySchema,
	FinishSchema,
	StageSchema,
	StartSchema,
	TimelineSchema,
	type Branch,
	type Collection,
	type Entity,
	type Finish,
	type InterfaceType,
	type Stage,
	type Start,
	type Timeline,
} from "~/schemas/timeline";

// Export schemas for external use
export { BranchSchema, CollectionSchema, EntitySchema, FinishSchema, StageSchema, StartSchema, TimelineSchema };

// Re-export types from schema
export type {
	Branch,
	Collection,
	Entity,
	Finish,
	InterfaceType,
	Stage,
	Start,
	Timeline,
} from "~/schemas/timeline";

// Utility function to generate unique IDs
export const generateId = (): string => {
	return Math.random().toString(36).substring(2, 16);
};

// Utility function to create a valid stage
export const createStage = (name: string, interfaceType: InterfaceType, target: string): Stage => {
	const id = generateId();
	const stage: Stage = {
		id,
		type: "Stage",
		name,
		interfaceType,
		target,
	};

	// Validate the stage
	const result = StageSchema.safeParse(stage);
	if (!result.success) {
		throw new Error(`Invalid stage configuration: ${result.error.message}`);
	}

	return result.data;
};

// Utility function to create a valid start node
export const createStart = (name: string, target: string): Start => {
	const id = generateId();
	const start: Start = {
		id,
		type: "Start",
		name,
		target,
	};

	// Validate the start node
	const result = StartSchema.safeParse(start);
	if (!result.success) {
		throw new Error(`Invalid start configuration: ${result.error.message}`);
	}

	return result.data;
};

// Utility function to create a valid finish node
export const createFinish = (name: string): Finish => {
	const id = generateId();
	const finish: Finish = {
		id,
		type: "Finish",
		name,
	};

	// Validate the finish node
	const result = FinishSchema.safeParse(finish);
	if (!result.success) {
		throw new Error(`Invalid finish configuration: ${result.error.message}`);
	}

	return result.data;
};

// Utility function to create a valid branch
export const createBranch = (name: string, targets: string[]): Branch => {
	const id = generateId();
	const branch: Branch = {
		id,
		type: "Branch",
		name,
		targets,
	};

	return branch;
};

// Utility function to create a valid collection
export const createCollection = (name: string, target: string, timeline: Timeline): Collection => {
	const id = generateId();
	const collection: Collection = {
		id,
		type: "Collection",
		name,
		target,
		timeline,
	};

	return collection;
};

// Utility function to create a minimal valid timeline
export const createValidTimeline = (entities: Entity[]): Timeline => {
	// Validate the timeline
	const result = TimelineSchema.safeParse(entities);
	if (!result.success) {
		throw new Error(`Invalid timeline: ${result.error.message}`);
	}

	return result.data;
};

// Utility function to validate a timeline object
export const validateTimeline = (
	timeline: unknown,
): { success: true; data: Timeline } | { success: false; errors: string[] } => {
	const result = TimelineSchema.safeParse(timeline);

	if (result.success) {
		return { success: true, data: result.data };
	}
	return {
		success: false,
		errors: result.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`),
	};
};

// Utility function to check if a timeline is valid
export const isValidTimeline = (timeline: unknown): timeline is Timeline => {
	return TimelineSchema.safeParse(timeline).success;
};

// Pool of possible stage names for random generation
const _STAGE_NAMES = [
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
];

const _BRANCH_NAMES = [
	"Decision Point",
	"Branch Point",
	"Path Split",
	"Route Choice",
	"Flow Division",
	"Stage Fork",
	"Protocol Branch",
	"Path Divergence",
];

const _COLLECTION_NAMES = [
	"Demographics Collection",
	"Network Questions",
	"Relationship Assessment",
	"Core Interview",
	"Optional Modules",
	"Validation Steps",
	"Data Quality Checks",
	"Closing Questions",
];

// Utility function to get a random item from an array
const _getRandomItem = <T>(array: T[]): T => {
	if (array.length === 0) {
		throw new Error("Cannot get random item from empty array");
	}
	const item = array[Math.floor(Math.random() * array.length)];
	if (item === undefined) {
		throw new Error("Selected item is undefined");
	}
	return item;
};

// Create a sample timeline that demonstrates all features
export const createSampleTimeline = (): Timeline => {
	// Create all entities with proper IDs first
	const finishId = generateId();
	const startId = generateId();

	// Main timeline stages
	const consentStageId = generateId();
	const egoFormStageId = generateId();
	const backgroundStageId = generateId();
	const coreNetworkCollectionId = generateId();
	const networkAnalysisCollectionId = generateId();
	const relationshipCollectionId = generateId();
	const finalStepsCollectionId = generateId();
	const validationStageId = generateId();

	// Core Network Collection internal entities
	const coreNetworkStartId = generateId();
	const coreNetworkFinishId = generateId();
	const nameGen1Id = generateId();
	const branch1Id = generateId();
	const nameGen2Id = generateId();
	const nameGenRosterId = generateId();
	const nameGen3Id = generateId();
	const alterFormId = generateId();

	// Network Analysis Collection internal entities
	const networkAnalysisStartId = generateId();
	const networkAnalysisFinishId = generateId();
	const tieStrengthId = generateId();
	const branch2Id = generateId();
	const sociogramId = generateId();
	const dyadCensusId = generateId();
	const categoricalBinId = generateId();
	const geospatialId = generateId();
	const familyTreeId = generateId();

	// Relationship Assessment Collection internal entities
	const relationshipStartId = generateId();
	const relationshipFinishId = generateId();
	const ordinalBinId = generateId();
	const alterEdgeFormId = generateId();
	const oneToManyId = generateId();

	// Final Steps Collection internal entities
	const finalStartId = generateId();
	const finalFinishId = generateId();
	const narrativeId = generateId();
	const dataQualityId = generateId();
	const anonymisationId = generateId();
	const feedbackId = generateId();

	// Create utility function to override ID
	const withId = <T extends { id: string }>(entity: T, newId: string): T => ({
		...entity,
		id: newId,
	});

	// Create Core Network Collection Timeline with more stages
	const coreNetworkTimeline = [
		withId(createStart("Core Network Start", nameGen1Id), coreNetworkStartId),
		withId(createStage("Core Network Generator", "NameGenerator", branch1Id), nameGen1Id),
		{
			id: branch1Id,
			type: "Branch",
			name: "Network Collection Method",
			conditions: {
				"Quick Add": nameGen2Id,
				"Roster Method": nameGenRosterId,
				"Mixed Method": nameGen3Id,
			},
		} as Branch,
		withId(createStage("Quick Add Names", "NameGeneratorQuickAdd", alterFormId), nameGen2Id),
		withId(createStage("Roster Selection", "NameGeneratorRoster", alterFormId), nameGenRosterId),
		withId(createStage("Additional Names", "NameGenerator", alterFormId), nameGen3Id),
		withId(createStage("Alter Details", "AlterForm", coreNetworkFinishId), alterFormId),
		withId(createFinish("Core Network Complete"), coreNetworkFinishId),
	];

	// Create Network Analysis Collection Timeline with more stages
	const networkAnalysisTimeline = [
		withId(createStart("Network Analysis Start", tieStrengthId), networkAnalysisStartId),
		withId(createStage("Relationship Strength", "TieStrengthCensus", branch2Id), tieStrengthId),
		{
			id: branch2Id,
			type: "Branch",
			name: "Analysis Type",
			conditions: {
				"Visual Analysis": sociogramId,
				"Detailed Census": dyadCensusId,
				"Rating Only": categoricalBinId,
				"Location Data": geospatialId,
				"Family Networks": familyTreeId,
			},
		} as Branch,
		withId(createStage("Network Visualization", "Sociogram", networkAnalysisFinishId), sociogramId),
		withId(createStage("Relationship Details", "DyadCensus", networkAnalysisFinishId), dyadCensusId),
		withId(createStage("Relationship Categories", "CategoricalBin", networkAnalysisFinishId), categoricalBinId),
		withId(createStage("Geographic Mapping", "Geospatial", networkAnalysisFinishId), geospatialId),
		withId(createStage("Family Tree Analysis", "FamilyTreeCensus", networkAnalysisFinishId), familyTreeId),
		withId(createFinish("Network Analysis Complete"), networkAnalysisFinishId),
	];

	// Create Relationship Assessment Collection Timeline with more stages
	const relationshipTimeline = [
		withId(createStart("Relationship Start", ordinalBinId), relationshipStartId),
		withId(createStage("Closeness Rating", "OrdinalBin", alterEdgeFormId), ordinalBinId),
		withId(createStage("Relationship Details", "AlterEdgeForm", oneToManyId), alterEdgeFormId),
		withId(createStage("Group Relationships", "OneToManyDyadCensus", relationshipFinishId), oneToManyId),
		withId(createFinish("Relationship Complete"), relationshipFinishId),
	];

	// Create Final Steps Collection Timeline with more stages
	const finalStepsTimeline = [
		withId(createStart("Final Steps Start", narrativeId), finalStartId),
		withId(createStage("Personal Story", "Narrative", dataQualityId), narrativeId),
		withId(createStage("Data Quality Check", "Information", feedbackId), dataQualityId),
		withId(createStage("Feedback Form", "EgoForm", anonymisationId), feedbackId),
		withId(createStage("Data Privacy", "Anonymisation", finalFinishId), anonymisationId),
		withId(createFinish("Final Steps Complete"), finalFinishId),
	];

	// Now create main timeline entities with additional stages
	const entities: Entity[] = [
		// Start node
		withId(createStart("Welcome", consentStageId), startId),

		// More main timeline stages
		withId(createStage("Consent & Information", "Information", egoFormStageId), consentStageId),
		withId(createStage("Demographics", "EgoForm", backgroundStageId), egoFormStageId),
		withId(createStage("Background Questions", "Information", coreNetworkCollectionId), backgroundStageId),

		// Collections as nested timelines
		withId(
			createCollection("Core Network Module", networkAnalysisCollectionId, coreNetworkTimeline),
			coreNetworkCollectionId,
		),
		withId(
			createCollection("Network Analysis", relationshipCollectionId, networkAnalysisTimeline),
			networkAnalysisCollectionId,
		),
		withId(
			createCollection("Relationship Assessment", finalStepsCollectionId, relationshipTimeline),
			relationshipCollectionId,
		),
		withId(createCollection("Final Steps", validationStageId, finalStepsTimeline), finalStepsCollectionId),

		// Additional final stage
		withId(createStage("Data Validation", "Information", finishId), validationStageId),

		// Finish node
		withId(createFinish("Interview Complete"), finishId),
	];

	return createValidTimeline(entities);
};
// Create a simple static timeline for testing and debugging layout issues
export const testTimeline: Timeline = [
	// Start node
	{
		id: "start-1",
		type: "Start",
		name: "Welcome",
		target: "stage-1",
	},

	// Individual stages at beginning
	{
		id: "stage-1",
		type: "Stage",
		name: "Consent & Information",
		interfaceType: "Information",
		target: "stage-2",
	},

	{
		id: "stage-2",
		type: "Stage",
		name: "Demographics",
		interfaceType: "EgoForm",
		target: "branch-1",
	},

	// Branch outside of collection
	{
		id: "branch-1",
		type: "Branch",
		name: "Interview Path",
		targets: ["stage-3", "stage-4"],
	},

	// More individual stages
	{
		id: "stage-3",
		type: "Stage",
		name: "Background Questions",
		interfaceType: "Information",
		target: "collection-1",
	},

	{
		id: "stage-4",
		type: "Stage",
		name: "Extended Background",
		interfaceType: "EgoForm",
		target: "collection-1",
	},

	// First collection - coherent network data collection unit
	{
		id: "collection-1",
		type: "Collection",
		name: "Network Data Collection",
		target: "stage-5",
		children: [
			{
				id: "coll1-stage-1",
				type: "Stage",
				name: "Name Generator",
				interfaceType: "NameGenerator",
				target: "coll1-branch",
			},
			{
				id: "coll1-branch",
				type: "Branch",
				name: "Collection Method",
				targets: ["coll1-stage-2", "coll1-stage-3", "coll1-stage-4"],
			},
			{
				id: "coll1-stage-2",
				type: "Stage",
				name: "Quick Add Names",
				interfaceType: "NameGeneratorQuickAdd",
				target: "coll1-stage-5",
			},
			{
				id: "coll1-stage-3",
				type: "Stage",
				name: "Roster Selection",
				interfaceType: "NameGeneratorRoster",
				target: "coll1-stage-5",
			},
			{
				id: "coll1-stage-4",
				type: "Stage",
				name: "Additional Names",
				interfaceType: "NameGenerator",
				target: "coll1-stage-5",
			},
			{
				id: "coll1-stage-5",
				type: "Stage",
				name: "Alter Details",
				interfaceType: "AlterForm",
				target: "collection-1", // Points to the collection itself to exit
			},
		],
	},
	// Individual stage between collections
	{
		id: "stage-5",
		type: "Stage",
		name: "Review Network",
		interfaceType: "Information",
		target: "collection-2",
	},

	// Second collection - coherent relationship analysis unit
	{
		id: "collection-2",
		type: "Collection",
		name: "Relationship Analysis",
		target: "stage-6",
		children: [
			{
				id: "coll2-stage-1",
				type: "Stage",
				name: "Tie Strength",
				interfaceType: "TieStrengthCensus",
				target: "coll2-stage-2",
			},
			{
				id: "coll2-stage-2",
				type: "Stage",
				name: "Network Visualization",
				interfaceType: "Sociogram",
				target: "coll2-stage-3",
			},
			{
				id: "coll2-stage-3",
				type: "Stage",
				name: "Relationship Details",
				interfaceType: "DyadCensus",
				target: "collection-2", // Points to the collection itself to exit
			},
		],
	},

	// More individual stages at end
	{
		id: "stage-6",
		type: "Stage",
		name: "Additional Questions",
		interfaceType: "EgoForm",
		target: "stage-7",
	},

	{
		id: "stage-7",
		type: "Stage",
		name: "Data Validation",
		interfaceType: "Information",
		target: "finish-1",
	},

	// Finish node
	{
		id: "finish-1",
		type: "Finish",
		name: "Interview Complete",
	},
];

// Helper function to find an entity by ID
export const findEntityById = (timeline: Timeline, id: string): Entity | undefined => {
	return timeline.find((entity) => entity.id === id);
};

// Helper function to get all connections in the timeline
export type Connection = {
	from: string;
	to: string;
	type: "stage" | "branch" | "collection" | "start";
	label?: string;
};

export const getConnections = (timeline: Timeline): Connection[] => {
	const connections: Connection[] = [];

	for (const entity of timeline) {
		if ((entity.type === "Stage" || entity.type === "Start") && entity.target) {
			connections.push({
				from: entity.id,
				to: entity.target,
				type: entity.type === "Start" ? "start" : "stage",
			});
		} else if (entity.type === "Branch") {
			for (const targetId of entity.targets) {
				connections.push({
					from: entity.id,
					to: targetId,
					type: "branch",
				});
			}
		} else if (entity.type === "Collection") {
			// Collections now connect to their target in the parent timeline
			connections.push({
				from: entity.id,
				to: entity.target,
				type: "collection",
			});
		}
		// Finish nodes don't have targets, so no validation needed
	}

	return connections;
};

// Helper to get the start entity in a collection's nested timeline
export const getCollectionStartEntity = (collection: Collection): Entity | undefined => {
	return collection.timeline.find((entity) => entity.type === "Start");
};

// Helper to get the finish entity in a collection's nested timeline
export const getCollectionFinishEntity = (collection: Collection): Entity | undefined => {
	return collection.timeline.find((entity) => entity.type === "Finish");
};

// Helper to check if an entity is inside a collection's nested timeline
export const isEntityInCollection = (timeline: Timeline, entityId: string): Collection | undefined => {
	for (const entity of timeline) {
		if (entity.type === "Collection") {
			const found = entity.timeline.find((e) => e.id === entityId);
			if (found) return entity;
		}
	}
	return undefined;
};

// Helper to get all entity IDs from a collection's nested timeline
export const expandCollectionEntities = (collection: Collection): string[] => {
	return collection.timeline.map((entity) => entity.id);
};
