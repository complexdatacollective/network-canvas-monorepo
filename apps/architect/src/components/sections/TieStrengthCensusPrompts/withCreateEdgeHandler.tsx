import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';

import { createEdgeAsync } from '~/ducks/modules/protocol/codebook';

const mapDispatchToProps = {
  createEdge: createEdgeAsync,
};

// TODO: This should be the top level withCreateEdgeHandler enhancer but currently
// contains an edge case for sociogram

// The object-shorthand mapDispatchToProps injects `createEdge` already bound
// to dispatch (and connect injects no `dispatch` prop in that form), so the
// handler calls the bound creator directly. `.unwrap()` resolves to the
// thunk's payload — `{ type: <new edge id>, entity }` — whereas awaiting the
// dispatched action would resolve to the fulfilled action, whose `type` is
// the action-type string, not the new edge type's id.
type BoundCreateEdge = (
  configuration: Parameters<typeof createEdgeAsync>[0],
) => ReturnType<ReturnType<typeof createEdgeAsync>>;

const createEdgeHandler = {
  handleCreateEdge:
    ({ createEdge }: { createEdge: BoundCreateEdge }) =>
    async (name: string) => {
      const { type } = await createEdge({ name }).unwrap();

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
const withCreateEdgeHandler = compose(
  connect(null, mapDispatchToProps),
  withHandlers(createEdgeHandler),
);

export default withCreateEdgeHandler;
