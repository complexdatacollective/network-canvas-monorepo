import { Field as RichText } from "@codaco/legacy-ui/components/Fields/RichText";
import { omit } from "es-toolkit/compat";
import { compose } from "recompose";
import { Row, Section } from "~/components/EditorLayout";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import ValidatedField from "~/components/Form/ValidatedField";
import Options from "~/components/Options";
import Parameters from "~/components/Parameters";
import { isBooleanWithOptions, isOrdinalOrCategoricalType, isVariableTypeWithParameters } from "~/config/variables";
import { getFieldId } from "~/utils/issues";
import BooleanChoice from "../../BooleanChoice";
import ExternalLink from "../../ExternalLink";
import InputPreview from "../../Form/Fields/InputPreview";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import Tip from "../../Tip";
import ValidationSection from "../ValidationSection";
import withFieldsHandlers from "./withFieldsHandlers";

type ExistingVariable = {
	name: string;
};

type PromptFieldsProps = {
	form: string;
	variable?: string | null;
	existingVariables?: Record<string, ExistingVariable> | null;
	variableType?: string | null;
	variableOptions?: any[] | null;
	componentOptions?: any[] | null;
	component?: string | null;
	isNewVariable: boolean;
	metaForType?: Record<string, unknown>;
	handleNewVariable: () => void;
	handleChangeComponent: (component: string) => void;
	handleChangeVariable: (variable: string) => void;
	entity?: string | null;
	type?: string | null;
};

const PromptFields = ({
	form,
	variable = null,
	existingVariables = null,
	variableType = null,
	variableOptions = null,
	componentOptions = null,
	component = null,
	isNewVariable,
	metaForType = {},
	handleNewVariable,
	handleChangeComponent,
	handleChangeVariable,
	entity = null,
	type = null,
}: PromptFieldsProps) => (
	<>
		<Section id={getFieldId("variable")} title="Variable">
			<Row>
				{variable && !isNewVariable && (
					<Tip>
						<p>
							When selecting an existing variable, changes you make to the input control or validation options will also
							change other uses of this variable.
						</p>
					</Tip>
				)}
				<ValidatedField
					name="variable"
					component={VariablePicker}
					variable={variable}
					entity={entity}
					type={type}
					options={variableOptions} // from variables
					onCreateOption={handleNewVariable} // reset later fields, create variable of no type?
					onChange={handleChangeVariable} // read/reset component options validation
					validation={{ required: true }}
				/>
			</Row>
		</Section>
		<Section
			title="Question Prompt"
			id={getFieldId("prompt")}
			summary={<p>Enter question for the participant. e.g. What is this person&apos;s name?</p>}
		>
			<Row>
				<ValidatedField
					name="prompt"
					component={RichText}
					inline
					placeholder="What is this person's name?"
					validation={{ required: true }}
				/>
			</Row>
		</Section>
		<Section
			disabled={!variable}
			title="Input Control"
			id={getFieldId("component")}
			summary={
				<p>
					Choose an input control that should be used to collect the answer. For detailed information about these
					options, see our{" "}
					<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/input-controls/">
						documentation
					</ExternalLink>
					.
				</p>
			}
		>
			<Row>
				<ValidatedField
					name="component"
					component={NativeSelect}
					placeholder="Select an input control"
					options={componentOptions}
					validation={{ required: true }}
					onChange={handleChangeComponent}
					sortOptionsByLabel={!isNewVariable}
				/>
				{isNewVariable && variableType && (
					<Tip>
						<p>
							The selected input control will cause this variable to be defined as type <strong>{variableType}</strong>.
							Once set, this cannot be changed (although you may change the input control within this type).
						</p>
					</Tip>
				)}
				{!isNewVariable && variableType && (
					<Tip type="warning">
						<div>
							<p>
								A pre-existing variable is currently selected. You cannot change a variable type after it has been
								created, so only <strong>{variableType}</strong> compatible input controls can be selected above. If you
								would like to use a different input control type, you will need to create a new variable.
							</p>
						</div>
					</Tip>
				)}
			</Row>
			{variableType && (
				<Row>
					<h4>Preview</h4>
					<InputPreview
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...metaForType}
					/>
				</Row>
			)}
		</Section>
		{isOrdinalOrCategoricalType(variableType) && (
			<Section
				id={getFieldId("options")}
				title="Categorical/Ordinal options"
				summary={
					<p>
						The input type you selected indicates that this is a categorical or ordinal variable. Next, please create a
						minimum of two possible values for the participant to choose between.
					</p>
				}
			>
				<Row>
					<Options name="options" label="Options" form={form} />
				</Row>
			</Section>
		)}
		{isBooleanWithOptions(component) && (
			<Section id={getFieldId("parameters")} title="BooleanChoice Options">
				<Row>
					<BooleanChoice form={form} />
				</Row>
			</Section>
		)}
		{isVariableTypeWithParameters(variableType) && (
			<Section title="Input Options" id={getFieldId("parameters")}>
				<Row>
					<Parameters type={variableType} component={component} name="parameters" form={form} />
				</Row>
			</Section>
		)}
		<ValidationSection
			form={form}
			disabled={!variableType}
			entity={entity}
			variableType={variableType}
			existingVariables={omit(existingVariables, variable)}
		/>
	</>
);

export { PromptFields };

export default compose(withFieldsHandlers)(PromptFields);
