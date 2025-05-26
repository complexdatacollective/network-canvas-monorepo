import PropTypes from "prop-types";
import { compose } from "recompose";
import RuleText from "~/src/components/Query/Rules/PreviewText";
import withDisplayOptions from "~/src/components/Query/Rules/withDisplayOptions";

const Rule = ({ type, options }) => <RuleText type={type} options={options} />;

Rule.propTypes = {
	type: PropTypes.string.isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	options: PropTypes.object.isRequired,
};

export default compose(withDisplayOptions)(Rule);
