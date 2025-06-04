/* eslint-disable import/prefer-default-export */

import { formValueSelector } from "redux-form";
import { getOptionsForVariable } from "../../../selectors/codebook";

export const itemSelector =
	() =>
	(state: any, { form, editField }: { form: string; editField: string }) => {
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

// Strip variableOptions
export const normalizeField = ({ variableOptions, ...prompt }: { variableOptions?: any; [key: string]: any }) => prompt;
