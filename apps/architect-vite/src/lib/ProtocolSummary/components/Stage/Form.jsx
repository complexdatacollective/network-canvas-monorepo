import PropTypes from "prop-types";
import { useContext } from "react";
import Markdown from "~/lib/legacy-ui/components/Fields/Markdown";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";
import Variable from "../Variable";
import { getVariableMeta } from "../helpers";

const Form = ({ form }) => {
	const { index } = useContext(SummaryContext);

	if (!form) {
		return null;
	}

	const fieldRows =
		form.fields &&
		form.fields.map(({ prompt, variable }) => {
			const meta = getVariableMeta(index, variable);

			return [<Variable id={variable} />, meta.component, <Markdown label={prompt} />];
		});

	return (
		<div className="protocol-summary-stage__form">
			<div className="protocol-summary-stage__form-content">
				<h2 className="section-heading">Form</h2>
				{form.title && <h4>Title: {form.title}</h4>}
				<MiniTable wide rows={[["Variable", "Component", "Prompt"], ...fieldRows]} />
			</div>
		</div>
	);
};

const FieldType = PropTypes.shape({
	prompt: PropTypes.string.isRequired,
	variable: PropTypes.string.isRequired,
});

Form.propTypes = {
	form: PropTypes.shape({
		title: PropTypes.string,
		fields: PropTypes.arrayOf(FieldType).isRequired,
	}),
};

Form.defaultProps = {
	form: null,
};

export default Form;
