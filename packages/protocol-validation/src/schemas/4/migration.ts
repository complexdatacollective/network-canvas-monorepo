import { createMigration, type ProtocolDocument } from "~/migration";

type NamedRecord = Record<string, { name: string; [key: string]: unknown }>;
type OptionEntry = { value: unknown; [key: string]: unknown };
type VariableRecord = Record<string, { name: string; options?: OptionEntry[]; [key: string]: unknown }>;
type TypeEntry = { name: string; variables?: VariableRecord; [key: string]: unknown };
type TypesRecord = Record<string, TypeEntry>;
type AdditionalAttribute = { value: unknown; [key: string]: unknown };
type Prompt = { additionalAttributes?: AdditionalAttribute[]; [key: string]: unknown };
type Stage = { prompts?: Prompt[]; [key: string]: unknown };

const setProps = (props: Record<string, unknown>, source: Record<string, unknown> = {}): Record<string, unknown> =>
	Object.keys(props).reduce<Record<string, unknown>>((acc, key) => {
		if (!source[key]) {
			return acc;
		}
		return { ...acc, [key]: props[key] };
	}, source);

const getNextSafeValue = (value: string, existing: string[], inc = 1): string => {
	const incrementedValue = inc > 1 ? `${value}${inc}` : value;
	if (!existing.includes(incrementedValue)) {
		return incrementedValue;
	}
	return getNextSafeValue(value, existing, inc + 1);
};

const getSafeValue = (value: unknown, existing: string[] = []): unknown => {
	if (typeof value !== "string") {
		return value;
	}
	const safeValue = value.replace(/[\s]+/g, "_").replace(/[^a-zA-Z0-9._:-]+/g, "");
	return getNextSafeValue(safeValue, existing);
};

const getNames = (obj: NamedRecord = {}): string[] =>
	Object.keys(obj).map((key) => {
		const entry = obj[key];
		return entry ? entry.name : "";
	});

const migrateOptionValues = (options: OptionEntry[] = []): OptionEntry[] =>
	options.reduce<OptionEntry[]>(
		(acc, { value, ...rest }) => [
			...acc,
			{
				...rest,
				value: getSafeValue(
					value,
					acc.map((o) => String(o.value)),
				),
			},
		],
		[],
	);

const migrateVariable = (variable: VariableRecord[string], acc: VariableRecord = {}): VariableRecord[string] =>
	setProps(
		{
			options: migrateOptionValues(variable.options),
			name: getSafeValue(variable.name, getNames(acc)),
		},
		variable as unknown as Record<string, unknown>,
	) as unknown as VariableRecord[string];

const migrateVariables = (variables: VariableRecord = {}): VariableRecord =>
	Object.keys(variables).reduce<VariableRecord>((acc, variableId) => {
		const variable = variables[variableId];
		if (!variable) return acc;
		return {
			...acc,
			[variableId]: migrateVariable(variable, acc),
		};
	}, {});

const migrateType = (type: TypeEntry, acc: TypesRecord = {}): TypeEntry =>
	setProps(
		{
			name: getSafeValue(type.name, getNames(acc)),
			variables: migrateVariables(type.variables),
		},
		type as unknown as Record<string, unknown>,
	) as unknown as TypeEntry;

const migrateTypes = (types: TypesRecord = {}): TypesRecord =>
	Object.keys(types).reduce<TypesRecord>((acc, typeId) => {
		const type = types[typeId];
		if (!type) return acc;
		return {
			...acc,
			[typeId]: migrateType(type, acc),
		};
	}, {});

const migratePrompt = (prompt: Prompt): Prompt => {
	const booleanOnlyAttributes = (prompt.additionalAttributes ?? []).filter(
		(additionalAttribute) => additionalAttribute.value === true || additionalAttribute.value === false,
	);
	return Object.keys(prompt).reduce<Record<string, unknown>>((object, key) => {
		if (key !== "additionalAttributes") {
			object[key] = prompt[key];
		} else if (booleanOnlyAttributes.length > 0) {
			object[key] = booleanOnlyAttributes;
		}
		return object;
	}, {}) as Prompt;
};

const migrateStage = (stage: Stage): Stage => ({
	...stage,
	prompts: (stage.prompts ?? []).map((prompt) => (prompt.additionalAttributes ? migratePrompt(prompt) : prompt)),
});

const migrateStages = (stages: Stage[] = []): Stage[] =>
	stages.map((stage) => (stage.prompts ? migrateStage(stage) : stage));

const notes = `- Automatically rename **variable names** and **ordinal/categorical values** to meet stricter requirements. Only letters, numbers, and the symbols \`.\`, \`_\`, \`-\`, \`:\` will be permitted. Spaces will be replaced with underscore characters (\`_\`), and any other symbols will be removed. Variables that meet these requirements already **will not be modified**.
- Add a numerical suffix (\`variable1\`, \`variable2\`, etc.) to any variables or categorical/ordinal values that clash as a result of these changes.
- Rename node and edge types to ensure they are unique, and conform to the same requirements as variable names. Names that clash will get a numerical suffix, as above.
- **NOTE:** If you are using external network data, you must ensure that you update your column headings manually to meet the same requirements regarding variable names outlined above. See our revised [documentation on variable naming](https://documentation.networkcanvas.com/reference/variable-naming/).
- Remove any non-boolean 'additional variables' from prompts. It was necessary to simplify this feature, and so only boolean variable types will be supported moving forwards. Any non-boolean variables you created that will be removed by this migration will remain in your codebook, but will be marked 'unused'. You should review and remove these manually, or replace them with equivalent boolean variables.`;

const migrationV3toV4 = createMigration({
	from: 3,
	to: 4,
	dependencies: {},
	notes,
	migrate: (doc) => {
		const codebook = doc.codebook as Record<string, unknown>;
		const stages = doc.stages as Stage[];

		const newCodebook = setProps(
			{
				node: migrateTypes(codebook.node as TypesRecord),
				edge: migrateTypes(codebook.edge as TypesRecord),
				ego: codebook.ego ? migrateType(codebook.ego as TypeEntry) : undefined,
			},
			codebook,
		);

		const newStages = migrateStages(stages);

		return {
			...doc,
			codebook: newCodebook,
			stages: newStages,
			schemaVersion: 4 as const,
		} as ProtocolDocument<4>;
	},
});

export default migrationV3toV4;
