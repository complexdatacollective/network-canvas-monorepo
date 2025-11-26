import { compose } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { Row, Section } from "~/components/EditorLayout";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import RichText from "~/components/Form/Fields/RichText/Field";
import ValidatedField from "~/components/Form/ValidatedField";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import Options from "~/components/Options";
import Tip from "~/components/Tip";
import { getFieldId } from "~/utils/issues";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import withCreateEdgeHandlers from "./withCreateEdgeHandler";
import withEdgesOptions from "./withEdgesOptions";
import withVariableOptions from "./withVariableOptions";

type SelectOption = {
	label: string;
	value: string;
	type?: string;
	[key: string]: unknown;
};

type PromptFieldsProps = {
	form: string;
	changeForm: (form: string, field: string, value: unknown) => void;
	edgesForSubject?: string[];
	handleCreateEdge: (option: string) => string;
	handleChangeCreateEdge: (value: string) => void;
	createEdge?: string | null;
	edgeVariable?: string | null;
	variableOptions?: SelectOption[];
	optionsForVariableDraft?: SelectOption[];
};

const PromptFields = ({
	form,
	changeForm,
	edgesForSubject = [],
	handleCreateEdge,
	handleChangeCreateEdge,
	createEdge = null,
	edgeVariable = null,
	variableOptions = [],
	optionsForVariableDraft = [],
}: PromptFieldsProps) => {
	const newVariableWindowInitialProps = {
		entity: "edge",
		type: createEdge,
		initialValues: { name: null, type: null },
	};

	const handleCreatedNewVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		changeForm(form, params.field, id);
	};

	const [newVariableWindowProps, openNewVariableWindow] = useNewVariableWindowState(
		newVariableWindowInitialProps,
		handleCreatedNewVariable,
	);

	const handleNewVariable = (name: string) =>
		openNewVariableWindow({ initialValues: { name, type: "ordinal" } }, { field: "edgeVariable" });

	const totalOptionsLength = optionsForVariableDraft?.length;
	const showVariableOptionsTip = totalOptionsLength > 5;

	return (
		<>
			<Section title="Tie-Strength Census Prompt" id={getFieldId("text")} layout="vertical">
				<Row>
					<p>
						Tie-Strength Census prompts explain to your participant which relationship they should evaluate (for
						example, &apos;friendship&apos;, &apos;material support&apos; or &apos;conflict&apos;). Enter prompt text
						below, and select an edge type that will be created when the participant answers &apos;yes&apos;.
					</p>
					<p>
						Remember to write your prompt text to take into account that the participant will be looking at pairs of
						prompts in sequence. Use phrases such as &apos;
						<strong>these people</strong>
						&apos;, or &apos;
						<strong>the two people shown</strong>
						&apos; to indicate that the participant should focus on the visible pair.
					</p>
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
			</Section>
			<Section
				title="Tie-Strength Configuration"
				id={getFieldId("set-ordinal-value")}
				summary={
					<>
						<p>This interface works by presenting the user with a choice to either:</p>
						<ul>
							<li>Create an edge between two alters, and simultaneously assign a value to an ordinal variable.</li>
							<li>Decline to create an edge</li>
						</ul>
					</>
				}
				layout="vertical"
			>
				<Section
					title="Create an Edge"
					summary={
						<p>
							Begin by selecting or creating an edge type. You will then be able to select or create an ordinal variable
							on this edge type. The options of this ordinal variable will represent the choices provided to the user
							when creating an edge.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<ValidatedField
							name="createEdge"
							component={NativeSelect as ComponentType<Record<string, unknown>>}
							validation={{ required: true, allowedNMToken: "edge type name" }}
							componentProps={{
								label: "Select an edge type",
								options: edgesForSubject,
								onCreateOption: (option: string) => {
									handleChangeCreateEdge(handleCreateEdge(option));
								},
								onChange: (_e: unknown, value: string) => handleChangeCreateEdge(value),
								placeholder: "Select or create an edge type",
								createLabelText: "✨ Create new edge type ✨",
								createInputLabel: "New edge type name",
								createInputPlaceholder: "Enter an edge type...",
							}}
						/>
					</Row>
				</Section>
				{createEdge && (
					<Section title="Ordinal Variable" layout="vertical">
						<Row>
							<ValidatedField
								name="edgeVariable"
								component={VariablePicker}
								validation={{ required: true }}
								componentProps={{
									entity: "edge",
									type: createEdge ?? undefined,
									label: "Select an ordinal variable for this edge type",
									options: variableOptions,
									onCreateOption: handleNewVariable,
								}}
							/>
						</Row>
						{edgeVariable && (
							<Row>
								<h3 id={getFieldId("variableOptions")}>Variable Options</h3>
								<p>
									The following choices or &apos;options&apos; are configured for this variable. We suggest no more than
									four options should be used on this interface.
								</p>
								{showVariableOptionsTip && (
									<Tip type="error">
										<p>
											The ordinal bin interface is designed to use <strong>up to 5 option values</strong>
											including the negative label. Using more will create a sub-optimal experience for participants,
											and might reduce data quality.
										</p>
									</Tip>
								)}
								<Options name="variableOptions" label="Options" />
							</Row>
						)}
					</Section>
				)}
				<Section
					title="Decline Option"
					summary={
						<p>
							Enter text to display for the option that will <strong>cancel edge creation</strong>. This option will be
							shown on the far right of the screen.
						</p>
					}
					id={getFieldId("negativeLabel")}
					layout="vertical"
				>
					<ValidatedField
						name="negativeLabel"
						component={RichText as ComponentType<Record<string, unknown>>}
						validation={{ required: true, maxLength: 220 }}
						componentProps={{
							inline: true,
							className: "stage-editor-section-prompt__textarea",
							label: "Label for the decline option",
							placeholder: "Enter text for the negative label here...",
						}}
					/>
				</Section>
			</Section>
			<NewVariableWindow
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...newVariableWindowProps}
			/>
		</>
	);
};

export default compose(withCreateEdgeHandlers, withEdgesOptions, withVariableOptions)(PromptFields);
