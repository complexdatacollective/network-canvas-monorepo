import { z } from "zod";

export const Protocol = z
	.object({
		name: z.string().optional(),
		description: z.string().optional(),
		lastModified: z.string().datetime({ offset: true }).optional(),
		schemaVersion: z.number().optional(),
		codebook: z
			.object({
				node: z
					.record(
						z.union([
							z
								.object({
									name: z.string(),
									displayVariable: z.string().optional(),
									iconVariant: z.string().optional(),
									variables: z
										.record(
											z.union([
												z
													.object({
														name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
														type: z.enum([
															"boolean",
															"text",
															"number",
															"datetime",
															"ordinal",
															"scalar",
															"categorical",
															"layout",
															"location",
														]),
														component: z
															.enum([
																"Boolean",
																"CheckboxGroup",
																"Number",
																"RadioGroup",
																"Text",
																"TextArea",
																"Toggle",
																"ToggleButtonGroup",
																"Slider",
																"VisualAnalogScale",
																"LikertScale",
																"DatePicker",
																"RelativeDatePicker",
															])
															.optional(),
														options: z
															.array(
																z.union([
																	z
																		.object({
																			label: z.string(),
																			value: z.union([
																				z.number().int(),
																				z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																				z.boolean(),
																			]),
																			negative: z.boolean().optional(),
																		})
																		.strict(),
																	z.number().int(),
																	z.string(),
																]),
															)
															.optional(),
														parameters: z.record(z.any()).optional(),
														validation: z
															.object({
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
															})
															.strict()
															.optional(),
													})
													.strict(),
												z.never(),
											]),
										)
										.superRefine((value, ctx) => {
											for (const key in value) {
												let evaluated = false;
												if (key.match(/.+/)) {
													evaluated = true;
													const result = z
														.object({
															name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
															type: z.enum([
																"boolean",
																"text",
																"number",
																"datetime",
																"ordinal",
																"scalar",
																"categorical",
																"layout",
																"location",
															]),
															component: z
																.enum([
																	"Boolean",
																	"CheckboxGroup",
																	"Number",
																	"RadioGroup",
																	"Text",
																	"TextArea",
																	"Toggle",
																	"ToggleButtonGroup",
																	"Slider",
																	"VisualAnalogScale",
																	"LikertScale",
																	"DatePicker",
																	"RelativeDatePicker",
																])
																.optional(),
															options: z
																.array(
																	z.union([
																		z
																			.object({
																				label: z.string(),
																				value: z.union([
																					z.number().int(),
																					z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																					z.boolean(),
																				]),
																				negative: z.boolean().optional(),
																			})
																			.strict(),
																		z.number().int(),
																		z.string(),
																	]),
																)
																.optional(),
															parameters: z.record(z.any()).optional(),
															validation: z
																.object({
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
																})
																.strict()
																.optional(),
														})
														.strict()
														.safeParse(value[key]);
													if (!result.success) {
														ctx.addIssue({
															path: [...ctx.path, key],
															code: "custom",
															message: `Invalid input: Key matching regex /${key}/ must match schema`,
															params: {
																issues: result.error.issues,
															},
														});
													}
												}
												if (!evaluated) {
													const result = z.never().safeParse(value[key]);
													if (!result.success) {
														ctx.addIssue({
															path: [...ctx.path, key],
															code: "custom",
															message: "Invalid input: must match catchall schema",
															params: {
																issues: result.error.issues,
															},
														});
													}
												}
											}
										})
										.optional(),
									color: z.string(),
								})
								.strict(),
							z.never(),
						]),
					)
					.superRefine((value, ctx) => {
						for (const key in value) {
							let evaluated = false;
							if (key.match(/.+/)) {
								evaluated = true;
								const result = z
									.object({
										name: z.string(),
										displayVariable: z.string().optional(),
										iconVariant: z.string().optional(),
										variables: z
											.record(
												z.union([
													z
														.object({
															name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
															type: z.enum([
																"boolean",
																"text",
																"number",
																"datetime",
																"ordinal",
																"scalar",
																"categorical",
																"layout",
																"location",
															]),
															component: z
																.enum([
																	"Boolean",
																	"CheckboxGroup",
																	"Number",
																	"RadioGroup",
																	"Text",
																	"TextArea",
																	"Toggle",
																	"ToggleButtonGroup",
																	"Slider",
																	"VisualAnalogScale",
																	"LikertScale",
																	"DatePicker",
																	"RelativeDatePicker",
																])
																.optional(),
															options: z
																.array(
																	z.union([
																		z
																			.object({
																				label: z.string(),
																				value: z.union([
																					z.number().int(),
																					z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																					z.boolean(),
																				]),
																				negative: z.boolean().optional(),
																			})
																			.strict(),
																		z.number().int(),
																		z.string(),
																	]),
																)
																.optional(),
															parameters: z.record(z.any()).optional(),
															validation: z
																.object({
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
																})
																.strict()
																.optional(),
														})
														.strict(),
													z.never(),
												]),
											)
											.superRefine((value, ctx) => {
												for (const key in value) {
													let evaluated = false;
													if (key.match(/.+/)) {
														evaluated = true;
														const result = z
															.object({
																name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																type: z.enum([
																	"boolean",
																	"text",
																	"number",
																	"datetime",
																	"ordinal",
																	"scalar",
																	"categorical",
																	"layout",
																	"location",
																]),
																component: z
																	.enum([
																		"Boolean",
																		"CheckboxGroup",
																		"Number",
																		"RadioGroup",
																		"Text",
																		"TextArea",
																		"Toggle",
																		"ToggleButtonGroup",
																		"Slider",
																		"VisualAnalogScale",
																		"LikertScale",
																		"DatePicker",
																		"RelativeDatePicker",
																	])
																	.optional(),
																options: z
																	.array(
																		z.union([
																			z
																				.object({
																					label: z.string(),
																					value: z.union([
																						z.number().int(),
																						z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																						z.boolean(),
																					]),
																					negative: z.boolean().optional(),
																				})
																				.strict(),
																			z.number().int(),
																			z.string(),
																		]),
																	)
																	.optional(),
																parameters: z.record(z.any()).optional(),
																validation: z
																	.object({
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
																	})
																	.strict()
																	.optional(),
															})
															.strict()
															.safeParse(value[key]);
														if (!result.success) {
															ctx.addIssue({
																path: [...ctx.path, key],
																code: "custom",
																message: `Invalid input: Key matching regex /${key}/ must match schema`,
																params: {
																	issues: result.error.issues,
																},
															});
														}
													}
													if (!evaluated) {
														const result = z.never().safeParse(value[key]);
														if (!result.success) {
															ctx.addIssue({
																path: [...ctx.path, key],
																code: "custom",
																message: "Invalid input: must match catchall schema",
																params: {
																	issues: result.error.issues,
																},
															});
														}
													}
												}
											})
											.optional(),
										color: z.string(),
									})
									.strict()
									.safeParse(value[key]);
								if (!result.success) {
									ctx.addIssue({
										path: [...ctx.path, key],
										code: "custom",
										message: `Invalid input: Key matching regex /${key}/ must match schema`,
										params: {
											issues: result.error.issues,
										},
									});
								}
							}
							if (!evaluated) {
								const result = z.never().safeParse(value[key]);
								if (!result.success) {
									ctx.addIssue({
										path: [...ctx.path, key],
										code: "custom",
										message: "Invalid input: must match catchall schema",
										params: {
											issues: result.error.issues,
										},
									});
								}
							}
						}
					})
					.optional(),
				edge: z
					.record(
						z.union([
							z
								.object({
									name: z.string(),
									color: z.string(),
									variables: z
										.record(
											z.union([
												z
													.object({
														name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
														type: z.enum([
															"boolean",
															"text",
															"number",
															"datetime",
															"ordinal",
															"scalar",
															"categorical",
															"layout",
															"location",
														]),
														component: z
															.enum([
																"Boolean",
																"CheckboxGroup",
																"Number",
																"RadioGroup",
																"Text",
																"TextArea",
																"Toggle",
																"ToggleButtonGroup",
																"Slider",
																"VisualAnalogScale",
																"LikertScale",
																"DatePicker",
																"RelativeDatePicker",
															])
															.optional(),
														options: z
															.array(
																z.union([
																	z
																		.object({
																			label: z.string(),
																			value: z.union([
																				z.number().int(),
																				z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																				z.boolean(),
																			]),
																			negative: z.boolean().optional(),
																		})
																		.strict(),
																	z.number().int(),
																	z.string(),
																]),
															)
															.optional(),
														parameters: z.record(z.any()).optional(),
														validation: z
															.object({
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
															})
															.strict()
															.optional(),
													})
													.strict(),
												z.never(),
											]),
										)
										.superRefine((value, ctx) => {
											for (const key in value) {
												let evaluated = false;
												if (key.match(/.+/)) {
													evaluated = true;
													const result = z
														.object({
															name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
															type: z.enum([
																"boolean",
																"text",
																"number",
																"datetime",
																"ordinal",
																"scalar",
																"categorical",
																"layout",
																"location",
															]),
															component: z
																.enum([
																	"Boolean",
																	"CheckboxGroup",
																	"Number",
																	"RadioGroup",
																	"Text",
																	"TextArea",
																	"Toggle",
																	"ToggleButtonGroup",
																	"Slider",
																	"VisualAnalogScale",
																	"LikertScale",
																	"DatePicker",
																	"RelativeDatePicker",
																])
																.optional(),
															options: z
																.array(
																	z.union([
																		z
																			.object({
																				label: z.string(),
																				value: z.union([
																					z.number().int(),
																					z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																					z.boolean(),
																				]),
																				negative: z.boolean().optional(),
																			})
																			.strict(),
																		z.number().int(),
																		z.string(),
																	]),
																)
																.optional(),
															parameters: z.record(z.any()).optional(),
															validation: z
																.object({
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
																})
																.strict()
																.optional(),
														})
														.strict()
														.safeParse(value[key]);
													if (!result.success) {
														ctx.addIssue({
															path: [...ctx.path, key],
															code: "custom",
															message: `Invalid input: Key matching regex /${key}/ must match schema`,
															params: {
																issues: result.error.issues,
															},
														});
													}
												}
												if (!evaluated) {
													const result = z.never().safeParse(value[key]);
													if (!result.success) {
														ctx.addIssue({
															path: [...ctx.path, key],
															code: "custom",
															message: "Invalid input: must match catchall schema",
															params: {
																issues: result.error.issues,
															},
														});
													}
												}
											}
										})
										.optional(),
								})
								.strict(),
							z.never(),
						]),
					)
					.superRefine((value, ctx) => {
						for (const key in value) {
							let evaluated = false;
							if (key.match(/.+/)) {
								evaluated = true;
								const result = z
									.object({
										name: z.string(),
										color: z.string(),
										variables: z
											.record(
												z.union([
													z
														.object({
															name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
															type: z.enum([
																"boolean",
																"text",
																"number",
																"datetime",
																"ordinal",
																"scalar",
																"categorical",
																"layout",
																"location",
															]),
															component: z
																.enum([
																	"Boolean",
																	"CheckboxGroup",
																	"Number",
																	"RadioGroup",
																	"Text",
																	"TextArea",
																	"Toggle",
																	"ToggleButtonGroup",
																	"Slider",
																	"VisualAnalogScale",
																	"LikertScale",
																	"DatePicker",
																	"RelativeDatePicker",
																])
																.optional(),
															options: z
																.array(
																	z.union([
																		z
																			.object({
																				label: z.string(),
																				value: z.union([
																					z.number().int(),
																					z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																					z.boolean(),
																				]),
																				negative: z.boolean().optional(),
																			})
																			.strict(),
																		z.number().int(),
																		z.string(),
																	]),
																)
																.optional(),
															parameters: z.record(z.any()).optional(),
															validation: z
																.object({
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
																})
																.strict()
																.optional(),
														})
														.strict(),
													z.never(),
												]),
											)
											.superRefine((value, ctx) => {
												for (const key in value) {
													let evaluated = false;
													if (key.match(/.+/)) {
														evaluated = true;
														const result = z
															.object({
																name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																type: z.enum([
																	"boolean",
																	"text",
																	"number",
																	"datetime",
																	"ordinal",
																	"scalar",
																	"categorical",
																	"layout",
																	"location",
																]),
																component: z
																	.enum([
																		"Boolean",
																		"CheckboxGroup",
																		"Number",
																		"RadioGroup",
																		"Text",
																		"TextArea",
																		"Toggle",
																		"ToggleButtonGroup",
																		"Slider",
																		"VisualAnalogScale",
																		"LikertScale",
																		"DatePicker",
																		"RelativeDatePicker",
																	])
																	.optional(),
																options: z
																	.array(
																		z.union([
																			z
																				.object({
																					label: z.string(),
																					value: z.union([
																						z.number().int(),
																						z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																						z.boolean(),
																					]),
																					negative: z.boolean().optional(),
																				})
																				.strict(),
																			z.number().int(),
																			z.string(),
																		]),
																	)
																	.optional(),
																parameters: z.record(z.any()).optional(),
																validation: z
																	.object({
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
																	})
																	.strict()
																	.optional(),
															})
															.strict()
															.safeParse(value[key]);
														if (!result.success) {
															ctx.addIssue({
																path: [...ctx.path, key],
																code: "custom",
																message: `Invalid input: Key matching regex /${key}/ must match schema`,
																params: {
																	issues: result.error.issues,
																},
															});
														}
													}
													if (!evaluated) {
														const result = z.never().safeParse(value[key]);
														if (!result.success) {
															ctx.addIssue({
																path: [...ctx.path, key],
																code: "custom",
																message: "Invalid input: must match catchall schema",
																params: {
																	issues: result.error.issues,
																},
															});
														}
													}
												}
											})
											.optional(),
									})
									.strict()
									.safeParse(value[key]);
								if (!result.success) {
									ctx.addIssue({
										path: [...ctx.path, key],
										code: "custom",
										message: `Invalid input: Key matching regex /${key}/ must match schema`,
										params: {
											issues: result.error.issues,
										},
									});
								}
							}
							if (!evaluated) {
								const result = z.never().safeParse(value[key]);
								if (!result.success) {
									ctx.addIssue({
										path: [...ctx.path, key],
										code: "custom",
										message: "Invalid input: must match catchall schema",
										params: {
											issues: result.error.issues,
										},
									});
								}
							}
						}
					})
					.optional(),
				ego: z
					.object({
						variables: z
							.record(
								z.union([
									z
										.object({
											name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
											type: z.enum([
												"boolean",
												"text",
												"number",
												"datetime",
												"ordinal",
												"scalar",
												"categorical",
												"layout",
												"location",
											]),
											component: z
												.enum([
													"Boolean",
													"CheckboxGroup",
													"Number",
													"RadioGroup",
													"Text",
													"TextArea",
													"Toggle",
													"ToggleButtonGroup",
													"Slider",
													"VisualAnalogScale",
													"LikertScale",
													"DatePicker",
													"RelativeDatePicker",
												])
												.optional(),
											options: z
												.array(
													z.union([
														z
															.object({
																label: z.string(),
																value: z.union([z.number().int(), z.string().regex(/^[a-zA-Z0-9._:-]+$/), z.boolean()]),
																negative: z.boolean().optional(),
															})
															.strict(),
														z.number().int(),
														z.string(),
													]),
												)
												.optional(),
											parameters: z.record(z.any()).optional(),
											validation: z
												.object({
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
												})
												.strict()
												.optional(),
										})
										.strict(),
									z.never(),
								]),
							)
							.superRefine((value, ctx) => {
								for (const key in value) {
									let evaluated = false;
									if (key.match(/.+/)) {
										evaluated = true;
										const result = z
											.object({
												name: z.string().regex(/^[a-zA-Z0-9._:-]+$/),
												type: z.enum([
													"boolean",
													"text",
													"number",
													"datetime",
													"ordinal",
													"scalar",
													"categorical",
													"layout",
													"location",
												]),
												component: z
													.enum([
														"Boolean",
														"CheckboxGroup",
														"Number",
														"RadioGroup",
														"Text",
														"TextArea",
														"Toggle",
														"ToggleButtonGroup",
														"Slider",
														"VisualAnalogScale",
														"LikertScale",
														"DatePicker",
														"RelativeDatePicker",
													])
													.optional(),
												options: z
													.array(
														z.union([
															z
																.object({
																	label: z.string(),
																	value: z.union([
																		z.number().int(),
																		z.string().regex(/^[a-zA-Z0-9._:-]+$/),
																		z.boolean(),
																	]),
																	negative: z.boolean().optional(),
																})
																.strict(),
															z.number().int(),
															z.string(),
														]),
													)
													.optional(),
												parameters: z.record(z.any()).optional(),
												validation: z
													.object({
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
													})
													.strict()
													.optional(),
											})
											.strict()
											.safeParse(value[key]);
										if (!result.success) {
											ctx.addIssue({
												path: [...ctx.path, key],
												code: "custom",
												message: `Invalid input: Key matching regex /${key}/ must match schema`,
												params: {
													issues: result.error.issues,
												},
											});
										}
									}
									if (!evaluated) {
										const result = z.never().safeParse(value[key]);
										if (!result.success) {
											ctx.addIssue({
												path: [...ctx.path, key],
												code: "custom",
												message: "Invalid input: must match catchall schema",
												params: {
													issues: result.error.issues,
												},
											});
										}
									}
								}
							})
							.optional(),
					})
					.strict()
					.optional(),
			})
			.strict(),
		assetManifest: z.record(z.any()).optional(),
		stages: z.array(
			z
				.object({
					id: z.string(),
					interviewScript: z.string().optional(),
					type: z.enum([
						"Narrative",
						"AlterForm",
						"AlterEdgeForm",
						"EgoForm",
						"NameGenerator",
						"NameGeneratorQuickAdd",
						"NameGeneratorRoster",
						"Sociogram",
						"DyadCensus",
						"TieStrengthCensus",
						"Information",
						"OrdinalBin",
						"CategoricalBin",
					]),
					label: z.string(),
					form: z
						.union([
							z
								.object({
									title: z.string().optional(),
									fields: z.array(z.object({ variable: z.string(), prompt: z.string() }).strict()),
								})
								.strict(),
							z.null(),
						])
						.optional(),
					quickAdd: z.union([z.string(), z.null()]).optional(),
					createEdge: z.string().optional(),
					dataSource: z.union([z.string(), z.null()]).optional(),
					subject: z
						.object({ entity: z.enum(["edge", "node", "ego"]), type: z.string() })
						.strict()
						.optional(),
					panels: z
						.array(
							z
								.object({
									id: z.string(),
									title: z.string(),
									filter: z
										.union([
											z
												.object({
													join: z.enum(["OR", "AND"]).optional(),
													rules: z
														.array(
															z
																.object({
																	type: z.enum(["alter", "ego", "edge"]),
																	id: z.string(),
																	options: z
																		.object({
																			type: z.string().optional(),
																			attribute: z.string().optional(),
																			operator: z.enum([
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
																			]),
																			value: z.union([z.number().int(), z.string(), z.boolean()]).optional(),
																		})
																		.strict()
																		.and(z.any()),
																})
																.strict(),
														)
														.optional(),
												})
												.strict(),
											z.null(),
										])
										.optional(),
									dataSource: z.union([z.string(), z.null()]),
								})
								.strict(),
						)
						.optional(),
					prompts: z
						.array(
							z
								.object({
									id: z.string(),
									text: z.string(),
									additionalAttributes: z
										.array(z.object({ variable: z.string(), value: z.boolean() }).strict())
										.optional(),
									variable: z.string().optional(),
									edgeVariable: z.string().optional(),
									negativeLabel: z.string().optional(),
									otherVariable: z.string().optional(),
									otherVariablePrompt: z.string().optional(),
									otherOptionLabel: z.string().optional(),
									bucketSortOrder: z
										.array(z.object({ property: z.string(), direction: z.enum(["desc", "asc"]) }).strict())
										.optional(),
									binSortOrder: z
										.array(z.object({ property: z.string(), direction: z.enum(["desc", "asc"]) }).strict())
										.optional(),
									sortOrder: z
										.array(z.object({ property: z.string(), direction: z.enum(["desc", "asc"]) }).strict())
										.optional(),
									color: z.string().optional(),
									layout: z
										.object({ layoutVariable: z.string(), allowPositioning: z.boolean().optional() })
										.strict()
										.optional(),
									edges: z
										.object({ display: z.array(z.string()).optional(), create: z.string().optional() })
										.strict()
										.optional(),
									highlight: z
										.object({ variable: z.string().optional(), allowHighlighting: z.boolean() })
										.strict()
										.optional(),
									createEdge: z.string().optional(),
								})
								.strict(),
						)
						.min(1)
						.optional(),
					presets: z
						.array(
							z
								.object({
									id: z.string(),
									label: z.string(),
									layoutVariable: z.string(),
									groupVariable: z.string().optional(),
									edges: z
										.object({ display: z.array(z.string()).optional(), create: z.string().optional() })
										.strict()
										.optional(),
									highlight: z.array(z.string()).optional(),
								})
								.strict(),
						)
						.min(1)
						.optional(),
					background: z
						.object({
							image: z.string().optional(),
							concentricCircles: z.number().int().optional(),
							skewedTowardCenter: z.boolean().optional(),
						})
						.strict()
						.optional(),
					sortOptions: z
						.object({
							sortOrder: z.array(z.object({ property: z.string(), direction: z.enum(["desc", "asc"]) }).strict()),
							sortableProperties: z.array(z.object({ label: z.string(), variable: z.string() }).strict()),
						})
						.strict()
						.optional(),
					cardOptions: z
						.object({
							displayLabel: z.string().optional(),
							additionalProperties: z.array(z.object({ label: z.string(), variable: z.string() }).strict()).optional(),
						})
						.strict()
						.optional(),
					searchOptions: z
						.object({ fuzziness: z.number(), matchProperties: z.array(z.string()) })
						.strict()
						.optional(),
					behaviours: z
						.object({
							minNodes: z.number().int().optional(),
							maxNodes: z.number().int().optional(),
							freeDraw: z.boolean().optional(),
							featureNode: z.boolean().optional(),
							allowRepositioning: z.boolean().optional(),
							automaticLayout: z.object({ enabled: z.boolean() }).strict().optional(),
						})
						.catchall(z.any())
						.optional(),
					showExistingNodes: z.boolean().optional(),
					title: z.string().optional(),
					items: z
						.array(
							z
								.object({
									id: z.string(),
									type: z.enum(["text", "asset"]),
									content: z.string(),
									description: z.string().optional(),
									size: z.string().optional(),
									loop: z.boolean().optional(),
								})
								.strict(),
						)
						.optional(),
					introductionPanel: z.object({ title: z.string(), text: z.string() }).strict().optional(),
					skipLogic: z
						.object({
							action: z.enum(["SHOW", "SKIP"]),
							filter: z.union([
								z
									.object({
										join: z.enum(["OR", "AND"]).optional(),
										rules: z
											.array(
												z
													.object({
														type: z.enum(["alter", "ego", "edge"]),
														id: z.string(),
														options: z
															.object({
																type: z.string().optional(),
																attribute: z.string().optional(),
																operator: z.enum([
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
																]),
																value: z.union([z.number().int(), z.string(), z.boolean()]).optional(),
															})
															.strict()
															.and(z.any()),
													})
													.strict(),
											)
											.optional(),
									})
									.strict(),
								z.null(),
							]),
						})
						.strict()
						.optional(),
					filter: z
						.union([
							z
								.object({
									join: z.enum(["OR", "AND"]).optional(),
									rules: z
										.array(
											z
												.object({
													type: z.enum(["alter", "ego", "edge"]),
													id: z.string(),
													options: z
														.object({
															type: z.string().optional(),
															attribute: z.string().optional(),
															operator: z.enum([
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
															]),
															value: z.union([z.number().int(), z.string(), z.boolean()]).optional(),
														})
														.strict()
														.and(z.any()),
												})
												.strict(),
										)
										.optional(),
								})
								.strict(),
							z.null(),
						])
						.optional(),
				})
				.strict()
				.and(
					z.union([
						z.object({ type: z.literal("EgoForm").optional() }),
						z.object({ type: z.literal("DyadCensus").optional() }),
						z.object({ type: z.literal("TieStrengthCensus").optional() }),
						z.object({ type: z.literal("AlterForm").optional() }),
						z.object({ type: z.literal("AlterEdgeForm").optional() }),
						z.object({ type: z.literal("Information").optional() }),
						z.object({ type: z.literal("Narrative").optional() }),
						z.object({
							type: z
								.enum([
									"NameGenerator",
									"NameGeneratorQuickAdd",
									"NameGeneratorRoster",
									"Sociogram",
									"OrdinalBin",
									"CategoricalBin",
									"DyadCensus",
								])
								.optional(),
						}),
					]),
				),
		),
	})
	.strict();
export type Protocol = z.infer<typeof Protocol>;
