import { get } from "es-toolkit/compat";
import { useSelector } from "react-redux";
import { formValueSelector } from "redux-form";
import Badge from "~/components/Badge";
import { Markdown } from "~/components/Form/Fields";
import { getColorForType } from "~/config/variables";
import type { RootState } from "~/ducks/store";
import { getVariablesForSubject } from "~/selectors/codebook";

type NominationPromptPreviewProps = {
	text: string;
	variable: string;
	form: string;
};

const NominationPromptPreview = ({ text, variable, form }: NominationPromptPreviewProps) => {
	const nodeType = useSelector(
		(state: RootState) => formValueSelector(form)(state, "nodeConfig.type") as string | undefined,
	);

	const subjectVariables = useSelector((state: RootState) =>
		getVariablesForSubject(state, { entity: "node", type: nodeType }),
	);
	const codebookVariable = get(subjectVariables, variable, {}) as {
		name?: string;
		type?: string;
	};

	return (
		<div className="m-(--space-md) flex gap-(--space-sm) flex-col">
			<Markdown label={text} className="[&>p]:m-0" />
			<div>
				<Badge color={getColorForType(codebookVariable.type)}>
					<strong>{codebookVariable.type}</strong>
					{" variable: "}
					<strong>{codebookVariable.name}</strong>
				</Badge>
			</div>
		</div>
	);
};

export default NominationPromptPreview;
