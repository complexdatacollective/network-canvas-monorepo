import { z } from "zod";

// Base node schema
const baseNodeSchema = z.object({
	name: z.string().min(1, "Node name cannot be empty"),
	root: z.boolean().optional(),
});

// Stage node schema
const stageNodeSchema = baseNodeSchema.extend({
	kind: z.literal("stage"),
	next: z.string().optional(),
});

// Branch node schema with constraint: must have at least 2 next items
const branchNodeSchema = baseNodeSchema.extend({
	kind: z.literal("branch"),
	next: z.array(z.string()).min(2, "Branch nodes must have at least 2 next items").optional(),
});

// Union of node types
const nodeSchema = z.discriminatedUnion("kind", [stageNodeSchema, branchNodeSchema]);

// Line schema with custom validation for single root constraint
const lineSchema = z.record(z.string(), nodeSchema).superRefine((line, ctx) => {
	const rootNodes = Object.entries(line).filter(([_, node]) => node.root === true);

	if (rootNodes.length === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Line must have exactly one root node",
			path: [],
		});
	} else if (rootNodes.length > 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Line must have exactly one root node, found multiple root nodes",
			path: [],
		});
	}

	// Validate that all next references point to existing nodes
	for (const [nodeId, node] of Object.entries(line)) {
		if (node.kind === "stage" && node.next) {
			if (!line[node.next]) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Stage node "${nodeId}" references non-existent node "${node.next}"`,
					path: [nodeId, "next"],
				});
			}
		} else if (node.kind === "branch" && node.next) {
			for (const nextId of node.next) {
				if (!line[nextId]) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `Branch node "${nodeId}" references non-existent node "${nextId}"`,
						path: [nodeId, "next"],
					});
				}
			}
		}
	}
});

// Export types
export type BaseNode = z.infer<typeof baseNodeSchema>;
export type StageNode = z.infer<typeof stageNodeSchema>;
export type BranchNode = z.infer<typeof branchNodeSchema>;
export type Node = z.infer<typeof nodeSchema>;
export type Line = z.infer<typeof lineSchema>;

// Export schemas
export { baseNodeSchema, branchNodeSchema, lineSchema, nodeSchema, stageNodeSchema };

// Utility function to generate unique IDs
const generateId = (): string => {
	return Math.random().toString(36).substring(2, 16);
};

// Utility function to create a valid stage node
export const createStageNode = (
	name: string,
	options: {
		root?: boolean;
		next?: string;
	} = {},
): { id: string; node: StageNode } => {
	const id = generateId();
	const node: StageNode = {
		kind: "stage",
		name,
		...(options.root !== undefined && { root: options.root }),
		...(options.next && { next: options.next }),
	};
	return { id, node };
};

// Utility function to create a valid branch node
export const createBranchNode = (
	name: string,
	next: string[],
	options: {
		root?: boolean;
	} = {},
): { id: string; node: BranchNode } => {
	if (next.length < 2) {
		throw new Error("Branch nodes must have at least 2 next items");
	}

	const id = generateId();
	const node: BranchNode = {
		kind: "branch",
		name,
		next,
		...(options.root !== undefined && { root: options.root }),
	};
	return { id, node };
};

// Utility function to create a minimal valid line
export const createValidLine = (stages: Array<{ name: string; kind?: "stage" | "branch"; next?: string[] }>): Line => {
	if (stages.length === 0) {
		throw new Error("Line must have at least one stage");
	}

	const line: Record<string, Node> = {};
	const nodeIds: string[] = [];

	// First pass: create all nodes and collect IDs
	for (const stage of stages) {
		const id = generateId();
		nodeIds.push(id);

		if (stage.kind === "branch") {
			if (!stage.next || stage.next.length < 2) {
				throw new Error(`Branch node "${stage.name}" must have at least 2 next items`);
			}
			line[id] = {
				kind: "branch",
				name: stage.name,
				next: stage.next,
			};
		} else {
			line[id] = {
				kind: "stage",
				name: stage.name,
			};
		}
	}

	// Set the first node as root
	const firstNodeId = nodeIds[0];
	if (firstNodeId && line[firstNodeId]) {
		line[firstNodeId] = { ...line[firstNodeId], root: true };
	}

	// Second pass: link nodes sequentially if no custom next is provided
	for (let i = 0; i < nodeIds.length - 1; i++) {
		const currentId = nodeIds[i];
		const nextId = nodeIds[i + 1];

		if (!currentId || !nextId) continue;

		const currentNode = line[currentId];
		if (!currentNode) continue;

		if (currentNode.kind === "stage" && !stages[i]?.next) {
			line[currentId] = { ...currentNode, next: nextId };
		}
	}

	return line;
};

// Utility function to validate a line object
export const validateLine = (line: unknown): { success: true; data: Line } | { success: false; errors: string[] } => {
	const result = lineSchema.safeParse(line);

	if (result.success) {
		return { success: true, data: result.data };
	}
	return {
		success: false,
		errors: result.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`),
	};
};

