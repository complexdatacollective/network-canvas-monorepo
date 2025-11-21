import { omit } from "es-toolkit/compat";
import type { ComponentType } from "react";
import { Row, Section } from "~/components/EditorLayout";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import { Field as RichText } from "~/components/Form/Fields/RichText";
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
import { useFieldHandlers } from "./withFieldsHandlers";

type PromptFieldsProps = {
	form: string;
	entity?: string | null;
	type?: string | null;
};

const PromptFields = ({ form, entity = null, type = null }: PromptFieldsProps) => {
	const {
		variable,
		variableType,
		isNewVariable,
		variableOptions,
		component,
		componentOptions,
		metaForType,
		existingVariables,
		handleNewVariable,
		handleChangeVariable,
		handleChangeComponent,
	} = useFieldHandlers({
		form,
		entity: entity ?? "",
		type: type ?? "",
	});

	return (
		<>
			<Section id={getFieldId("variable")} title="Variable" layout="vertical">
				<Row>
					{variable && !isNewVariable && (
						<Tip>
							<p>
								When selecting an existing variable, changes you make to the input control or validation options will
								also change other uses of this variable.
							</p>
						</Tip>
					)}
					<ValidatedField
						name="variable"
						component={VariablePicker as ComponentType<Record<string, unknown>>}
						validation={{ required: true }}
						componentProps={{
							entity: entity ?? undefined,
							type: type ?? undefined,
							options: variableOptions,
							onCreateOption: handleNewVariable,
							onChange: handleChangeVariable,
						}}
					/>
				</Row>
			</Section>
			<Section
				title="Question Prompt"
				id={getFieldId("prompt")}
				summary={<p>Enter question for the participant. e.g. What is this person&apos;s name?</p>}
				layout="vertical"
			>
				<Row>
					<ValidatedField
						name="prompt"
						component={RichText as ComponentType<Record<string, unknown>>}
						validation={{ required: true }}
						componentProps={{
							inline: true,
							placeholder: "What is this person's name?",
						}}
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
				layout="vertical"
			>
				<Row>
					<ValidatedField
						name="component"
						component={NativeSelect as ComponentType<Record<string, unknown>>}
						validation={{ required: true }}
						componentProps={{
							placeholder: "Select an input control",
							options: componentOptions,
							sortOptionsByLabel: !isNewVariable,
							onChange: handleChangeComponent,
						}}
					/>
					{isNewVariable && variableType && (
						<Tip>
							<p>
								The selected input control will cause this variable to be defined as type{" "}
								<strong>{String(variableType)}</strong>. Once set, this cannot be changed (although you may change the
								input control within this type).
							</p>
						</Tip>
					)}
					{!isNewVariable && variableType && (
						<Tip type="warning">
							<div>
								<p>
									A pre-existing variable is currently selected. You cannot change a variable type after it has been
									created, so only <strong>{String(variableType)}</strong> compatible input controls can be selected
									above. If you would like to use a different input control type, you will need to create a new
									variable.
								</p>
							</div>
						</Tip>
					)}
				</Row>
				{variableType && metaForType && typeof metaForType.label === "string" && (
					<Row>
						<h4>Preview</h4>
						<InputPreview label={metaForType.label} description={metaForType.description} image={metaForType.image} />
					</Row>
				)}
			</Section>
			{isOrdinalOrCategoricalType(variableType) && (
				<Section
					id={getFieldId("options")}
					title="Categorical/Ordinal options"
					summary={
						<p>
							The input type you selected indicates that this is a categorical or ordinal variable. Next, please create
							a minimum of two possible values for the participant to choose between.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<Options name="options" label="Options" />
					</Row>
				</Section>
			)}
			{isBooleanWithOptions(component) && (
				<Section layout="vertical" id={getFieldId("parameters")} title="BooleanChoice Options">
					<Row>
						<BooleanChoice form={form} />
					</Row>
				</Section>
			)}
			{isVariableTypeWithParameters(variableType) && (
				<Section layout="vertical" title="Input Options" id={getFieldId("parameters")}>
					<Row>
						<Parameters type={String(variableType)} component={component ?? ""} name="parameters" form={form} />
					</Row>
				</Section>
			)}
			<ValidationSection
				form={form}
				disabled={!variableType}
				entity={entity ?? ""}
				variableType={typeof variableType === "string" ? variableType : undefined}
				existingVariables={omit(existingVariables, variable)}
			/>
		</>
	);
};

export default PromptFields;
