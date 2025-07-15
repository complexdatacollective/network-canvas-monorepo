import { get } from "es-toolkit/compat";
import { useSelector } from "react-redux";
import Badge from "~/components/Badge";
import withSubject from "~/components/enhancers/withSubject";
import { Markdown } from "~/components/Form/Fields";
import { getColorForType } from "~/config/variables";
import { getVariablesForSubject } from "~/selectors/codebook";

type FieldPreviewProps = {
	variable: string;
	prompt: string;
	entity: string;
	type?: string | null;
};

const FieldPreview = ({ variable, prompt, entity, type = null }: FieldPreviewProps) => {
	const subjectVariables = useSelector((state) => getVariablesForSubject(state, { entity, type }));
	const codebookVariable = get(subjectVariables, variable, {});

	return (
		<div className="field-preview m-4 flex gap-2 flex-col">
			<Markdown label={prompt} className="[&>p]:m-0" />
			<div>
				<Badge color={getColorForType(codebookVariable.type)}>
					<strong>{codebookVariable.type}</strong>
					{" variable using "}
					<strong>{codebookVariable.component}</strong>
					{" input control"}
				</Badge>
			</div>
		</div>
	);
};

export default withSubject(FieldPreview);
