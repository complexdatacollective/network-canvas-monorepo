import { connect } from "react-redux";
import { compose } from "recompose";
import Variables from "./Variables";
import { getEntityProperties } from "./helpers";

type EgoTypeProps = {
	variables?: any[];
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


const mapStateToProps = (state) => {
	const entityProperties = getEntityProperties(state, { entity: "ego" });
	return entityProperties;
};

export default compose(connect(mapStateToProps))(EgoType);
