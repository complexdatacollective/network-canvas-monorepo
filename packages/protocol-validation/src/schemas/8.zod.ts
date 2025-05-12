import { VariableNameSchema } from "@codaco/shared-consts";
import { z } from "zod";

export const ComponentTypes = {
	Boolean: "Boolean",
	CheckboxGroup: "CheckboxGroup",
	Number: "Number",
	RadioGroup: "RadioGroup",
	Text: "Text",
	TextArea: "TextArea",
	Toggle: "Toggle",
	ToggleButtonGroup: "ToggleButtonGroup",
	Slider: "Slider",
	VisualAnalogScale: "VisualAnalogScale",
	LikertScale: "LikertScale",
	DatePicker: "DatePicker",
	RelativeDatePicker: "RelativeDatePicker",
} as const;

export const VariableTypes = {
	boolean: "boolean",
	text: "text",
	number: "number",
	datetime: "datetime",
	ordinal: "ordinal",
	scalar: "scalar",
	categorical: "categorical",
	layout: "layout",
	location: "location",
} as const;

export const ComponentTypesKeys = Object.keys(ComponentTypes) as (keyof typeof ComponentTypes)[];
export const VariableTypesKeys = Object.keys(VariableTypes) as (keyof typeof VariableTypes)[];
export type VariableType = (typeof VariableTypesKeys)[number];
export type ComponentType = (typeof ComponentTypesKeys)[number];

// Validation Schema
export const validations = {
	required: z.boolean().optional(),
	requiredAcceptsNull: z.boolean().optional(),
	minLength: z.number().int().optional(),
	maxLength: z.number().int().optional(),
	minValue: z.number().int().optional(),
	maxValue: z.number().int().optional(),
	minSelected: z.number().int().optional(),
	maxSelected: z.number().int().optional(),
	unique: z.boolean().optional(),
	differentFrom: z.string().optional(),
	sameAs: z.string().optional(),
	greaterThanVariable: z.string().optional(),
	lessThanVariable: z.string().optional(),
};

export const ValidationsSchema = z.object(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

// Validation keys
export type ValidationName = keyof Validation;

// Options Schema for categorical and ordinal variables
const categoricalOptionsSchema = z.array(
	z
		.object({
			label: z.string(),
			value: z.union([z.number().int(), z.string(), z.boolean()]),
		})
		.strict(),
);

export type VariableOptions = z.infer<typeof categoricalOptionsSchema>;

// Variable Schema
const baseVariableSchema = z
	.object({
		name: VariableNameSchema,
		encrypted: z.boolean().optional(),
	})
	.strict();

const numberVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.number),
	component: z.literal(ComponentTypes.Number).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			minValue: true,
			maxValue: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const scalarVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.scalar),
	component: z.literal(ComponentTypes.VisualAnalogScale).optional(),
	parameters: z
		.object({
			minLabel: z.string().optional(),
			maxLabel: z.string().optional(),
		})
		.optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			minValue: true,
			maxValue: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

export const DEFAULT_MIN_DATE = { years: 100 }; // DateTime.minus(DEFAULT_MIN_DATE);

export const DEFAULT_TYPE = "full";

export const DATE_FORMATS = {
	full: "yyyy-MM-dd",
	month: "yyyy-MM",
	year: "yyyy",
} as const;

// export just the keys
export const DATE_FORMATS_KEYS = Object.keys(DATE_FORMATS) as (keyof typeof DATE_FORMATS)[];

export type DateFormat = (typeof DATE_FORMATS_KEYS)[number];

const dateTimeDatePickerSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.datetime),
	component: z.literal(ComponentTypes.DatePicker).optional(),
	parameters: z
		.object({
			type: z.enum(["full", "month", "year"]).optional(),
			min: z.string().optional(),
			max: z.string().optional(),
		})
		.optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const dateTimeRelativeDatePickerSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.datetime),
	component: z.literal(ComponentTypes.RelativeDatePicker).optional(),
	parameters: z
		.object({
			before: z.number().int().optional(),
			after: z.number().int().optional(),
		})
		.optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const textVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.text),
	component: z.enum([ComponentTypes.Text, ComponentTypes.TextArea]).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			minLength: true,
			maxLength: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
});

