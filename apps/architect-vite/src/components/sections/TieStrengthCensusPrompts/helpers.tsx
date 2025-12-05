import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/store";
import { getOptionsForVariable } from "../../../selectors/codebook";

export const itemSelector =
	() =>
	(state: RootState, { form, editField }: { form: string; editField: string }) => {
		const prompt = formValueSelector(form)(state, editField);

		if (!prompt) {
			return null;
		}

		const variableOptions = getOptionsForVariable(state, {
			entity: "edge",
			type: prompt.createEdge,
			variable: prompt.edgeVariable,
		});

		return {
			...prompt,
			variableOptions,
		};
	};
