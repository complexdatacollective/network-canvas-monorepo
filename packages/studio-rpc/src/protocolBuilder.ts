// The protocol-builder host contract, re-exported so Studio's own contract can
// carry it. `@codaco/protocol-builder` owns it; nothing here adds, removes, or
// reshapes a procedure — a Studio-side edit to this surface would put the
// package and its hosts on different contracts.
export {
  contract as protocolBuilderContract,
  type ProtocolBuilderClient,
  type ProtocolBuilderContract,
} from '@codaco/protocol-builder/contract';

export type {
  Presence,
  ProtocolEvent,
  Revision,
} from '@codaco/protocol-builder/contract/schemas';
