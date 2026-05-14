import { connect } from "react-redux";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

const mapStateToProps = (state: RootState, { form, fields }: { form: string; fields: { name?: string } }) => {
	const items = formValueSelector(form)(state, fields.name || "items") || [];
	const itemCount = items ? items.length : 0;

	return {
		itemCount,
		items,
	};
};

const withItems = connect(mapStateToProps);

export default withItems;
