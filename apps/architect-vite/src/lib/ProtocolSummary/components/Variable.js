import PropTypes from "prop-types";
import { useContext } from "react";
import { SimpleVariablePill } from "~/src/components/Form/Fields/VariablePicker/VariablePill";
import DualLink from "./DualLink";
import { getVariableMeta, getVariableName } from "./helpers";
import SummaryContext from "./SummaryContext";

const Variable = ({ id }) => {
	if (!id) return null;

	const { index } = useContext(SummaryContext);
	const meta = getVariableMeta(index, id);

	return (
		<DualLink to={`#variable-${id}`} className="protocol-summary-variable">
			<SimpleVariablePill label={getVariableName(index, id)} type={meta.type} />
		</DualLink>
	);
};

Variable.propTypes = {
	id: PropTypes.string.isRequired,
};

export default Variable;
