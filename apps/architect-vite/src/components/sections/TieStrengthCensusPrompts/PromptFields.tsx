import RichText from "@codaco/legacy-ui/components/Fields/RichText/Field";
import { compose } from "redux";
import { Row, Section } from "~/components/EditorLayout";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
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
	value: string | any[] | boolean;
};

type PromptFieldsProps = {
	form: string;
	changeForm: (form: string, field: string, value: any) => void;
	edgesForSubject?: string[];
	handleCreateEdge: (option: string) => any;
	handleChangeCreateEdge: (value: any) => void;
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

	const handleCreatedNewVariable = (id: string, { field }: { field: string }) => changeForm(form, field, id);

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
			<Section title="Tie-Strength Census Prompt" id={getFieldId("text")}>
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
						component={RichText}
						inline
						className="stage-editor-section-prompt__textarea"
						label="Prompt Text"
						placeholder="Enter text for the prompt here..."
						validation={{ required: true, maxLength: 220 }}
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
				>
					<Row>
						<ValidatedField
							name="createEdge"
							component={NativeSelect}
							options={edgesForSubject}
							onCreateOption={(option) => {
								handleChangeCreateEdge(handleCreateEdge(option));
							}}
							onChange={handleChangeCreateEdge}
							placeholder="Select or create an edge type"
							createLabelText="✨ Create new edge type ✨"
							createInputLabel="New edge type name"
							createInputPlaceholder="Enter an edge type..."
							label="Select an edge type"
							validation={{ required: true, allowedNMToken: "edge type name" }}
						/>
					</Row>
				</Section>
				{createEdge && (
					<Section title="Ordinal Variable">
						<Row>
							<ValidatedField
								name="edgeVariable"
								component={VariablePicker}
								entity="edge"
								type={createEdge}
								label="Select an ordinal variable for this edge type"
								options={variableOptions}
								onCreateOption={handleNewVariable}
								validation={{ required: true }}
								variable={edgeVariable}
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
				>
					<ValidatedField
						name="negativeLabel"
						component={RichText}
						inline
						className="stage-editor-section-prompt__textarea"
						label="Label for the decline option"
						placeholder="Enter text for the negative label here..."
						validation={{ required: true, maxLength: 220 }}
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