// Utility function to check if a line is valid
export const isValidLine = (line: unknown): line is Line => {
	return lineSchema.safeParse(line).success;
};

// Pool of possible stage names for random generation
const STAGE_NAMES = [
	"Information",
	"EgoForm",
	"NameGenerator",
	"NameGeneratorQuickAdd",
	"NameGeneratorRoster",
	"Sociogram",
	"DyadCensus",
	"TieStrengthCensus",
	"OrdinalBin",
	"CategoricalBin",
	"Narrative",
	"AlterForm",
	"AlterEdgeForm",
	"Anonymisation",
	"OneToManyDyadCensus",
	"FamilyTreeCensus",
	"Geospatial",
];

const BRANCH_NAMES = [
	"Decision Point",
	"Branch Point",
	"Path Split",
	"Route Choice",
	"Flow Division",
	"Stage Fork",
	"Protocol Branch",
	"Path Divergence",
];

// Utility function to get a random item from an array
const getRandomItem = <T>(array: T[]): T => {
	if (array.length === 0) {
		throw new Error("Cannot get random item from empty array");
	}
	const item = array[Math.floor(Math.random() * array.length)];
	if (item === undefined) {
		throw new Error("Selected item is undefined");
	}
	return item;
};

// Utility function to create a random valid line
export const createSampleLine = (): Line => {
	const allNodes: Record<string, Node> = {};

	// Always create the FinishStage first
	const finishStageId = generateId();
	allNodes[finishStageId] = {
		kind: "stage",
		name: "FinishStage",
		// No next property - this is the terminal node
	};

	// Create the root stage
	const rootStageName = getRandomItem(STAGE_NAMES);
	const rootId = generateId();
	allNodes[rootId] = {
		kind: "stage",
		name: rootStageName,
		root: true,
	};

	// Build the line with proper convergence handling
	buildTimelineWithConvergence(rootId, allNodes, finishStageId, 0, 5);

	return allNodes;
};

// Helper function to recursively build line structure
const buildTimelineWithConvergence = (
	currentNodeId: string,
	allNodes: Record<string, Node>,
	finishStageId: string,
	currentDepth: number,
	maxDepth = 5,
): void => {
	// Stop recursion if we've reached max depth
	if (currentDepth >= maxDepth) {
		// Connect to FinishStage if we're at max depth
		const currentNode = allNodes[currentNodeId];
		if (currentNode && currentNode.kind === "stage") {
			allNodes[currentNodeId] = { ...currentNode, next: finishStageId };
		}
		return;
	}

	const currentNode = allNodes[currentNodeId];
	if (!currentNode) return;

	// 50% chance to create a branch, 50% chance for linear continuation
	const shouldBranch = Math.random() > 0.5 && currentDepth < maxDepth - 1;

	if (shouldBranch) {
		// Create a branch node
		const branchName = getRandomItem(BRANCH_NAMES);
		const branchId = generateId();

		// Create 2-5 branch paths
		const numBranches = Math.floor(Math.random() * 4) + 2;
		const branchPaths: string[] = [];

		// Create each branch path
		for (let i = 0; i < numBranches; i++) {
			const branchPath = createBranchPath(allNodes, finishStageId, currentDepth + 1, maxDepth);
			if (branchPath.length > 0) {
				branchPaths.push(branchPath[0]); // First node of the branch path
			}
		}

		if (branchPaths.length >= 2) {
			// Create the branch node
			allNodes[branchId] = {
				kind: "branch",
				name: branchName,
				next: branchPaths,
			};

			// Connect current node to branch
			if (currentNode.kind === "stage") {
				allNodes[currentNodeId] = { ...currentNode, next: branchId };
			}
		} else {
			// Fallback to linear continuation
			createLinearPath(currentNodeId, allNodes, finishStageId, currentDepth, maxDepth);
		}
	} else {
		// Create linear continuation
		createLinearPath(currentNodeId, allNodes, finishStageId, currentDepth, maxDepth);
	}
};