const booleanOptionsSchema = z.array(
	z.object({
		label: z.string(),
		value: z.boolean(),
		negative: z.boolean().optional(),
	}),
);

const booleanBooleanVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.boolean),
	component: z.literal(ComponentTypes.Boolean).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
	options: booleanOptionsSchema.optional(), // This is different from the categorical options!
});

const booleanToggleVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.boolean),
	component: z.literal(ComponentTypes.Toggle).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
});
const ordinalVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.ordinal),
	component: z.enum([ComponentTypes.RadioGroup, ComponentTypes.LikertScale]).optional(),
	options: categoricalOptionsSchema,
	validation: z
		.object(validations)
		.pick({
			required: true,
			minSelected: true,
			maxSelected: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
});

const categoricalVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.categorical),
	component: z.enum([ComponentTypes.CheckboxGroup, ComponentTypes.ToggleButtonGroup]).optional(),
	options: categoricalOptionsSchema,
	validation: z
		.object(validations)
		.pick({
			required: true,
			minSelected: true,
			maxSelected: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
});

const layoutVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.layout),
});

const locationVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.location),
});

export const VariableSchema = z.union([
	textVariableSchema,
	numberVariableSchema,
	scalarVariableSchema,
	booleanBooleanVariableSchema,
	booleanToggleVariableSchema,
	ordinalVariableSchema,
	categoricalVariableSchema,
	dateTimeDatePickerSchema,
	dateTimeRelativeDatePickerSchema,
	layoutVariableSchema,
	locationVariableSchema,
]);

export type Variable = z.infer<typeof VariableSchema>;

type AllKeys<T> = T extends unknown ? keyof T : never;
export type VariablePropertyKey = AllKeys<Variable>;

type AllValues<T> = T extends unknown ? T[keyof T] : never;
export type VariablePropertyValue = AllValues<Variable>;

export const VariablesSchema = z.record(VariableNameSchema, VariableSchema);

export type Variables = z.infer<typeof VariablesSchema>;

// Node, Edge, and Ego Schemas
const NodeDefinitionSchema = z
	.object({
		name: z.string(),
		iconVariant: z.string().optional(),
		variables: VariablesSchema.optional(),
		color: z.string(),
	})
	.strict();

export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;
export type NodeDefinitionKeys = AllKeys<NodeDefinition>;

const EdgeDefinitionSchema = z
	.object({
		name: z.string(),
		color: z.string(),
		variables: VariablesSchema.optional(),
	})
	.strict();

export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;
export type EdgeDefinitionKeys = AllKeys<EdgeDefinition>;

const EgoDefinitionSchema = z
	.object({
		variables: VariablesSchema.optional(),
	})
	.strict();

export type EgoDefinition = z.infer<typeof EgoDefinitionSchema>;
export type EgoDefinitionKeys = AllKeys<EgoDefinition>;

const EntityDefinition = z.union([NodeDefinitionSchema, EdgeDefinitionSchema, EgoDefinitionSchema]);

export type EntityDefinition = z.infer<typeof EntityDefinition>;
export type EntityDefinitionKeys = AllKeys<EntityDefinition>;

// Codebook Schema
export const CodebookSchema = z
	.object({
		node: z.record(VariableNameSchema, NodeDefinitionSchema).optional(),
		edge: z.record(VariableNameSchema, EdgeDefinitionSchema).optional(),
		ego: EgoDefinitionSchema.optional(),
	})
	.strict();

export type Codebook = z.infer<typeof CodebookSchema>;

// Filter and Sort Options Schemas
export const filterRuleSchema = z
	.object({
		type: z.enum(["alter", "ego", "edge"]),
		id: z.string(),
		options: z
			.object({
				type: z.string().optional(),
				attribute: z.string().optional(),
				operator: z.enum([
					// TODO: this can be narrowed based on `type` and `attribute`
					"EXISTS",
					"NOT_EXISTS",
					"EXACTLY",
					"NOT",
					"GREATER_THAN",
					"GREATER_THAN_OR_EQUAL",
					"LESS_THAN",
					"LESS_THAN_OR_EQUAL",
					"INCLUDES",
					"EXCLUDES",
					"OPTIONS_GREATER_THAN",
					"OPTIONS_LESS_THAN",
					"OPTIONS_EQUALS",
					"OPTIONS_NOT_EQUALS",
					"CONTAINS",
					"DOES NOT CONTAIN",
				]),
				value: z.union([z.number().int(), z.string(), z.boolean(), z.array(z.any())]).optional(),
			})
			.strict(),
	})
	.strict();

