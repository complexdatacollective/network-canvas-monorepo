/* eslint-disable import/prefer-default-export */

import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getOptionsForVariable } from "../../../selectors/codebook";

export const itemSelector =
	(entity: string | null, type: string | null) =>
	(state: RootState, { form, editField }: { form: string; editField: string }) => {
		const prompt = formValueSelector(form)(state, editField) as Record<string, unknown> | undefined;

		if (!prompt) {
			return null;
		}

		const variableOptions = getOptionsForVariable(state, {
			entity: (entity ?? "node") as "node" | "edge" | "ego",
			type: type ?? undefined,
			variable: prompt.variable as string,
		});

		return {
			...prompt,
			variableOptions,
		};
	};

// Strip variableOptions
export const normalizeField = ({ variableOptions, ...prompt }: { variableOptions?: unknown; [key: string]: unknown }) =>
	prompt;
