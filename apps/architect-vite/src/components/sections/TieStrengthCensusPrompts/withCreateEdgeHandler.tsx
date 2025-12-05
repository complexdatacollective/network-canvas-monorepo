import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { createEdgeAsync } from "~/ducks/modules/protocol/codebook";
import type { AppDispatch } from "~/ducks/store";

const mapDispatchToProps = {
	createEdge: createEdgeAsync,
};

// TODO: This should be the top level withCreateEdgeHandler enhancer but currently
// contains an edge case for sociogram

const createEdgeHandler = {
	handleCreateEdge:
		({ createEdge, dispatch }: { createEdge: typeof createEdgeAsync; dispatch: AppDispatch }) =>
		async (name: string) => {
			const { type } = await dispatch(createEdge({ name }));

			return type;
		},
};

/**
 * usage:
 * withCreateEdgeHandler(MyComponent)
 *
 * MyComponent = (handleCreateEdge) => (
 *   <div handler={() => handleCreateEdge(name)} />
 * )
 */
const withCreateEdgeHandler = compose(connect(null, mapDispatchToProps), withHandlers(createEdgeHandler));

export default withCreateEdgeHandler;
