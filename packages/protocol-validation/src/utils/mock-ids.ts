export const MOCK_IDS = {
	nodeTypes: ["node-01", "node-02"],

	edgeTypes: ["edge-01", "edge-02"],

	variables: ["var-01", "var-02", "var-03", "var-04", "var-05", "var-06", "var-07", "var-08"],

	egoVariables: ["ego-var-01", "ego-var-02", "ego-var-03"],

	assets: ["asset-01", "asset-02"],
} as const;

// Helper functions for random selection
export function randomNodeType(): string {
	const randomIndex = Math.floor(Math.random() * MOCK_IDS.nodeTypes.length);
	return MOCK_IDS.nodeTypes[randomIndex] ?? "default-node-type";
}

export function randomEdgeType(): string {
	return MOCK_IDS.edgeTypes[Math.floor(Math.random() * MOCK_IDS.edgeTypes.length)] ?? "default-edge-type";
}

export function randomVariable(): string {
	return MOCK_IDS.variables[Math.floor(Math.random() * MOCK_IDS.variables.length)] ?? "default-variable";
}

export function randomEgoVariable(): string {
	return MOCK_IDS.egoVariables[Math.floor(Math.random() * MOCK_IDS.egoVariables.length)] ?? "default-ego-variable";
}
