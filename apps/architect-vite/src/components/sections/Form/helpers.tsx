import { get, omit, reduce } from "es-toolkit/compat";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getVariablesForSubject } from "~/selectors/codebook";

export const CODEBOOK_PROPERTIES = ["options", "parameters", "component", "validation"];

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

export const normalizeField = (field: Record<string, unknown>) => omit(field, ["id", ...CODEBOOK_PROPERTIES]);

// Merge item with variable info from codebook
export const itemSelector =
	(entity: string, type: string) =>
	(state: RootState, { form, editField }: { form: string; editField: string }) => {
		const item = formValueSelector(form)(state, editField) as Record<string, unknown> | undefined;

		if (!item) {
			return null;
		}

		const variable = item?.variable as string | undefined;

		const codebookVariables = getVariablesForSubject(state, { entity, type });
		const codebookVariable = get(codebookVariables, variable ?? "", {}) as Record<string, unknown>;
		const codebookProperties = getCodebookProperties(codebookVariable);

		return {
			...item,
			...codebookProperties,
		};
	};
