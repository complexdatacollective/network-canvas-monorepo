import useValidate from "@app/hooks/useValidate";
import PropTypes from "prop-types";
import React from "react";
import { FieldArray } from "redux-form";

const ValidatedFieldArray = ({ validation, ...rest }) => {
	const validate = useValidate(validation);

	return (
		<FieldArray
			{...rest} // eslint-disable-line react/jsx-props-no-spreading
			validate={validate}
		/>
	);
};

ValidatedFieldArray.propTypes = {
	validation: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

export default ValidatedFieldArray;
