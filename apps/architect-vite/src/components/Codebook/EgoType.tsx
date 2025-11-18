import { connect } from "react-redux";
import { compose } from "recompose";
import type { RootState } from "~/ducks/store";
import { getEntityProperties } from "./helpers";
import Variables from "./Variables";

type Variable = {
	id: string;
	name: string;
	component: string;
	inUse: boolean;
	usage: unknown;
};

type EgoTypeProps = {
	variables?: Variable[];
};

const EgoType = ({ variables = [] }: EgoTypeProps) => (
	<div className="codebook__entity">
		{variables.length > 0 && (
			<div className="codebook__entity-variables codebook__entity-variables--no-border">
				<h3>Variables:</h3>
				<Variables variables={variables} entity="ego" />
			</div>
		)}
	</div>
);

const mapStateToProps = (state: RootState) => {
	const entityProperties = getEntityProperties(state, { entity: "ego" });
	return entityProperties;
};

export default compose(connect(mapStateToProps))(EgoType);
