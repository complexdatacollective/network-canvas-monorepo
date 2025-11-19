import { compose } from "recompose";
import { Row, Section } from "~/components/EditorLayout";
import { ValidatedField } from "~/components/Form";
import ColorPicker from "~/components/Form/Fields/ColorPicker";
import IssueAnchor from "~/components/IssueAnchor";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import Options from "~/components/Options";
import { getSortOrderOptionGetter } from "~/components/sections/CategoricalBinPrompts/optionGetters";
import withVariableHandlers from "~/components/sections/CategoricalBinPrompts/withVariableHandlers";
import withVariableOptions from "~/components/sections/CategoricalBinPrompts/withVariableOptions";
import PromptText from "~/components/sections/PromptText";
import Tip from "~/components/Tip";
import { getFieldId } from "~/utils/issues";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import BinSortOrderSection from "../BinSortOrderSection";
import BucketSortOrderSection from "../BucketSortOrderSection";

type SelectOption = {
	label: string;
	value: string;
	type?: string;
	[key: string]: unknown;
};

interface PromptFieldsProps {
	variableOptions?: SelectOption[];
	entity: string;
	type: string;
	changeForm: (form: string, field: string, value: unknown) => void;
	form: string;
	variable?: string | null;
	optionsForVariableDraft?: SelectOption[];
}

const PromptFields = ({
	changeForm,
	entity,
	form,
	type,
	variable = undefined,
	variableOptions = [],
	optionsForVariableDraft = [],
}: PromptFieldsProps) => {
	const newVariableWindowInitialProps = {
		entity,
		type,
		initialValues: { name: null, type: null },
	};

	const handleCreatedNewVariable = (id: string, { field }: { field: string }) => changeForm(form, field, id);

	const [newVariableWindowProps, openNewVariableWindow] = useNewVariableWindowState(
		newVariableWindowInitialProps,
		handleCreatedNewVariable,
	);

	const handleNewVariable = (name: string) =>
		openNewVariableWindow({ initialValues: { name, type: "ordinal" } }, { field: "variable" });

	const ordinalVariableOptions = variableOptions.filter(({ type: variableType }) => variableType === "ordinal");

	const sortMaxItems = getSortOrderOptionGetter(variableOptions)("property").length;

	const totalOptionsLength = optionsForVariableDraft?.length;

	const showVariableOptionsTip = totalOptionsLength > 5;

	return (
		<>
			<PromptText />
			<Section title="Ordinal Variable" layout="vertical">
				<Row>
					<div id={getFieldId("variable")} />
					<ValidatedField
						name="variable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity,
							type,
							options: ordinalVariableOptions,
							onCreateOption: handleNewVariable,
							variable,
						}}
					/>
				</Row>
			</Section>
			{variable && (
				<Section
					title="Variable Options"
					summary={
						<p>
							Create <strong>up to 5</strong> options for this variable.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<div id={getFieldId("variableOptions")} />
						{showVariableOptionsTip && (
							<Tip type="error">
								<p>
									The ordinal bin interface is designed to use <strong>up to 5 option values </strong>. Using more will
									create a sub-optimal experience for participants, and might reduce data quality.
								</p>
							</Tip>
						)}
						<Options name="variableOptions" label="Options" />
					</Row>
				</Section>
			)}
			<Section
				title="Color"
				summary={<p>Interviewer will render each option in your ordinal variable using a color gradient.</p>}
				layout="vertical"
			>
				<Row>
					<IssueAnchor fieldName="color" description="Gradient color" />
					<ValidatedField
						name="color"
						component={ColorPicker}
						validation={{ required: true }}
						componentProps={{
							label: "Which color would you like to use for this scale?",
							palette: "ord-color-seq",
							paletteRange: 8,
						}}
					/>
				</Row>
			</Section>
			<BucketSortOrderSection
				form={form}
				disabled={!variable}
				maxItems={sortMaxItems}
				optionGetter={getSortOrderOptionGetter(variableOptions) as (property: string) => { label: string; value: string }[]}
			/>
			<BinSortOrderSection
				form={form}
				disabled={!variable}
				maxItems={sortMaxItems}
				optionGetter={getSortOrderOptionGetter(variableOptions) as (property: string) => { label: string; value: string }[]}
			/>
			<NewVariableWindow
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...newVariableWindowProps}
			/>
		</>
	);
};

export default compose<PromptFieldsProps, PromptFieldsProps>(withVariableOptions, withVariableHandlers)(PromptFields);
