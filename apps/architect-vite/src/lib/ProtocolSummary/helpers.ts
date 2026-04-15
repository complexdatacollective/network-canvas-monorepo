import type { Codebook } from "@codaco/protocol-validation";
import { flatMap, get, reduce } from "es-toolkit/compat";
import { paths, utils } from "../../selectors/indexes";

type VariableConfiguration = {
	name: string;
	type: string;
	component?: string;
	[key: string]: unknown;
};

type Field = {
	variable: string;
	prompt?: string;
	[key: string]: unknown;
};

const buildVariableEntry =
	(
		protocol: Record<string, unknown>,
		variablePaths: Record<string, unknown>,
		fields: Field[],
		entity: string,
		entityType: string,
	) =>
	(variableConfiguration: VariableConfiguration, variableId: string) => {
		const usage = reduce<Record<string, unknown>, string[]>(
			variablePaths,
			(memo, id, variablePath) => {
				if (id !== variableId) {
					return memo;
				}
				return [...memo, variablePath];
			},
			[],
		);

		const stages = usage
			.map((path: string) => {
				const [stagePath] = path.split(".");
				return get(protocol, `${stagePath}.id`) as string | undefined;
			})
			.filter((id): id is string => id !== undefined);

		const field = fields.find((f) => f.variable === variableId);

		return {
			id: variableId,
			name: variableConfiguration.name,
			type: variableConfiguration.type,
			component: variableConfiguration.component,
			prompt: field?.prompt,
			subject: { entity, type: entityType !== "ego" && entityType },
			stages,
			usage,
		};
	};

type StageRecord = {
	id: string;
	form?: {
		fields: Field[];
	};
	[key: string]: unknown;
};

type Protocol = {
	timeline: {
		start: string;
		entities: Array<{ type: string; id: string; children?: unknown[]; [key: string]: unknown }>;
	};
	codebook?: {
		node?: Record<string, { variables?: Record<string, VariableConfiguration> }>;
		edge?: Record<string, { variables?: Record<string, VariableConfiguration> }>;
		ego?: { variables?: Record<string, VariableConfiguration> };
	};
	[key: string]: unknown;
};

function flattenStages(
	entities: Array<{ type: string; id: string; children?: unknown[]; [key: string]: unknown }>,
): StageRecord[] {
	const result: StageRecord[] = [];
	for (const entity of entities) {
		if (entity.type === "Stage") {
			result.push(entity as StageRecord);
		} else if (entity.type === "Collection" && Array.isArray(entity.children)) {
			result.push(
				...flattenStages(
					entity.children as Array<{ type: string; id: string; children?: unknown[]; [key: string]: unknown }>,
				),
			);
		}
	}
	return result;
}

export const getCodebookIndex = (protocol: Protocol | null | undefined) => {
	if (!protocol?.timeline?.entities || !protocol.codebook) {
		return [];
	}

	const stages = flattenStages(protocol.timeline.entities);
	// collectPaths expects stages[*] paths; build a compatibility object
	const protocolWithStages = { ...protocol, stages };
	const variablePaths = utils.collectPaths(paths.variables, protocolWithStages);

	const fields = flatMap(stages, (stage) => {
		if (!stage.form) {
			return [];
		}

		return stage.form.fields;
	});

	const protocolEntities = [
		...(protocol.codebook?.node ? ["node"] : []),
		...(protocol.codebook?.edge ? ["edge"] : []),
		...(protocol.codebook?.ego ? ["ego"] : []),
	];

	const index = flatMap(protocolEntities, (entity) => {
		const codebook = protocol.codebook;
		if (!codebook) {
			return [];
		}

		const entityConfigurations =
			entity === "ego" ? { ego: codebook.ego } : (codebook as Codebook)[entity as "node" | "edge"];

		return flatMap(entityConfigurations, (entityConfiguration, entityType) =>
			flatMap(
				(
					entityConfiguration as {
						variables?: Record<string, VariableConfiguration>;
					}
				).variables,
				buildVariableEntry(protocolWithStages, variablePaths, fields, entity, String(entityType)),
			),
		);
	});

	return index;
};
