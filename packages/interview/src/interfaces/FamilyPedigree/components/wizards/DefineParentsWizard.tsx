import type useDialog from "@codaco/fresco-ui/dialogs/useDialog";
import type { NcEdge, NcNode } from "@codaco/shared-consts";
import type { CommitBatch, VariableConfig } from "~/interfaces/FamilyPedigree/store";
import ParentPartnershipsStep from "../quickStartWizard/ParentPartnershipsStep";
import GenericAdditionalParentsStep from "./steps/GenericAdditionalParentsStep";
import GenericBioParentsStep from "./steps/GenericBioParentsStep";
import GenericOtherParentsStep from "./steps/GenericOtherParentsStep";
import { type EgoCellResult, egoCellTransform } from "./transforms/egoCellTransform";

function getNodeDisplayName(nodeId: string, nodes: Map<string, NcNode>, variableConfig: VariableConfig): string {
	const node = nodes.get(nodeId);
	if (!node) return "This Person's";
	if (node.attributes[variableConfig.egoVariable] === true) return "Your";
	const name = node.attributes[variableConfig.nodeLabelVariable];
	return typeof name === "string" && name.length > 0 ? `${name}'s` : "This Person's";
}

export async function openDefineParentsWizard(
	openDialog: ReturnType<typeof useDialog>["openDialog"],
	focalNodeId: string,
	nodes: Map<string, NcNode>,
	_edges: Map<string, NcEdge>,
	variableConfig: VariableConfig,
): Promise<CommitBatch | null> {
	const displayName = getNodeDisplayName(focalNodeId, nodes, variableConfig);
	const title = `${displayName} Biological Parents`;

	const result = await openDialog({
		type: "wizard",
		title,
		progress: null,
		steps: [
			{
				title,
				content: GenericBioParentsStep,
			},
			{
				title: "Other parents",
				content: GenericOtherParentsStep,
			},
			{
				title: "Additional parents",
				content: GenericAdditionalParentsStep,
				skip: ({ getFieldValue }) => getFieldValue("hasOtherParents") !== true,
			},
			{
				title: "Parent partnerships",
				content: ParentPartnershipsStep,
			},
		],
		onFinish: (formValues: Record<string, unknown>) => {
			return egoCellTransform(formValues, variableConfig, focalNodeId);
		},
	});

	if (result && typeof result === "object" && "batch" in result) {
		return (result as EgoCellResult).batch;
	}

	return null;
}
