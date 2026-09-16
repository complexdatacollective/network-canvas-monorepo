// `StudioStreams` is the protocol-builder surface Studio serves at `/ws`.
//
// Today it is the oRPC contract value `@codaco/protocol-builder-core` owns; at
// stage 8 the core replaces that value with its own `ProtocolBuilderRpcs`
// group and this module keeps re-exporting it under the same name, so
// consumers import the surface once and never move.
//
// Nothing here adds, removes or reshapes a procedure: the core owns the
// contract, and a Studio-side edit would put the package and its hosts on
// different contracts. The `@orpc/contract` and `zod` types these exports
// carry resolve through the core's own dependencies, so this package declares
// neither.
export {
  contract as StudioStreams,
  type ProtocolBuilderClient,
  type ProtocolBuilderContract,
} from '@codaco/protocol-builder-core/contract';

export type {
  Presence,
  ProtocolEvent,
  Revision,
} from '@codaco/protocol-builder-core/contract/schemas';
