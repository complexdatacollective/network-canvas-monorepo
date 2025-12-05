import type { Codebook } from "@codaco/protocol-validation";
import { flatMap, get, reduce } from "lodash";
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
		protocol: { stages?: Array<{ id: string; [key: string]: unknown }> },
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

type Protocol = {
	stages?: Array<{
		id: string;
		form?: {
			fields: Field[];
		};
		[key: string]: unknown;
	}>;
	codebook?: {
		node?: Record<string, { variables?: Record<string, VariableConfiguration> }>;
		edge?: Record<string, { variables?: Record<string, VariableConfiguration> }>;
		ego?: { variables?: Record<string, VariableConfiguration> };
	};
};

export const getCodebookIndex = (protocol: Protocol | null | undefined) => {
	if (!protocol || !protocol.stages || !protocol.codebook) {
		return [];
	}

	const variablePaths = utils.collectPaths(paths.variables, protocol);

	const fields = flatMap(protocol.stages, (stage) => {
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
				buildVariableEntry(protocol, variablePaths, fields, entity, String(entityType)),
			),
		);
	});

	return index;
};
