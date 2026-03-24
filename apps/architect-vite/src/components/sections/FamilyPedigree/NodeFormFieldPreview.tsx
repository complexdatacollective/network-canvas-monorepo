import { get } from "es-toolkit/compat";
import { useSelector } from "react-redux";
import { formValueSelector } from "redux-form";
import Badge from "~/components/Badge";
import { Markdown } from "~/components/Form/Fields";
import { getColorForType } from "~/config/variables";
import type { RootState } from "~/ducks/store";
import { getVariablesForSubject } from "~/selectors/codebook";

type NodeFormFieldPreviewProps = {
	variable: string;
	prompt: string;
	form: string;
};

const NodeFormFieldPreview = ({ variable, prompt, form }: NodeFormFieldPreviewProps) => {
	const nodeType = useSelector(
		(state: RootState) => formValueSelector(form)(state, "nodeConfig.type") as string | undefined,
	);

	const subjectVariables = useSelector((state: RootState) =>
		getVariablesForSubject(state, { entity: "node", type: nodeType }),
	);
	const codebookVariable = get(subjectVariables, variable, {}) as {
		type?: string;
		component?: string;
	};

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

export default NodeFormFieldPreview;
