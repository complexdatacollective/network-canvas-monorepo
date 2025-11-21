import type { UnknownAction } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import { get, pickBy } from "es-toolkit/compat";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import Validations from "~/components/Validations";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/modules/root";
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

const ValidationSection = ({
	disabled = false,
	form,
	entity,
	variableType = "",
	existingVariables,
}: ValidationSectionProps) => {
	const dispatch = useAppDispatch();

	// Create memoized selector for hasValidation
	const hasValidationSelector = useMemo(() => {
		const formSelector = formValueSelector(form);
		return createSelector(
			[(state: RootState) => formSelector(state, "validation")],
			(validation) => validation && Object.keys(validation).length > 0,
		);
	}, [form]);

	const hasValidation = useSelector(hasValidationSelector);

	const handleToggleValidation = (nextState: boolean) => {
		if (nextState === false) {
			dispatch(change(form, "validation", null) as UnknownAction);
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
			layout="vertical"
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
