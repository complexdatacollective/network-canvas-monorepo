import { toPairs } from "lodash";
import { useContext } from "react";
import Entity from "./Entity";
import SummaryContext from "./SummaryContext";

type NodeOrEdgeType = {
	color?: string;
	iconVariant?: string;
	name: string;
	variables?: Record<string, unknown>;
};

const Codebook = () => {
	const { protocol } = useContext(SummaryContext);
	const codebook = protocol.codebook as {
		node?: Record<string, NodeOrEdgeType>;
		edge?: Record<string, NodeOrEdgeType>;
		ego?: { variables?: Record<string, unknown> };
	};

	const nodes = toPairs(codebook.node ?? {});
	const edges = toPairs(codebook.edge ?? {});

	return (
		<div className="landscape">
			{codebook.ego && <Entity entity="ego" variables={codebook.ego.variables} />}
			{nodes.map(([id, node]) => (
				<Entity key={id} entity="node" type={id} variables={node.variables} />
			))}
			{edges.map(([id, edge]) => (
				<Entity key={id} entity="edge" type={id} variables={edge.variables} />
			))}
		</div>
	);
};

export default Codebook;
