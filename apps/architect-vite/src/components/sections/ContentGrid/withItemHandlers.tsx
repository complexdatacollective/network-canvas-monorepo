import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change, formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

type OwnProps = {
	form: string;
};

const mapStateToProps = (state: RootState, { form }: OwnProps) => {
	const type = formValueSelector(form)(state, "type");

	return {
		type,
	};
};

const mapDispatchToProps = {
	changeForm: change,
};

const itemState = connect(mapStateToProps, mapDispatchToProps);

type HandlerProps = ReturnType<typeof mapStateToProps> & typeof mapDispatchToProps & OwnProps;

const itemHandlers = withHandlers<HandlerProps, Record<string, unknown>>({
	handleChangeType:
		({ changeForm, form }) =>
		() => {
			changeForm(form, "content", null);
		},
});

const withItemHandlers = compose(itemState, itemHandlers);

export default withItemHandlers;
