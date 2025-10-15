import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { createSelector } from "@reduxjs/toolkit";
import { Row, Section } from "~/components/EditorLayout";
import Validations from "~/components/Validations";

interface AnonymisationValidationProps {
	form: string;
}

const AnonymisationValidation = ({ form }: AnonymisationValidationProps) => {
	const dispatch = useDispatch();

	// Create memoized selector for hasValidation
	const hasValidationSelector = useMemo(() => {
		const formSelector = formValueSelector(form);
		return createSelector(
			[(state) => formSelector(state, "validation")],
			(validation) => validation && Object.keys(validation).length > 0,
		);
	}, [form]);

	const hasValidation = useSelector(hasValidationSelector);

	const handleToggleValidation = (nextState) => {
		if (nextState === false) {
			dispatch(change(form, "validation", null));
		}

		return true;
	};

	return (
		<Section
			toggleable
			title="Passphrase Validation"
			summary={<p>Add one or more validation rules for the passphrase.</p>}
			startExpanded={!!hasValidation}
			handleToggleChange={handleToggleValidation}
		>
			<Row>
				<Validations form={form} name="validation" variableType="passphrase" />
			</Row>
		</Section>
	);
};

export default AnonymisationValidation;
