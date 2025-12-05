import type { ComponentType } from "react";
import { useSelector } from "react-redux";
import { compose } from "recompose";
import { formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import ValidatedField from "~/components/Form/ValidatedField";
import IssueAnchor from "~/components/IssueAnchor";
import Tip from "~/components/Tip";
import type { RootState } from "~/ducks/modules/root";
import BinSortOrderSection from "../BinSortOrderSection";
import BucketSortOrderSection from "../BucketSortOrderSection";
import { getSortOrderOptionGetter } from "../CategoricalBinPrompts/optionGetters";
import withVariableOptions from "../CategoricalBinPrompts/withVariableOptions";
import EntitySelectField from "../fields/EntitySelectField/EntitySelectField";

type SelectOption = {
	label: string;
	value: string;
	[key: string]: unknown;
};

type PromptFieldsProps = {
	form: string;
	variableOptions?: SelectOption[];
};

const PromptFields = ({ form, variableOptions = [] }: PromptFieldsProps) => {
	const getOptions = getSortOrderOptionGetter(variableOptions);
	const sortMaxItems = getOptions("property", undefined, []).length;
	const getFormValue = formValueSelector(form);
	const edgeVariable = useSelector((state: RootState) => getFormValue(state, "createEdge") as string);

	return (
		<>
			<Section title="One to Many Dyad Census Prompts" layout="vertical">
				<IssueAnchor fieldName="text" description="Dyad Census Prompts" />
				<p>
					One to Many Dyad Census prompts guide your participant in evaluating relationships between a single focal node
					and several target nodes. (for example, &apos;friendship&apos;, &apos;material support&apos; or
					&apos;conflict&apos;). Enter prompt text below, and select an edge type that will be created when the
					participant selects a target node.
				</p>
				<Tip type="info">
					<p>
						Remember to write your prompt text so that it clearly indicates the participant is evaluating the
						relationship between one specific individual and each of the others shown. Use phrases such as &apos;
						<strong>which of the following people</strong>
						&apos;, or &apos;
						<strong>select all people with whom this person</strong>
						&apos; to indicate that the participant should focus on selecting from the group.
					</p>
				</Tip>
				<Row>
					<ValidatedField
						name="text"
						component={RichText as ComponentType<Record<string, unknown>>}
						validation={{ required: true, maxLength: 220 }}
						componentProps={{
							inline: true,
							className: "stage-editor-section-prompt__textarea",
							label: "Prompt Text",
							placeholder: "Enter text for the prompt here...",
						}}
					/>
				</Row>
				<Row>
					<ValidatedField
						name="createEdge"
						component={EntitySelectField as ComponentType<Record<string, unknown>>}
						validation={{ required: true }}
						componentProps={{
							entityType: "edge",
							label: "Create edges of the following type",
						}}
					/>
				</Row>
			</Section>

			<BucketSortOrderSection
				form={form}
				disabled={!edgeVariable}
				maxItems={sortMaxItems}
				optionGetter={() => getOptions("property", undefined, [])}
				summary={
					<p>
						The focal nodes are presented one at a time. You may optionally configure a list of rules to determine how
						nodes are sorted in the bucket when the task starts, which will determine the order that your participant
						evaluates their relationships. Interviewer will default to using the order in which nodes were named.
					</p>
				}
			/>
			<BinSortOrderSection
				form={form}
				disabled={!edgeVariable}
				maxItems={sortMaxItems}
				optionGetter={() => getOptions("property", undefined, [])}
				summary={
					<p>
						You may also configure one or more sort rules that determine the order that the target nodes are sorted in
						the bin.
					</p>
				}
			/>
		</>
	);
};

export default compose<PromptFieldsProps, Record<string, never>>(withVariableOptions)(PromptFields);
