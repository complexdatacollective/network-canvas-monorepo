import Node from "@codaco/legacy-ui/Node";
import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { getNodeTypes } from "../selectors/codebook";

type NodeType = {
	color?: string;
	name?: string;
};

type NodeTypes = Record<string, NodeType>;

type PreviewNodeProps = {
	nodeTypes: NodeTypes;
	type?: string;
};

type RootState = {
	[key: string]: any;
};

const mapStateToProps = (state: RootState) => ({
	nodeTypes: getNodeTypes(state),
});

const PreviewNode = ({ nodeTypes, type = "" }: PreviewNodeProps) => {
	const color = get(nodeTypes, [type, "color"], "node-color-seq-1");
	const label = get(nodeTypes, [type, "name"], "");

	return <Node label={label} color={color} />;
};

export { PreviewNode };

export default connect(mapStateToProps)(PreviewNode);
