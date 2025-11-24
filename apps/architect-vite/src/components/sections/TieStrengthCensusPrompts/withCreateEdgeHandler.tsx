import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { createEdgeAsync } from "~/ducks/modules/protocol/codebook";

const mapDispatchToProps = {
	createEdge: createEdgeAsync,
};

// TODO: This should be the top level withCreateEdgeHandler enhancer but currently
// contains an edge case for sociogram

const createEdgeHandler = {
	handleCreateEdge:
		({ createEdge }: { createEdge: typeof createEdgeAsync }) =>
		(name: string) => {
			const { type } = createEdge({ name });

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
