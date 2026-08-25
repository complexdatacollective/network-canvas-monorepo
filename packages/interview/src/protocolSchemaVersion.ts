// Protocol schema compatibility for @codaco/interview.
//
// This module must keep exactly one import — the bare specifier below. Hosts
// load it from Node's own ESM loader (Fresco's deployment scripts), where only
// extension-explicit module graphs resolve; `@codaco/protocol-validation` is
// the one dependency chain guaranteed to satisfy that. Adding a relative
// import here would break those scripts.

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

/**
 * The protocol schema version this interview runtime executes.
 *
 * Hosts (Fresco, Interviewer) read this to decide whether a stored protocol
 * needs migrating before it can be handed to the interview: a protocol whose
 * `schemaVersion` differs from this value must be migrated (or rejected)
 * rather than run as-is. Reading it from the embedded interview package —
 * instead of hard-coding a number — means a host's compatibility window moves
 * automatically with the runtime it ships.
 */
export const COMPATIBLE_PROTOCOL_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
