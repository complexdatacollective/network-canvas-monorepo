import MiniTable from "../MiniTable";
import Variable from "../Variable";

type FamilyTreeVariablesProps = {
	relationshipTypeVariable?: string;
	relationshipToEgoVariable?: string;
	sexVariable?: string;
	nodeIsEgoVariable?: string;
};

const FamilyTreeVariables = ({
	relationshipTypeVariable,
	relationshipToEgoVariable,
	sexVariable,
	nodeIsEgoVariable,
}: FamilyTreeVariablesProps) => {
	if (!relationshipTypeVariable && !relationshipToEgoVariable && !sexVariable && !nodeIsEgoVariable) {
		return null;
	}

	const rows = [
		relationshipTypeVariable && ["Relationship Type", <Variable key="rel-type" id={relationshipTypeVariable} />],
		relationshipToEgoVariable && ["Relationship to Ego", <Variable key="rel-ego" id={relationshipToEgoVariable} />],
		sexVariable && ["Sex Variable", <Variable key="sex" id={sexVariable} />],
		nodeIsEgoVariable && ["Node Is Ego", <Variable key="is-ego" id={nodeIsEgoVariable} />],
	].filter(Boolean) as [string, React.ReactNode][];

	return (
		<div className="protocol-summary-stage__family-tree-variables">
			<div className="protocol-summary-stage__family-tree-variables-content">
				<h2 className="section-heading">Family Tree Variables</h2>
				<MiniTable rotated rows={rows} />
			</div>
		</div>
	);
};

export default FamilyTreeVariables;
