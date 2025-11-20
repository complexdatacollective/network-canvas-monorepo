import { connect } from "react-redux";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

const defaultSubject = { entity: "ego", type: null };

const mapStateToProps = (state: RootState, { form }: { form: string }) => {
	const subject = formValueSelector(form)(state, "subject") || defaultSubject;

	return {
		...subject,
	};
};

export default connect(mapStateToProps);
