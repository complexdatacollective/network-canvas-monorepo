import { get, pickBy } from "es-toolkit/compat";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import Validations from "~/components/Validations";
import { getFieldId } from "../../utils/issues";

type ExistingVariable = {
	name: string;
};

type ValidationSectionProps = {
	disabled?: boolean;
	form: string;
	entity: string;
	variableType?: string;
	existingVariables: Record<string, ExistingVariable>;
};

const ValidationSection = ({ disabled = false, form, entity, variableType = "", existingVariables }: ValidationSectionProps) => {
	const dispatch = useDispatch();
	const getFormValue = formValueSelector(form);
	const hasValidation = useSelector((state) => {
		const validation = getFormValue(state, "validation");
		return validation && Object.keys(validation).length > 0;
	});

	const handleToggleValidation = (nextState) => {
		if (nextState === false) {
			dispatch(change(form, "validation", null));
		}

		return true;
	};

	const existingVariablesForType = pickBy(existingVariables, (variable) => get(variable, "type") === variableType);
	return (
		<Section
			disabled={disabled}
			id={getFieldId("validation")}
			toggleable
			title="Validation"
			summary={<p>Add one or more validation rules to this form field.</p>}
			startExpanded={!!hasValidation}
			handleToggleChange={handleToggleValidation}
		>
			<Row>
				<Validations
					form={form}
					name="validation"
					variableType={variableType}
					entity={entity}
					existingVariables={existingVariablesForType}
				/>
			</Row>
		</Section>
	);
};


export default ValidationSection;