export type FilterRule = z.infer<typeof filterRuleSchema>;

const singleFilterRuleSchema = z
	.object({
		join: z.enum(["OR", "AND"]).optional(),
		rules: z.array(filterRuleSchema).max(1),
	})
	.strict();

const multipleFilterRuleSchema = z
	.object({
		join: z.enum(["OR", "AND"]),
		rules: z.array(filterRuleSchema).min(2),
	})
	.strict();

export const FilterSchema = z.union([singleFilterRuleSchema, multipleFilterRuleSchema]);

export const SortOrderSchema = z.array(
	z.object({
		property: z.string(),
		direction: z.enum(["desc", "asc"]),
	}),
);

export type SortOrder = z.infer<typeof SortOrderSchema>;

// Stage and Related Schemas
const panelSchema = z.object({
	id: z.string(),
	title: z.string(),
	filter: FilterSchema.optional(),
	dataSource: z.union([z.string(), z.literal("existing")]),
});

export type Panel = z.infer<typeof panelSchema>;

const promptSchema = z
	.object({
		id: z.string(),
		text: z.string(),
	})
	.strict();

export type BasePrompt = z.infer<typeof promptSchema>;

const AdditionalAttributesSchema = z.array(z.object({ variable: VariableNameSchema, value: z.boolean() }));

export type AdditionalAttributes = z.infer<typeof AdditionalAttributesSchema>;

const nameGeneratorPromptSchema = promptSchema.extend({
	additionalAttributes: AdditionalAttributesSchema.optional(),
});

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
	})
	.strict();

const EdgeStageSubjectSchema = z
	.object({
		entity: z.literal("edge"),
		type: z.string(),
	})
	.strict();

const EgoStageSubjectSchema = z
	.object({
		entity: z.literal("ego"),
	})
	.strict();

export const StageSubjectSchema = z.union([EgoStageSubjectSchema, NodeStageSubjectSchema, EdgeStageSubjectSchema]);

export type StageSubject = z.infer<typeof StageSubjectSchema>;

const SkipLogicActionSchema = z.enum(["SHOW", "SKIP"]);
export type SkipLogicAction = z.infer<typeof SkipLogicActionSchema>;

export const SkipLogicSchema = z
	.object({
		action: SkipLogicActionSchema,
		filter: FilterSchema,
	})
	.strict();

export type SkipLogic = z.infer<typeof SkipLogicSchema>;

// Common schemas used across different stage types
const baseStageSchema = z.object({
	id: z.string(),
	interviewScript: z.string().optional(),
	label: z.string(),
	filter: FilterSchema.optional(),
	skipLogic: SkipLogicSchema.optional(),
	introductionPanel: z.object({ title: z.string(), text: z.string() }).strict().optional(),
});

const FormFieldSchema = z.object({ variable: z.string(), prompt: z.string() }).strict();

export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = z
	.object({
		title: z.string().optional(),
		fields: z.array(FormFieldSchema),
	})
	.strict();

export type Form = z.infer<typeof FormSchema>;

// Individual stage schemas
const egoFormStage = baseStageSchema.extend({
	type: z.literal("EgoForm"),
	form: FormSchema,
});

const alterFormStage = baseStageSchema.extend({
	type: z.literal("AlterForm"),
	subject: NodeStageSubjectSchema,
	form: FormSchema,
});

const alterEdgeFormStage = baseStageSchema.extend({
	type: z.literal("AlterEdgeForm"),
	subject: EdgeStageSubjectSchema,
	form: FormSchema,
});

const nameGeneratorStage = baseStageSchema.extend({
	type: z.literal("NameGenerator"),
	form: FormSchema,
	subject: NodeStageSubjectSchema,
	panels: z.array(panelSchema).optional(),
	prompts: z.array(nameGeneratorPromptSchema).min(1),
	behaviours: z
		.object({
			minNodes: z.number().int().optional(),
			maxNodes: z.number().int().optional(),
		})
		.optional(),
});

