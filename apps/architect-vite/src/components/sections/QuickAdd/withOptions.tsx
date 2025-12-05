import { connect } from "react-redux";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";

const mapStateToProps = (state: RootState, { entity, type }: { entity: string; type?: string }) => {
	const variableOptionsForSubject = getVariableOptionsForSubject(state, {
		entity,
		type,
	});

	const textOptionsForSubject = variableOptionsForSubject.filter(({ type: variableType }) => variableType === "text");

	return {
		options: textOptionsForSubject,
	};
};

const withOptions = connect(mapStateToProps, {});

export default withOptions;
