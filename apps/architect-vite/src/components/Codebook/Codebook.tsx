import { isEmpty, map, reduce } from "es-toolkit/compat";
import { connect } from "react-redux";
import { getCodebook } from "~/selectors/codebook";
import { getEdgeIndex, getNodeIndex, utils } from "~/selectors/indexes";
import { getNetworkAssets } from "~/selectors/protocol";
import CodebookCategory from "./CodebookCategory";
import EgoType from "./EgoType";
import EntityType from "./EntityType";
import ExternalEntity from "./ExternalEntity";
import { getStageMetaByIndex, getUsage, getUsageAsStageMeta, getVariableMetaByIndex } from "./helpers";

type CodebookProps = {
	edges: any[];
	hasEdges: boolean;
	hasEgoVariables: boolean;
	hasNetworkAssets: boolean;
	hasNodes: boolean;
	networkAssets: any[];
	nodes: any[];
};

const Codebook = ({ edges, hasEdges, hasEgoVariables, hasNetworkAssets, hasNodes, networkAssets, nodes }: CodebookProps) => (
	<div className="codebook">
		{!hasEgoVariables && !hasNodes && !hasEdges && (
			<p className="codebook__notice">
				There are currently no types or variables defined in this protocol. When you have created some interview stages,
				the types and variables will be shown here.
			</p>
		)}
		{hasEgoVariables && (
			<CodebookCategory title="Ego">
				<EgoType entity="ego" type="ego" />
			</CodebookCategory>
		)}

		{hasNodes && (
			<CodebookCategory title="Node Types">
				{nodes.map((node) => (
					<EntityType
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...node}
						key={node.type}
					/>
				))}
			</CodebookCategory>
		)}

		{hasEdges && (
			<CodebookCategory title="Edge Types">
				{edges.map((edge) => (
					<EntityType
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...edge}
						key={edge.type}
					/>
				))}
			</CodebookCategory>
		)}

		{hasNetworkAssets && (
			<CodebookCategory title="Network Assets">
				{networkAssets.map((networkAsset) => (
					<ExternalEntity id={networkAsset.id} name={networkAsset.name} key={networkAsset.id} />
				))}
			</CodebookCategory>
		)}
	</div>
);


// TODO: replace this with helpers getEntityProperties. This code was
// duplicated and needs to be reconciled.
const getEntityWithUsage = (state, index, mergeProps) => {
	const search = utils.buildSearch([index]);
	return (_, id) => {
		const inUse = search.has(id);

		const variableMeta = getVariableMetaByIndex(state);
		const stageMetaByIndex = getStageMetaByIndex(state);

		const usage = inUse ? getUsageAsStageMeta(stageMetaByIndex, variableMeta, getUsage(index, id)) : [];

		return {
			...mergeProps,
			type: id,
			inUse,
			usage,
		};
	};
};

const mapStateToProps = (state) => {
	const codebook = getCodebook(state);

	const nodeIndex = getNodeIndex(state);
	const edgeIndex = getEdgeIndex(state);

	const nodes = map(codebook.node, getEntityWithUsage(state, nodeIndex, { entity: "node" }));
	const edges = map(codebook.edge, getEntityWithUsage(state, edgeIndex, { entity: "edge" }));

	const networkAssets = reduce(getNetworkAssets(state), (assets, asset, id) => [...assets, { ...asset, id }], []);

	const hasEgoVariables = !isEmpty(codebook.ego);
	const hasNodes = nodes.length > 0;
	const hasEdges = edges.length > 0;
	const hasNetworkAssets = networkAssets.length > 0;

	return {
		edges,
		hasEdges,
		hasEgoVariables,
		hasNetworkAssets,
		hasNodes,
		networkAssets,
		nodes,
	};
};

export default connect(mapStateToProps)(Codebook);
