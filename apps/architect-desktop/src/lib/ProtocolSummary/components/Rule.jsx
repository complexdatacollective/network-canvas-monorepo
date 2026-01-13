import RuleText from "@components/Query/Rules/PreviewText";
import withDisplayOptions from "@components/Query/Rules/withDisplayOptions";
import PropTypes from "prop-types";
import React from "react";
import { compose } from "recompose";

const Rule = ({ type, options }) => <RuleText type={type} options={options} />;

Rule.propTypes = {
	type: PropTypes.string.isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	options: PropTypes.object.isRequired,
};

export default compose(withDisplayOptions)(Rule);
