import type { Codebook } from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { invariant } from "es-toolkit";
import { getCurrentStage } from "../../../selectors/session";
import { getCodebook } from "../../../store/modules/protocol";
import type { RootState } from "../../../store/store";

type ResolvedNodeFormField = {
	variableId: string;
	prompt: string;
	component: string;
	type: string;
	options: unknown;
	validation: Record<string, unknown> | undefined;
};

const getNodeConfig = createSelector(getCurrentStage, (stage) => {
	invariant(stage.type === "FamilyPedigree", "Stage must be FamilyPedigree");
	return stage.nodeConfig;
});

export const getNodeType = createSelector(getNodeConfig, (c) => c.type);
export const getNodeTypeKey = createSelector(getNodeConfig, (c) => c.type);
export const getNodeLabelVariable = createSelector(getNodeConfig, (c) => c.nodeLabelVariable);
export const getEgoVariable = createSelector(getNodeConfig, (c) => c.egoVariable);
export const getNodeForm = createSelector(getNodeConfig, (c) => c.form);

/**
 * Resolves nodeConfig.form fields against the codebook to produce
 * renderable field definitions with component type, options, and validation.
 */
export const getResolvedNodeFormFields: (state: RootState, currentStep: number) => ResolvedNodeFormField[] =
	createSelector(getCodebook, getNodeType, getNodeForm, (codebook, nodeType, form) => {
		if (!form) return [];
		const variables = (codebook as Codebook).node?.[nodeType]?.variables;
		if (!variables) return [];

		return form
			.map((field): ResolvedNodeFormField | null => {
				const variable = variables[field.variable];
				if (!variable || !("component" in variable)) return null;
				return {
					variableId: field.variable,
					prompt: field.prompt,
					component: variable.component as string,
					type: variable.type as string,
					options: "options" in variable ? variable.options : undefined,
					validation: "validation" in variable ? (variable.validation as Record<string, unknown>) : undefined,
				};
			})
			.filter((f): f is ResolvedNodeFormField => f !== null);
	});

export const getNodeShapeDefinition = createSelector(getCodebook, getNodeType, (codebook, nodeType) => {
	return (codebook as Codebook).node?.[nodeType]?.shape ?? null;
});
