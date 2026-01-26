import MiniTable from "../MiniTable";
import Variable from "../Variable";

type FamilyTreeVariablesProps = {
	relationshipTypeVariable?: string;
	relationshipToEgoVariable?: string;
	egoSexVariable?: string;
	nodeSexVariable?: string;
	nodeIsEgoVariable?: string;
};

const FamilyTreeVariables = ({
	relationshipTypeVariable,
	relationshipToEgoVariable,
	egoSexVariable,
	nodeSexVariable,
	nodeIsEgoVariable,
}: FamilyTreeVariablesProps) => {
	if (
		!relationshipTypeVariable &&
		!relationshipToEgoVariable &&
		!egoSexVariable &&
		!nodeSexVariable &&
		!nodeIsEgoVariable
	) {
		return null;
	}

	const rows = [
		relationshipTypeVariable && ["Relationship Type", <Variable key="rel-type" id={relationshipTypeVariable} />],
		relationshipToEgoVariable && ["Relationship to Ego", <Variable key="rel-ego" id={relationshipToEgoVariable} />],
		egoSexVariable && ["Ego Sex Variable", <Variable key="ego-sex" id={egoSexVariable} />],
		nodeSexVariable && ["Node Sex Variable", <Variable key="node-sex" id={nodeSexVariable} />],
		nodeIsEgoVariable && ["Node Is Ego", <Variable key="is-ego" id={nodeIsEgoVariable} />],
	].filter(Boolean) as [string, React.ReactNode][];

	return <MiniTable rotated rows={rows} />;
};

export default FamilyTreeVariables;
