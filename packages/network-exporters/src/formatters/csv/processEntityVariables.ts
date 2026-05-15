// Determine which variables to include

import type { Codebook, EntityDefinition } from "@codaco/protocol-validation";
import { entityAttributesProperty, type NcEdge, type NcEgo, type NcNode } from "@codaco/shared-consts";
import type { ExportOptions } from "../../options";
import { getEntityAttributes, isCategoricalOptionSelected } from "../../utils/general";

// TODO: move to protocol validation
export type VariableDefinition = NonNullable<EntityDefinition["variables"]>[string];

const processEntityVariables = (
	entityObject: NcEdge | NcNode | NcEgo,
	entity: "ego" | "node" | "edge",
	codebook: Codebook,
	exportOptions: ExportOptions,
) => {
	const attributes: Record<string, unknown> = {};

	for (const attributeUUID of Object.keys(getEntityAttributes(entityObject))) {
		let codebookAttribute: VariableDefinition | undefined;

		if (entity === "ego") {
			codebookAttribute = codebook.ego?.variables?.[attributeUUID];
		} else {
			codebookAttribute = codebook[entity]?.[(entityObject).type]?.variables?.[attributeUUID];
		}

		const attributeName = codebookAttribute?.name;
		const attributeType = codebookAttribute?.type;
		const attributeIsEncrypted = codebookAttribute?.encrypted;
		const attributeData = entityObject[entityAttributesProperty][attributeUUID];

		if (attributeType === "categorical") {
			const attributeOptions = codebookAttribute?.options ?? [];

			for (const optionName of attributeOptions) {
				const key = `${attributeName}_${optionName.value}`;
				if (attributeIsEncrypted) {
					attributes[key] = "ENCRYPTED";
				} else {
					attributes[key] = isCategoricalOptionSelected(attributeData, optionName.value);
				}
			}
			continue;
		}

		if (attributeType === "layout") {
			const coords = attributeData as { x: number; y: number } | null | undefined;
			const xCoord = coords?.x;
			const yCoord = coords?.y;

			if (attributeIsEncrypted) {
				attributes[`${attributeName}_x`] = "ENCRYPTED";
				attributes[`${attributeName}_y`] = "ENCRYPTED";
				continue;
			}

			attributes[`${attributeName}_x`] = xCoord;
			attributes[`${attributeName}_y`] = yCoord;

			if (
				attributeData &&
				exportOptions.globalOptions.useScreenLayoutCoordinates &&
				xCoord !== undefined &&
				yCoord !== undefined
			) {
				const { screenLayoutWidth, screenLayoutHeight } = exportOptions.globalOptions;
				attributes[`${attributeName}_screenSpaceX`] = (xCoord * screenLayoutWidth).toFixed(2);
				attributes[`${attributeName}_screenSpaceY`] = ((1.0 - yCoord) * screenLayoutHeight).toFixed(2);
			}
			continue;
		}

		if (attributeName) {
			attributes[attributeName] = attributeIsEncrypted ? "ENCRYPTED" : attributeData;
		} else {
			attributes[attributeUUID] = attributeData;
		}
	}

	return { ...entityObject, attributes };
};

export default processEntityVariables;
