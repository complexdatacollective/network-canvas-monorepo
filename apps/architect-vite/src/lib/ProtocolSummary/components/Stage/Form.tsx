import { useContext } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";
import Variable from "../Variable";
import { getVariableMeta } from "../helpers";

type FormFieldType = {
	prompt: string;
	variable: string;
};

type FormProps = {
	form?: {
		title?: string;
		fields?: FormFieldType[];
	} | null;
};

const Form = ({ form = null }: FormProps) => {
	const { index } = useContext(SummaryContext);

	if (!form) {
		return null;
	}

	const fieldRows = form.fields?.map(({ prompt, variable }) => {
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

export default Form;
