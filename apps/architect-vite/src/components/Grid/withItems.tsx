import { connect } from "react-redux";
import { formValueSelector } from "redux-form";

const mapStateToProps = (state, { form, fields, fieldName }) => {
	const actualFieldName = fieldName || fields?.name || "items";
	const items = formValueSelector(form)(state, actualFieldName) || [];
	const itemCount = items ? items.length : 0;

	return {
		itemCount,
		items,
	};
};

const withItems = connect(mapStateToProps);

export default withItems;
