import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import AssignAttributes from "~/components/AssignAttributes";
import { Row, Section } from "~/components/EditorLayout";
import PromptText from "~/components/sections/PromptText";
import Tip from "~/components/Tip";

type PromptFieldsProps = {
	form: string;
	entity?: string;
	type?: string;
};

const PromptFields = ({ form, entity = null, type = null }: PromptFieldsProps) => {
	const dispatch = useDispatch();
	const getFormValue = formValueSelector("editable-list-form");
	const hasAdditionalAttributes = useSelector((state) => getFormValue(state, "additionalAttributes"));

	const handleToggleAdditionalAttributes = (nextState) => {
		if (nextState === false) {
			dispatch(change(form, "additionalAttributes", null));
		}

		return true;
	};

	return (
		<>
			<PromptText />
			<Section
				title="Assign additional Variables"
				toggleable
				startExpanded={!!hasAdditionalAttributes}
				summary={
					<p>
						This feature allows you to assign a variable and associated value to any nodes created on this prompt. You
						could then use this variable in your skip logic or stage filtering rules.
					</p>
				}
				handleToggleChange={handleToggleAdditionalAttributes}
			>
				<Row>
					<Tip>
						<p>
							Select an existing variable, or select &quot;create new variable&quot; from the bottom of the list, and
							then assign a value. You can set different values for this variable for nodes created on different
							prompts.
						</p>
					</Tip>
					<AssignAttributes
						name="additionalAttributes"
						id="additionalAttributes"
						form={form}
						type={type}
						entity={entity}
					/>
				</Row>
			</Section>
		</>
	);
};


export default PromptFields;