const nameGeneratorQuickAddStage = baseStageSchema.extend({
	type: z.literal("NameGeneratorQuickAdd"),
	quickAdd: z.string(),
	subject: NodeStageSubjectSchema,
	panels: z.array(panelSchema).optional(),
	prompts: z.array(nameGeneratorPromptSchema).min(1),
	behaviours: z
		.object({
			minNodes: z.number().int().optional(),
			maxNodes: z.number().int().optional(),
		})
		.optional(),
});

const nameGeneratorRosterStage = baseStageSchema.extend({
	type: z.literal("NameGeneratorRoster"),
	subject: NodeStageSubjectSchema,
	dataSource: z.string(),
	cardOptions: z
		.object({
			displayLabel: z.string().optional(),
			additionalProperties: z.array(z.object({ label: z.string(), variable: z.string() }).strict()).optional(),
		})
		.strict()
		.optional(),
	sortOptions: z
		.object({
			sortOrder: SortOrderSchema.optional(),
			sortableProperties: z.array(z.object({ label: z.string(), variable: z.string() }).strict()).optional(),
		})
		.optional(),
	searchOptions: z
		.object({
			fuzziness: z.number(),
			matchProperties: z.array(z.string()),
		})
		.strict()
		.optional(),
	prompts: z.array(nameGeneratorPromptSchema).min(1),
	behaviours: z
		.object({
			minNodes: z.number().int().optional(),
			maxNodes: z.number().int().optional(),
		})
		.optional(),
});

const sociogramStage = baseStageSchema.extend({
	type: z.literal("Sociogram"),
	subject: NodeStageSubjectSchema,
	background: z
		.object({
			image: z.string().optional(),
			concentricCircles: z.number().int().optional(),
			skewedTowardCenter: z.boolean().optional(),
		})
		.strict()
		.optional(),
	behaviours: z
		.object({
			automaticLayout: z.object({ enabled: z.boolean() }).strict().optional(),
		})
		.catchall(z.any())
		.optional(),
	prompts: z
		.array(
			promptSchema.extend({
				sortOrder: SortOrderSchema.optional(),
				layout: z
					.object({
						layoutVariable: z.string().optional(),
					})
					.optional(),
				edges: z
					.object({
						display: z.array(z.string()).optional(),
						create: z.string().optional(),
					})
					.optional(),
				highlight: z
					.object({
						allowHighlighting: z.boolean().optional(),
						variable: z.string().optional(),
					})
					.optional(),
			}),
		)
		.min(1),
});

const dyadCensusStage = baseStageSchema.extend({
	type: z.literal("DyadCensus"),
	subject: NodeStageSubjectSchema,
	prompts: z
		.array(
			promptSchema.extend({
				createEdge: z.string(),
			}),
		)
		.min(1),
});

const tieStrengthCensusStage = baseStageSchema.extend({
	type: z.literal("TieStrengthCensus"),
	subject: NodeStageSubjectSchema,
	prompts: z
		.array(
			promptSchema.extend({
				createEdge: z.string(),
				edgeVariable: z.string(),
				negativeLabel: z.string(),
			}),
		)
		.min(1),
});

const ordinalBinStage = baseStageSchema.extend({
	type: z.literal("OrdinalBin"),
	subject: NodeStageSubjectSchema,
	prompts: z
		.array(
			promptSchema.extend({
				variable: z.string(),
				bucketSortOrder: SortOrderSchema.optional(),
				binSortOrder: SortOrderSchema.optional(),
				color: z.string().optional(),
			}),
		)
		.min(1),
});

const categoricalBinStage = baseStageSchema.extend({
	type: z.literal("CategoricalBin"),
	subject: NodeStageSubjectSchema,
	prompts: z
		.array(
			promptSchema.extend({
				variable: z.string(),
				otherVariable: z.string().optional(),
				otherVariablePrompt: z.string().optional(),
				otherOptionLabel: z.string().optional(),
				bucketSortOrder: SortOrderSchema.optional(),
				binSortOrder: SortOrderSchema.optional(),
			}),
		)
		.min(1),
});

