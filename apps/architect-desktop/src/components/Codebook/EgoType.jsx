import PropTypes from "prop-types";
import React from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { getEntityProperties } from "./helpers";
import Variables from "./Variables";

const EgoType = ({ variables }) => (
	<div className="codebook__entity">
		{variables.length > 0 && (
			<div className="codebook__entity-variables codebook__entity-variables--no-border">
				<h3>Variables:</h3>
				<Variables variables={variables} entity="ego" />
			</div>
		)}
	</div>
);

EgoType.propTypes = {
	// eslint-disable-next-line react/forbid-prop-types
	variables: PropTypes.array,
};

EgoType.defaultProps = {
	variables: [],
};

const mapStateToProps = (state) => {
	const entityProperties = getEntityProperties(state, { entity: "ego" });
	return entityProperties;
};

export default compose(connect(mapStateToProps))(EgoType);
