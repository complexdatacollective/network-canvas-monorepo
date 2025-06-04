import { Component } from "react";
import { connect } from "react-redux";
import { compose, withState } from "recompose";
import { bindActionCreators } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";
import { actionCreators as stackActions } from "../ducks/modules/stacks";

type StackableProps = {
	group?: string | null;
	stackKey?: string | boolean | number | null;
	stackIndex: number;
	children: (props: { stackIndex: number }) => React.ReactNode;
	stackableId?: string | null;
	setStackableId: (id: string) => void;
	registerStackable: (id: string, group: string | null) => void;
	unregisterStackable: (id: string) => void;
	moveToTop: () => void;
};

const withStackableId = withState("stackableId", "setStackableId", null);

// TODO: Make functional component or potentially could be handled
// by screens module
class Stackable extends Component<StackableProps> {
	constructor(props) {
		super(props);
		const { group, registerStackable, setStackableId } = this.props;
		const id = uuid();
		registerStackable(id, group);
		setStackableId(id);
	}

	// eslint-disable-next-line camelcase
	UNSAFE_componentWillReceiveProps(newProps) {
		const { stackKey, moveToTop } = this.props;

		if (newProps.stackKey !== stackKey) {
			moveToTop();
		}
	}

	componentWillUnmount() {
		const { stackableId, unregisterStackable } = this.props;

		const id = stackableId;
		unregisterStackable(id);
	}

	render() {
		const { stackIndex, children } = this.props;

		return <>{children({ stackIndex })}</>;
	}
}

Stackable.defaultProps = {
	group: null,
	stackKey: null,
	stackableId: null,
};

const mapStateToProps = (state, { stackableId }) => {
	const stackIndex = state.stacks[stackableId] ? state.stacks[stackableId].index : 0;

	return {
		stackIndex,
	};
};

const mapDispatchToProps = (dispatch) => ({
	moveToTop: bindActionCreators(stackActions.moveToTop, dispatch),
	registerStackable: bindActionCreators(stackActions.registerStackable, dispatch),
	unregisterStackable: bindActionCreators(stackActions.unregisterStackable, dispatch),
});

export default compose(withStackableId, connect(mapStateToProps, mapDispatchToProps))(Stackable);
