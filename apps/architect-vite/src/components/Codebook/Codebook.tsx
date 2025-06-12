import { useSelector } from "react-redux";
import { getCodebook } from "~/selectors/protocol";
import CodebookCategory from "./CodebookCategory";
import EgoType from "./EgoType";
import EntityType from "./EntityType";
import ExternalEntity from "./ExternalEntity";
import { useCodebookData } from "./useCodebookData";

const Codebook = () => {
	const codebook = useSelector(getCodebook);
	const { nodes, edges, processedNetworkAssets, hasEgoVariables, hasNodes, hasEdges, hasNetworkAssets } =
		useCodebookData(codebook);

	const hasAnyContent = hasEgoVariables || hasNodes || hasEdges;

	return (
		<div className="codebook space-y-6">
			{!hasAnyContent && (
				<div className="bg-muted border border-border rounded-lg p-6">
					<p className="text-muted-foreground text-center">
						There are currently no types or variables defined in this protocol. When you have created some interview
						stages, the types and variables will be shown here.
					</p>
				</div>
			)}

			{hasEgoVariables && (
				<CodebookCategory title="Ego">
					<EgoType entity="ego" type="ego" />
				</CodebookCategory>
			)}

			{hasNodes && (
				<CodebookCategory title="Node Types">
					<div className="space-y-4">
						{nodes.map((node) => (
							<EntityType key={node.type} entity={node.entity} type={node.type} inUse={node.inUse} usage={node.usage} />
						))}
					</div>
				</CodebookCategory>
			)}

			{hasEdges && (
				<CodebookCategory title="Edge Types">
					<div className="space-y-4">
						{edges.map((edge) => (
							<EntityType key={edge.type} entity={edge.entity} type={edge.type} inUse={edge.inUse} usage={edge.usage} />
						))}
					</div>
				</CodebookCategory>
			)}

			{hasNetworkAssets && (
				<CodebookCategory title="Network Assets">
					<div className="space-y-3">
						{processedNetworkAssets.map((networkAsset) => (
							<ExternalEntity key={networkAsset.id} id={networkAsset.id} name={networkAsset.name} />
						))}
					</div>
				</CodebookCategory>
			)}
		</div>
	);
};

export default Codebook;
