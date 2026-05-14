import { useContext } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import { getVariableMeta } from "../helpers";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";
import Variable from "../Variable";
import SectionFrame from "./SectionFrame";

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

	const fieldRows =
		form.fields?.map(({ prompt, variable }) => {
			const meta = getVariableMeta(index, variable);

			return [
				<Variable key={`var-${variable}`} id={variable} />,
				<span key={`comp-${variable}`}>{meta.component ?? ""}</span>,
				<Markdown key={`prompt-${variable}`} label={prompt} />,
			];
		}) ?? [];

	return (
		<SectionFrame title="Form" wrapperClassName="break-inside-avoid">
			{form.title && <h4>Title: {form.title}</h4>}
			<MiniTable wide rows={[["Variable", "Component", "Prompt"], ...fieldRows]} />
		</SectionFrame>
	);
};

export default Form;
