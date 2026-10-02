import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';

/**
 * One thing a host has to serve: the procedure, and what serving it means.
 */
export type HostResponsibility = Readonly<{
  tag: string;
  responsibility: string;
}>;

/**
 * Every procedure the contract declares, read out of the group itself.
 *
 * The group's `requests` are its procedures, keyed by tag, so the list is what
 * `@codaco/protocol-builder-core/contract` says it is at the moment it is
 * asked, rather than a copy of it: a procedure added to the group appears here
 * with nothing done to this file, and one removed disappears.
 *
 * That is the whole reason it is derived. The list this replaces was written
 * out by hand against a host model that has since been cut, and by the time
 * anybody read it again it named seven procedures that no longer existed and
 * missed every one that had been added. A list of what a host must serve is
 * worth having only while it cannot say something the contract does not.
 */
export function contractProcedureTags(): string[] {
  return [...ProtocolBuilderGroup.requests.keys()];
}

/**
 * What each of those procedures obliges a host to do.
 *
 * The sentences are authored — nothing can derive "refuse a submit whose
 * revision is not the one the editor read" from a schema — but the SET of them
 * is not: `hostResponsibilities()` below is built by asking the contract for
 * its procedures and looking each one up here, and it throws rather than
 * quietly skipping a procedure it has no sentence for. So the failure mode the
 * old hand-written list had — a list that goes on describing a host nobody
 * serves any more — is a thrown error at the first read instead.
 */
const RESPONSIBILITIES: Readonly<Record<string, string>> = {
  AcquireLock:
    'Give one editor the section and refuse the next, answering the loser with the holder’s display name so the editor can say who has it. There is no renewal and no takeover.',
  ReleaseLock:
    'Take the section back when the editor closes, so the next researcher who opens it is not waiting on a tab somebody left open.',
  GetSection:
    'Answer with the section’s document AND the revision it is at, because the revision is what a later submit is checked against.',
  ListSections:
    'Say which sections the protocol has. A component that reads a family of them — every node type — needs their ids before it can observe any of them.',
  WatchProtocol:
    'Stream every section revision, lock change and presence change for the open protocol, in the protocol’s own order, from the cursor the client resumes at.',
  Submit:
    'Accept a section’s new document only from the editor holding its lock and only against the revision that editor read; refuse it otherwise rather than merging.',
  Create:
    'Add a section the protocol does not hold yet — a stage, an entity type — and place it where the editor asked.',
  Delete:
    'Remove a section, and refuse while any section the removal would touch is held elsewhere.',
  RefactorDeleteVariable:
    'Remove a variable from the codebook and every stage that referenced it, as one change, so no stage is left pointing at an attribute the codebook no longer has.',
  RefactorDeleteEntityType:
    'The same for a whole entity type: the type and every reference to it go together or not at all.',
  ResourcesList:
    'Say which files the protocol ships, so a picker can offer them without the editor holding a copy of the manifest.',
  ResourcesStage:
    'Take a file the researcher chose, keep it against the edit, and answer with the id the stage will reference — a file that is not saved with the stage is never added to the protocol.',
  ResourcesDiscard:
    'Drop a staged file the researcher backed out of, so an abandoned import does not become a resource nobody asked for.',
  ResourcesInspect:
    'Answer with what is INSIDE a file — a roster’s columns, a layer’s properties — because the controls that read a file cannot be filled in from the protocol alone.',
  ResourcesPreview:
    'Serve enough of a file to show the researcher what they picked.',
};

/**
 * The minimum a host must serve, as the contract's own procedures.
 *
 * Ordered as the contract declares them, so reading this beside
 * `@codaco/protocol-builder-core/contract` is reading the same list twice.
 */
export function hostResponsibilities(): HostResponsibility[] {
  const declared = contractProcedureTags();
  // The other direction, which the lookup below cannot see: a sentence left
  // behind for a procedure the contract has dropped. That is exactly how the
  // list this replaces went wrong — it kept describing seven procedures that
  // no longer existed — so it is a throw rather than a comment.
  const stale = Object.keys(RESPONSIBILITIES).filter(
    (tag) => !declared.includes(tag),
  );
  if (stale.length > 0) {
    throw new Error(
      `Nothing in the contract answers to: ${stale.join(', ')}. Remove them — a host reading this list would implement procedures nobody serves.`,
    );
  }

  return declared.map((tag) => {
    const responsibility = RESPONSIBILITIES[tag];
    if (responsibility === undefined) {
      throw new Error(
        `The contract declares a "${tag}" procedure that nothing here says a host must do. Add it to \`RESPONSIBILITIES\` — a host reading this list would otherwise implement a contract with a hole in it.`,
      );
    }
    return { tag, responsibility };
  });
}
