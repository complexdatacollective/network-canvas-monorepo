import { first, isArray } from "lodash";
import { connect } from "react-redux";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

const getAsArray = (fieldOrFields: string | string[] = []) =>
	isArray(fieldOrFields) ? fieldOrFields : [fieldOrFields];

const makeMapStateToProps =
	(fieldOrFields: string | string[] = []) =>
	(state: RootState, { form }: { form: string }) => {
		const fields = getAsArray(fieldOrFields);
		const valueOrValues = formValueSelector(form)(state, ...fields);

		// When formValueSelector receives a single field it returns a scalar.
		if (fields.length === 1) {
			return { [first(fields) as string]: valueOrValues };
		}

		return valueOrValues;
	};

const withMapFormToProps = (fields: string | string[] = []) => connect(makeMapStateToProps(fields));

export default withMapFormToProps;