// Helper function to create a branch path that can contain nested branches
const createBranchPath = (
	allNodes: Record<string, Node>,
	finishStageId: string,
	currentDepth: number,
	maxDepth: number,
): string[] => {
	const pathIds: string[] = [];

	// Create 1-5 stages for this branch path (reduced for better nesting)
	const numStages = Math.floor(Math.random() * 5) + 1;

	for (let i = 0; i < numStages; i++) {
		const stageName = getRandomItem(STAGE_NAMES);
		const stageId = generateId();

		allNodes[stageId] = {
			kind: "stage",
			name: stageName,
		};

		pathIds.push(stageId);

		// Link to previous stage in this path
		if (i > 0) {
			const prevId = pathIds[i - 1];
			const prevNode = allNodes[prevId];
			if (prevNode && prevNode.kind === "stage") {
				allNodes[prevId] = { ...prevNode, next: stageId };
			}
		}

		// 30% chance to create a nested branch within this path
		if (Math.random() > 0.7 && currentDepth < maxDepth - 1 && i === numStages - 1) {
			// Use the recursive function to potentially create more branching
			buildTimelineWithConvergence(stageId, allNodes, finishStageId, currentDepth + 1, maxDepth);
			return pathIds; // Let recursion handle the rest
		}
	}

	// Handle convergence for the last stage in this branch path
	if (pathIds.length > 0) {
		const lastStageId = pathIds[pathIds.length - 1];
		handleBranchConvergence(lastStageId, allNodes, finishStageId, currentDepth);
	}

	return pathIds;
};

// Helper function to handle branch convergence
const handleBranchConvergence = (
	lastStageId: string,
	allNodes: Record<string, Node>,
	finishStageId: string,
	_currentDepth: number,
): void => {
	// For now, implement simple convergence to FinishStage
	// In the future, this could implement logic to converge with later stages
	const currentNode = allNodes[lastStageId];
	if (currentNode && currentNode.kind === "stage") {
		// 70% chance to connect to FinishStage, 30% chance to leave unconnected for now
		// (The unconnected ones could later converge with other branches)
		if (Math.random() > 0.3) {
			allNodes[lastStageId] = { ...currentNode, next: finishStageId };
		} else {
			// For now, still connect to FinishStage to ensure all paths end somewhere
			// TODO: Implement convergence with later stages
			allNodes[lastStageId] = { ...currentNode, next: finishStageId };
		}
	}
};
// Helper function to create linear continuation
const createLinearPath = (
	currentNodeId: string,
	allNodes: Record<string, Node>,
	finishStageId: string,
	currentDepth: number,
	maxDepth: number,
): void => {
	const currentNode = allNodes[currentNodeId];
	if (!currentNode || currentNode.kind !== "stage") return;

	// 60% chance to continue, 40% chance to end (but always connect somewhere)
	const shouldContinue = Math.random() > 0.4 && currentDepth < maxDepth - 1;

	if (shouldContinue) {
		// Create next stage
		const nextStageName = getRandomItem(STAGE_NAMES);
		const nextId = generateId();

		allNodes[nextId] = {
			kind: "stage",
			name: nextStageName,
		};

		// Connect current to next
		allNodes[currentNodeId] = { ...currentNode, next: nextId };

		// Continue recursively
		buildTimelineWithConvergence(nextId, allNodes, finishStageId, currentDepth + 1, maxDepth);
	} else {
		// End this path - connect to FinishStage
		allNodes[currentNodeId] = { ...currentNode, next: finishStageId };
	}
};
