// `StudioStreams` is the protocol-builder surface Studio serves at `/ws`: the
// `ProtocolBuilderGroup` `@codaco/protocol-builder-core` owns, re-exported
// under the name Studio's own contract gives it, so consumers import the
// surface once and never move.
//
// Nothing here adds, removes or reshapes a procedure: the core owns the
// contract, and a Studio-side edit would put the package and its hosts on
// different contracts.
export {
  ProtocolBuilderGroup as StudioStreams,
  type ProtocolBuilderClient,
} from '@codaco/protocol-builder-core/contract';

export type {
  Presence,
  ProtocolEvent,
  Revision,
} from '@codaco/protocol-builder-core/contract/schemas';
