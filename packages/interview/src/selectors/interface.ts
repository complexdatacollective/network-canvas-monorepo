import { createSelector } from "@reduxjs/toolkit";
import { getCodebook } from "../store/modules/protocol";
import { getSubjectType } from "./session";

export const getNodeVariables = createSelector(getCodebook, getSubjectType, (codebook, nodeType) => {
	const nodeInfo = codebook.node;

	return nodeType ? (nodeInfo?.[nodeType]?.variables ?? {}) : {};
});
