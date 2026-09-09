import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  validateSection,
  validateStageSectionIdentity,
  type SectionIssue,
} from '@codaco/studio-sync/section-validation';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  Presence,
  ProtocolEvent,
  Revision,
} from '../../contract/schemas.ts';
import { EventQueue } from './eventQueue.ts';

export type HostPrincipal = Readonly<{
  sessionId: string;
  userId: string;
  displayName: string;
}>;

export type SectionAtRevision = Readonly<{
  document: SectionDoc;
  revision: Revision;
}>;

export type LoggedEvent = Readonly<{ cursor: string; event: ProtocolEvent }>;

export type SectionHolder = Readonly<{
  sectionId: ProtocolSectionId;
  holder?: Presence;
}>;

export type AcquireOutcome =
  | Readonly<{ lock: 'held' } & SectionAtRevision>
  | Readonly<{ lock: 'readOnly'; holder: Presence } & SectionAtRevision>;

export type SubmitOutcome =
  | Readonly<{ status: 'written'; revision: Revision }>
  | Readonly<{ status: 'notLockHolder'; holder?: Presence }>
  | Readonly<{ status: 'invalidShape'; issues: SectionIssue[] }>;

export type CreateOutcome =
  | Readonly<{
      status: 'created';
      sectionId: ProtocolSectionId;
      revision: Revision;
    }>
  | Readonly<{
      status: 'invalidShape';
      sectionId: ProtocolSectionId;
      issues: SectionIssue[];
    }>;

export type RefactorOutcome =
  | Readonly<{
      status: 'applied';
      revision: Revision;
      changedSections: ProtocolSectionId[];
    }>
  | Readonly<{ status: 'blocked'; blocked: SectionHolder[] }>;

export type CodebookSubject =
  | Readonly<{ entity: 'node'; type: string }>
  | Readonly<{ entity: 'edge'; type: string }>
  | Readonly<{ entity: 'ego' }>;

export type CreatableSectionKind = 'stage' | 'codebookNode' | 'codebookEdge';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class SectionNotFoundError extends Error {
  readonly sectionId: ProtocolSectionId;
  constructor(id: ProtocolSectionId) {
    super(`no such section: ${id}`);
    this.sectionId = id;
  }
}

/**
 * The whole host, in memory: sections at revisions, one lock per section, the
 * presence of everyone in the protocol, and one event log every watcher reads
 * from a cursor.
 */
export class InMemoryProtocolStore {
  readonly #sections = new Map<ProtocolSectionId, SectionAtRevision>();
  readonly #locks = new Map<ProtocolSectionId, HostPrincipal>();
  readonly #presence = new Map<string, Presence>();
  readonly #log: LoggedEvent[] = [];
  readonly #watchers = new Set<EventQueue<LoggedEvent>>();
  readonly #nextId: () => string;
  #sequence = 0n;
  #cursor = 0;

