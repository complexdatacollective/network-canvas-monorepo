import { get, omit, reduce } from "es-toolkit/compat";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getVariablesForSubject } from "~/selectors/codebook";

// Internal config - not exported
const CODEBOOK_PROPERTIES = ["options", "parameters", "component", "validation"];

export const getCodebookProperties = (properties: Record<string, unknown>): Record<string, unknown> =>
	reduce(
		CODEBOOK_PROPERTIES,
		(memo, key) => {
			const property = properties[key];
			if (!Object.keys(properties).includes(key)) {
				return memo;
			}
			return {
				...memo,
				[key]: property,
			};
		},
		{},
	);

export const normalizeField = (field: Record<string, unknown>) =>
	omit(field, ["id", "_createNewVariable", ...CODEBOOK_PROPERTIES]);

// Merge item with variable info from codebook
export const itemSelector =
	(entity: string | null, type: string | null) =>
	(state: RootState, { form, editField }: { form: string; editField: string }) => {
		const item = formValueSelector(form)(state, editField) as Record<string, unknown> | undefined;

		if (!item || !entity) {
			return null;
		}

		const variable = item?.variable as string | undefined;

		const codebookVariables = getVariablesForSubject(state, {
			entity: entity as "node" | "edge" | "ego",
			type: type ?? undefined,
		});
		const codebookVariable = get(codebookVariables, variable ?? "", {}) as Record<string, unknown>;
		const codebookProperties = getCodebookProperties(codebookVariable);

		return {
			...item,
			...codebookProperties,
		};
	};
