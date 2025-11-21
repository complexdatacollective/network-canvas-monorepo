import { connect } from "react-redux";
import { compose, withState } from "recompose";
import { formValueSelector } from "redux-form";

type EdgeStateProps = {
	form: string;
};

const edgesState = connect((state: unknown, props: EdgeStateProps) => {
	const getFormValues = formValueSelector(props.form);
	const createEdge = getFormValues(state as Record<string, unknown>, "edges.create");

	return {
		createEdge,
	};
});

const edgesToggleState = withState(
	"canCreateEdge",
	"setCanCreateEdge",
	({ createEdge }: { createEdge: unknown }) => !!createEdge,
);

const withCreateEdgesState = compose(edgesState, edgesToggleState);

export default withCreateEdgesState;