  constructor(
    sections: Readonly<Record<string, SectionDoc>>,
    nextId: () => string,
  ) {
    this.#nextId = nextId;
    for (const [id, document] of Object.entries(sections)) {
      this.#sections.set(sectionId(parseSectionId(id)), {
        document,
        revision: { sequence: 0n, contentHash: contentHash(document) },
      });
    }
  }

  sectionIds(): ProtocolSectionId[] {
    return [...this.#sections.keys()];
  }

  has(id: ProtocolSectionId): boolean {
    return this.#sections.has(id);
  }

  read(id: ProtocolSectionId): SectionAtRevision {
    const state = this.#sections.get(id);
    if (state === undefined) throw new SectionNotFoundError(id);
    return state;
  }

  holderOf(id: ProtocolSectionId): Presence | undefined {
    const owner = this.#locks.get(id);
    return owner === undefined
      ? undefined
      : this.#presence.get(owner.sessionId);
  }

  acquire(id: ProtocolSectionId, principal: HostPrincipal): AcquireOutcome {
    const state = this.read(id);
    const owner = this.#locks.get(id);
    if (owner !== undefined && owner.sessionId !== principal.sessionId) {
      return {
        lock: 'readOnly',
        ...state,
        holder: this.#presenceOf(owner, 'editing', id),
      };
    }
    this.#locks.set(id, principal);
    this.#setPresence(principal, 'editing', id);
    this.#publish({
      type: 'lock',
      sectionId: id,
      holder: this.#presence.get(principal.sessionId),
    });
    this.#publishPresence();
    return { lock: 'held', ...state };
  }

  release(id: ProtocolSectionId, principal: HostPrincipal): void {
    const owner = this.#locks.get(id);
    if (owner === undefined || owner.sessionId !== principal.sessionId) return;
    this.#locks.delete(id);
    this.#setPresence(principal, 'viewing', undefined);
    this.#publish({ type: 'lock', sectionId: id });
    this.#publishPresence();
  }

  submit(
    id: ProtocolSectionId,
    document: SectionDoc,
    principal: HostPrincipal,
  ): SubmitOutcome {
    this.read(id);
    const owner = this.#locks.get(id);
    if (owner === undefined || owner.sessionId !== principal.sessionId) {
      return { status: 'notLockHolder', holder: this.holderOf(id) };
    }
    const issues = shapeIssues(id, document);
    if (issues.length > 0) return { status: 'invalidShape', issues };
    const sequence = this.#advance();
    return { status: 'written', revision: this.#write(id, document, sequence) };
  }

  create(
    kind: CreatableSectionKind,
    document: SectionDoc,
    position: number | undefined,
  ): CreateOutcome {
    const id = this.#nextId();
    const target =
      kind === 'stage'
        ? sectionId({ kind: 'stage', stageId: id })
        : sectionId({ kind, typeId: id });
    const created: SectionDoc =
      kind === 'stage' ? { ...document, id } : document;
    const issues = shapeIssues(target, created);
    if (issues.length > 0) {
      return { status: 'invalidShape', sectionId: target, issues };
    }
    const sequence = this.#advance();
    const revision = this.#write(target, created, sequence);
    if (kind === 'stage') this.#registerStagePointer(id, position, sequence);
    return { status: 'created', sectionId: target, revision };
  }

  /**
   * Removes a codebook variable and every prompt that names it.
   *
   * "Every prompt" is the whole of what a reference is here: the editors reach
   * variables from prompts, and a host that also rewrote sort orders or filter
   * rules would be guessing at semantics `@codaco/protocol-validation` owns.
   */
  deleteVariable(
    subject: CodebookSubject,
    variableId: string,
    principal: HostPrincipal,
  ): RefactorOutcome {
    const owner = codebookSectionId(subject);
    const state = this.read(owner);
    const variables = isRecord(state.document.variables)
      ? state.document.variables
      : {};
    const nextVariables = { ...variables };
    delete nextVariables[variableId];
    const stages = this.#stagesReferencing(variableId);
    return this.#applyRefactor(
      [[owner, { ...state.document, variables: nextVariables }], ...stages],
      principal,
    );
  }

  deleteEntityType(
    entity: 'node' | 'edge',
    typeId: string,
    principal: HostPrincipal,
  ): RefactorOutcome {
    const owner = codebookSectionId(
      entity === 'node'
        ? { entity: 'node', type: typeId }
        : { entity: 'edge', type: typeId },
    );
    const state = this.read(owner);
    const variables = isRecord(state.document.variables)
      ? Object.keys(state.document.variables)
      : [];
    const stages = new Map<ProtocolSectionId, SectionDoc>();
    for (const variableId of variables) {
      for (const [id, document] of this.#stagesReferencing(variableId)) {
        stages.set(id, stripPrompts(stages.get(id) ?? document, variableId));
      }
    }
    return this.#applyRefactor(
      [[owner, undefined], ...stages.entries()],
      principal,
    );
  }

  /**
   * Writes a section as another editor's revision, without going through a
   * lock.
   *
   * The collaborator-edit seam a test needs and the contract deliberately does
   * not offer: `submit` requires the lock, and a test setting up "somebody else
   * has already changed the codebook" is describing a write that happened
   * before this editor opened rather than one it is racing. A section the
   * protocol does not hold yet is added; `undefined` removes one.
   */
  applyAsCollaborator(
    id: ProtocolSectionId,
    document: SectionDoc | undefined,
  ): Revision {
    const sequence = this.#advance();
    if (document === undefined) return this.#remove(id, sequence);
    return this.#write(id, document, sequence);
  }

  /**
   * Ends every open `watchProtocol` stream, as a dropped connection does.
   *
   * Events published after this reach nobody, so a test can write a revision
   * into the gap and see whether resuming from a cursor delivers it.
   */
  disconnectWatchers(): void {
    for (const watcher of this.#watchers) watcher.close();
  }

  /**
   * Merges manifest entries into the `assets` section as one revision.
   *
   * Host-serialised like `create`, and for the same reason: promoted bytes and
   * the manifest entries naming them have to land together, and no client can
   * hold a lock spanning both.
   */
  mergeAssets(entries: Readonly<Record<string, unknown>>): Revision {
    const id = sectionId({ kind: 'assets' });
    const assets = this.read(id).document;
    return this.#write(id, { ...assets, ...entries }, this.#advance());
  }

  async *watch(
    principal: HostPrincipal,
    since: string | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<LoggedEvent> {
    const queue = new EventQueue<LoggedEvent>();
    const stop = () => queue.close();
    signal?.addEventListener('abort', stop, { once: true });
    // Subscribed before the backlog is taken, so an event published between
    // the two is queued rather than lost; the cursor check below drops the
    // overlap.
    this.#watchers.add(queue);
    const backlog = this.#eventsAfter(since);
    let last = backlog.at(-1)?.cursor ?? since;
    this.#setPresence(principal, 'viewing', undefined);
    this.#publishPresence();
    try {
      for (const entry of backlog) yield entry;
      for await (const entry of queue) {
        if (last !== undefined && Number(entry.cursor) <= Number(last))
          continue;
        last = entry.cursor;
        yield entry;
      }
    } finally {
      signal?.removeEventListener('abort', stop);
      this.#watchers.delete(queue);
      queue.close();
      this.#leave(principal);
    }
  }

  #applyRefactor(
    writes: readonly (readonly [ProtocolSectionId, SectionDoc | undefined])[],
    principal: HostPrincipal,
  ): RefactorOutcome {
    const blocked: SectionHolder[] = [];
    for (const [id] of writes) {
      const owner = this.#locks.get(id);
      if (owner !== undefined && owner.sessionId !== principal.sessionId) {
        blocked.push({ sectionId: id, holder: this.holderOf(id) });
      }
    }
    if (blocked.length > 0) return { status: 'blocked', blocked };
    const sequence = this.#advance();
    let revision: Revision | undefined;
    const changedSections: ProtocolSectionId[] = [];
    for (const [id, document] of writes) {
      revision =
        document === undefined
          ? this.#remove(id, sequence)
          : this.#write(id, document, sequence);
      changedSections.push(id);
    }
    if (revision === undefined) {
      throw new Error('a refactor must write at least one section');
    }
    return { status: 'applied', revision, changedSections };
  }

  #stagesReferencing(variableId: string): [ProtocolSectionId, SectionDoc][] {
    const changed: [ProtocolSectionId, SectionDoc][] = [];
    for (const [id, state] of this.#sections) {
      if (parseSectionId(id).kind !== 'stage') continue;
      const stripped = stripPrompts(state.document, variableId);
      if (stripped !== state.document) changed.push([id, stripped]);
    }
    return changed;
  }

  #registerStagePointer(
    stageId: string,
    position: number | undefined,
    sequence: bigint,
  ): void {
    const orderId = sectionId({ kind: 'stageOrder' });
    const order = this.read(orderId).document;
    const stages = Array.isArray(order.stages)
      ? order.stages.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [];
    const at = position === undefined ? stages.length : position;
    stages.splice(at, 0, stageId);
    this.#write(orderId, { ...order, stages }, sequence);
  }

  #write(
    id: ProtocolSectionId,
    document: SectionDoc,
    sequence: bigint,
  ): Revision {
    const revision: Revision = {
      sequence,
      contentHash: contentHash(document),
    };
    this.#sections.set(id, { document, revision });
    this.#publish({ type: 'revision', sectionId: id, revision, document });
    return revision;
  }

  #remove(id: ProtocolSectionId, sequence: bigint): Revision {
    const previous = this.read(id);
    const revision: Revision = {
      sequence,
      contentHash: previous.revision.contentHash,
    };
    this.#sections.delete(id);
    this.#locks.delete(id);
    this.#publish({ type: 'revision', sectionId: id, revision });
    return revision;
  }

  #advance(): bigint {
    this.#sequence += 1n;
    return this.#sequence;
  }

  #publish(event: ProtocolEvent): void {
    this.#cursor += 1;
    const entry: LoggedEvent = { cursor: String(this.#cursor), event };
    this.#log.push(entry);
    for (const watcher of this.#watchers) watcher.push(entry);
  }

  #publishPresence(): void {
    this.#publish({ type: 'presence', present: [...this.#presence.values()] });
  }

  #eventsAfter(since: string | undefined): LoggedEvent[] {
    if (since === undefined) return [...this.#log];
    const after = Number(since);
    return this.#log.filter((entry) => Number(entry.cursor) > after);
  }

  #presenceOf(
    principal: HostPrincipal,
    mode: Presence['mode'],
    id: ProtocolSectionId | undefined,
  ): Presence {
    return {
      sessionId: principal.sessionId,
      userId: principal.userId,
      displayName: principal.displayName,
      mode,
      ...(id === undefined ? {} : { sectionId: id }),
    };
  }

  #setPresence(
    principal: HostPrincipal,
    mode: Presence['mode'],
    id: ProtocolSectionId | undefined,
  ): void {
    this.#presence.set(
      principal.sessionId,
      this.#presenceOf(principal, mode, id),
    );
  }

  #leave(principal: HostPrincipal): void {
    for (const [id, owner] of this.#locks) {
      if (owner.sessionId === principal.sessionId) {
        this.#locks.delete(id);
        this.#publish({ type: 'lock', sectionId: id });
      }
    }
    this.#presence.delete(principal.sessionId);
    this.#publishPresence();
  }
}

function codebookSectionId(subject: CodebookSubject): ProtocolSectionId {
  if (subject.entity === 'ego') return sectionId({ kind: 'codebookEgo' });
  if (subject.entity === 'node') {
    return sectionId({ kind: 'codebookNode', typeId: subject.type });
  }
  return sectionId({ kind: 'codebookEdge', typeId: subject.type });
}

function stripPrompts(document: SectionDoc, variableId: string): SectionDoc {
  const prompts = document.prompts;
  if (!Array.isArray(prompts)) return document;
  const kept = prompts.filter(
    (prompt) => !(isRecord(prompt) && prompt.variable === variableId),
  );
  if (kept.length === prompts.length) return document;
  return { ...document, prompts: kept };
}

function shapeIssues(
  id: ProtocolSectionId,
  document: SectionDoc,
): SectionIssue[] {
  const result = validateSection(id, document);
  const issues = result.success ? [] : [...result.issues];
  const ref = parseSectionId(id);
  if (ref.kind === 'stage') {
    const identity = validateStageSectionIdentity(ref.stageId, document);
    if (!identity.success) issues.push(...identity.issues);
  }
  return issues;
}
