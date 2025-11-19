import { compose } from "recompose";
import { Row, Section } from "~/components/EditorLayout";
import { ValidatedField } from "~/components/Form";
import RichTextField from "~/components/Form/Fields/RichText";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import Options from "~/components/Options";
import PromptText from "~/components/sections/PromptText";
import Tip from "~/components/Tip";
import { getFieldId } from "~/utils/issues";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import BinSortOrderSection from "../BinSortOrderSection";
import BucketSortOrderSection from "../BucketSortOrderSection";
import { getSortOrderOptionGetter } from "./optionGetters";
import withVariableHandlers from "./withVariableHandlers";
import withVariableOptions from "./withVariableOptions";

type VariableOption = {
	label: string;
	value: string;
	type: string;
};

type PromptFieldsProps = {
	changeForm: (form: string, field: string, value: unknown) => void;
	entity: string;
	form: string;
	onCreateOtherVariable: (value: string, field: string) => void;
	optionsForVariableDraft?: Array<Record<string, unknown>>;
	otherVariable?: string;
	type: string;
	variable?: string;
	variableOptions?: VariableOption[];
};

const PromptFields = ({
	changeForm,
	entity,
	form,
	onCreateOtherVariable,
	optionsForVariableDraft = [],
	otherVariable = null,
	type,
	variable = null,
	variableOptions = [],
}: PromptFieldsProps) => {
	const newVariableWindowInitialProps = {
		entity,
		type,
		initialValues: { name: null, type: null },
	};

	const handleCreatedNewVariable = (id, { field }) => changeForm(form, field, id);

	const handleToggleOtherVariable = (nextState) => {
		if (nextState === false) {
			changeForm(form, "otherVariable", null);
			changeForm(form, "otherVariablePrompt", null);
			changeForm(form, "otherOptionLabel", null);
		}

		return true;
	};

	const [newVariableWindowProps, openNewVariableWindow] = useNewVariableWindowState(
		newVariableWindowInitialProps,
		handleCreatedNewVariable,
	);

	const handleNewVariable = (name) =>
		openNewVariableWindow({ initialValues: { name, type: "categorical" } }, { field: "variable" });

	const categoricalVariableOptions = variableOptions.filter(({ type: variableType }) => variableType === "categorical");

	const otherVariableOptions = variableOptions.filter(({ type: variableType }) => variableType === "text");

	const sortMaxItems = getSortOrderOptionGetter(variableOptions)("property").length;

	const totalOptionsLength = optionsForVariableDraft && optionsForVariableDraft.length + (!!otherVariable && 1);

	const showVariableOptionsTip = totalOptionsLength > 8;

	return (
		<>
			<PromptText />
			<Section title="Categorical Variable" id={getFieldId("variable")} layout="vertical">
				<Row>
					<ValidatedField
						name="variable"
						component={VariablePicker}
						type={type}
						entity={entity}
						options={categoricalVariableOptions}
						onCreateOption={handleNewVariable}
						validation={{ required: true }}
						variable={variable}
					/>
				</Row>
				{variable && (
					<Row>
						<h3 id={getFieldId("options")}>Variable Options</h3>
						<p>
							Create <strong>up to 8</strong> options for this variable.
						</p>
						{showVariableOptionsTip && (
							<Tip type="error">
								<p>
									The categorical bin interface is designed to use <strong>up to 8 option values</strong> ( including an
									&quot;other&quot; variable). Using more will create a sub-optimal experience for participants, and
									might reduce data quality. Consider grouping your variable options and capturing further detail with
									follow-up questions.
								</p>
							</Tip>
						)}
						<Options name="variableOptions" label="Options" />
					</Row>
				)}
			</Section>
			<Section
				disabled={!variable}
				title="Follow-up &quot;Other&quot; Option"
				summary={
					<p>
						You can optionally create an &quot;other&quot; option that triggers a follow-up dialog when nodes are
						dropped within it, and stores the value the participant enters in a designated variable. This feature may be
						useful in order to collect values you might not have listed above.
					</p>
				}
				toggleable
				startExpanded={!!otherVariable}
				handleToggleChange={handleToggleOtherVariable}
				layout="vertical"
			>
				<Row>
					<ValidatedField
						name="otherVariable"
						component={VariablePicker}
						entity={entity}
						type={type}
						options={otherVariableOptions}
						onCreateOption={(value) => onCreateOtherVariable(value, "otherVariable")}
						validation={{ required: true }}
						variable={otherVariable}
					/>
				</Row>
				<Row>
					<ValidatedField
						name="otherOptionLabel"
						component={RichTextField}
						inline
						placeholder="Enter a label (such as &quot;other&quot;) for this bin..."
						label="Label for Bin"
						validation={{ required: true }}
					/>
				</Row>
				<Row>
					<ValidatedField
						name="otherVariablePrompt"
						component={RichTextField}
						inline
						placeholder="Enter a question prompt to show when the other option is triggered..."
						label="Question Prompt for Dialog"
						validation={{ required: true }}
					/>
				</Row>
			</Section>
			<BucketSortOrderSection
				form={form}
				disabled={!variable}
				maxItems={sortMaxItems}
				optionGetter={getSortOrderOptionGetter(variableOptions)}
			/>
			<BinSortOrderSection
				form={form}
				disabled={!variable}
				maxItems={sortMaxItems}
				optionGetter={getSortOrderOptionGetter(variableOptions)}
			/>
			<NewVariableWindow
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...newVariableWindowProps}
			/>
		</>
	);
};

export default compose(withVariableOptions, withVariableHandlers)(PromptFields);