const narrativeStage = baseStageSchema.extend({
	type: z.literal("Narrative"),
	subject: NodeStageSubjectSchema,
	presets: z
		.array(
			z
				.object({
					id: z.string(),
					label: z.string(),
					layoutVariable: z.string(),
					groupVariable: z.string().optional(),
					edges: z
						.object({
							display: z.array(z.string()).optional(),
						})
						.strict()
						.optional(),
					highlight: z.array(z.string()).optional(),
				})
				.strict(),
		)
		.min(1),
	background: z
		.object({
			concentricCircles: z.number().int().optional(),
			skewedTowardCenter: z.boolean().optional(),
		})
		.strict()
		.optional(),
	behaviours: z
		.object({
			freeDraw: z.boolean().optional(),
			allowRepositioning: z.boolean().optional(),
		})
		.strict()
		.optional(),
});

// TODO: Should be narrowed based on type
const ItemSchema = z
	.object({
		id: z.string(),
		type: z.enum(["text", "asset"]),
		content: z.string(),
		description: z.string().optional(),
		size: z.string().optional(),
		loop: z.boolean().optional(),
	})
	.strict();

export type Item = z.infer<typeof ItemSchema>;

const informationStage = baseStageSchema.extend({
	type: z.literal("Information"),
	title: z.string().optional(),
	items: z.array(ItemSchema),
});

const anonymisationStage = baseStageSchema.extend({
	type: z.literal("Anonymisation"),
	explanationText: z.object({ title: z.string(), body: z.string() }).strict(),
	validation: z
		.object({
			minLength: z.number().int().optional(),
			maxLength: z.number().int().optional(),
		})
		.optional(),
});

const oneToManyDyadCensusStage = baseStageSchema.extend({
	type: z.literal("OneToManyDyadCensus"),
	subject: NodeStageSubjectSchema,
	behaviours: z.object({
		removeAfterConsideration: z.boolean(),
	}),
	prompts: z
		.array(
			promptSchema.extend({
				createEdge: z.string(),
				bucketSortOrder: SortOrderSchema.optional(),
				binSortOrder: SortOrderSchema.optional(),
			}),
		)
		.min(1),
});

const familyTreeCensusStage = baseStageSchema.extend({
	type: z.literal("FamilyTreeCensus"),
});

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

const geospatialStage = baseStageSchema.extend({
	type: z.literal("Geospatial"),
	subject: NodeStageSubjectSchema,
	mapOptions: mapOptions,
	prompts: z
		.array(
			promptSchema
				.extend({
					variable: z.string(),
				})
				.strict(),
		)
		.min(1),
});

// Combine all stage types
export const stageSchema = z.discriminatedUnion("type", [
	egoFormStage,
	alterFormStage,
	alterEdgeFormStage,
	nameGeneratorStage,
	nameGeneratorQuickAddStage,
	nameGeneratorRosterStage,
	sociogramStage,
	dyadCensusStage,
	tieStrengthCensusStage,
	ordinalBinStage,
	categoricalBinStage,
	narrativeStage,
	informationStage,
	anonymisationStage,
	oneToManyDyadCensusStage,
	familyTreeCensusStage,
	geospatialStage,
]);

// Extract all the 'type' values from stageSchema
export type StageType = z.infer<typeof stageSchema>["type"];

export type Stage = z.infer<typeof stageSchema>;
export type Prompt = Extract<Stage, { prompts: unknown }>["prompts"][number];

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

export const ExperimentsSchema = z.object({
	encryptedVariables: z.boolean().optional(),
});

// Main Protocol Schema
export const ProtocolSchema = z.object({
	description: z.string().optional(),
	experiments: ExperimentsSchema.optional(),
	lastModified: z.string().datetime().optional(),
	schemaVersion: z.literal(8),
	codebook: CodebookSchema,
	assetManifest: z.record(z.string(), assetSchema).optional(),
	stages: z.array(stageSchema),
});

// Must be default export for zod schema conversion
export default ProtocolSchema;

export type Protocol = z.infer<typeof ProtocolSchema>;
