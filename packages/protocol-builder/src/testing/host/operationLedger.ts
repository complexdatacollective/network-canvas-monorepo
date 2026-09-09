import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import type { ResourceDescriptor, Revision } from '../../contract/schemas.ts';

/** What one write already did, for the retry that asks about it again. */
export type CompletedWrite = Readonly<{
  revision: Revision;
  /** The section a `create` minted, so a retry names the one it made. */
  createdSection?: ProtocolSectionId;
  promoted?: readonly ResourceDescriptor[];
}>;

export type WriteKey = Readonly<{
  sessionId: string;
  operation: 'submit' | 'create';
  requestId: string;
}>;

/**
 * The writes each request id has already made.
 *
 * A `requestId` is stable across an uncertain retry, so a client whose answer
 * was lost asks again with the same one and is told what that attempt wrote.
 * Answering it is the whole of the retry: a create that minted an id again
 * would leave the protocol holding the stage twice and tell the client about
 * only one of them, and a submit written a second time would make a revision
 * nothing changed in — refused outright once the editor had given its lock
 * back, which turns a save that succeeded into one the researcher is told to
 * discard a draft over.
 *
 * The operation is part of the key for the reason the staging key carries the
 * request's kind: an id is promised to be stable across a retry of one intent,
 * not to be unique across the calls an editor makes.
 */
export class OperationLedger {
  readonly #completed = new Map<string, CompletedWrite>();

  completed(key: WriteKey): CompletedWrite | undefined {
    return this.#completed.get(indexOf(key));
  }

  record(key: WriteKey, write: CompletedWrite): void {
    this.#completed.set(indexOf(key), write);
  }
}

function indexOf(key: WriteKey): string {
  return `${key.sessionId} ${key.operation} ${key.requestId}`;
}
