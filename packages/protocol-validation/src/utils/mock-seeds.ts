import { faker } from "@faker-js/faker";

export const MOCK_SEEDS = {
	NODE_TYPES: 1000,
	EDGE_TYPES: 2000,
	EGO_VARIABLES: 3000,
	NODE_VARIABLES: 4000,
	EDGE_VARIABLES: 5000,
	ASSETS: 6000,
} as const;

// Helper functions to generate consistent IDs using seeds
export function getNodeTypeId(index = 0): string {
	faker.seed(MOCK_SEEDS.NODE_TYPES + index);
	return `node-${faker.string.alphanumeric(6)}`;
}

export function getEdgeTypeId(index = 0): string {
	faker.seed(MOCK_SEEDS.EDGE_TYPES + index);
	return `edge-${faker.string.alphanumeric(6)}`;
}

export function getEgoVariableId(index = 0): string {
	faker.seed(MOCK_SEEDS.EGO_VARIABLES + index);
	return `ego-var-${faker.string.alphanumeric(6)}`;
}

export function getNodeVariableId(index = 0): string {
	faker.seed(MOCK_SEEDS.NODE_VARIABLES + index);
	return `node-var-${faker.string.alphanumeric(6)}`;
}

export function getEdgeVariableId(index = 0): string {
	faker.seed(MOCK_SEEDS.EDGE_VARIABLES + index);
	return `edge-var-${faker.string.alphanumeric(6)}`;
}

export function getAssetId(index = 0): string {
	faker.seed(MOCK_SEEDS.ASSETS + index);
	return `asset-${faker.string.alphanumeric(6)}`;
}
