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
  CodebookSubject,
  Presence,
  ProtocolEvent,
  Revision,
  SectionReference,
} from '../../contract/schemas.ts';
import { EventQueue } from './eventQueue.ts';
import {
  entityTypeReferences,
  inRemovalOrder,
  variableReferences,
  withoutReference,
} from './references.ts';

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
  | Readonly<{ status: 'exists'; sectionId: ProtocolSectionId }>
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
  | Readonly<{ status: 'blocked'; blocked: SectionHolder[] }>
  | Readonly<{ status: 'referenced'; remaining: SectionReference[] }>;

type SectionWrite = readonly [ProtocolSectionId, SectionDoc | undefined];

export type CreatableSectionKind =
  | 'stage'
  | 'codebookNode'
  | 'codebookEdge'
  | 'codebookEgo';

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

  /**
   * A section, at the revision it currently holds.
   *
   * The document is a copy: an in-process client shares this process's memory
   * with the store, and a caller that kept a document and changed it would
   * otherwise change the protocol itself — with no lock check, no revision,
   * no event and a content hash that no longer describes it. A host over a
   * wire gets that isolation from serialising; this one has to make it.
   */
  read(id: ProtocolSectionId): SectionAtRevision {
    const state = this.#sections.get(id);
    if (state === undefined) throw new SectionNotFoundError(id);
    return {
      document: structuredClone(state.document),
      revision: state.revision,
    };
  }

  /**
   * Who holds this section, whether or not they are watching the protocol.
   *
   * A lock outlives the stream that reported it, so the presence map can have
   * nothing for its owner; the lock itself still names the session that took
   * it, and a read-only editor has to be told who has it either way.
   */
  holderOf(id: ProtocolSectionId): Presence | undefined {
    const owner = this.#locks.get(id);
    if (owner === undefined) return undefined;
    return (
      this.#presence.get(owner.sessionId) ??
      this.#presenceOf(owner, 'editing', id)
    );
  }

  acquire(id: ProtocolSectionId, principal: HostPrincipal): AcquireOutcome {
    const state = this.read(id);
    const owner = this.#locks.get(id);
    if (owner !== undefined && owner.sessionId !== principal.sessionId) {
      const holder = this.holderOf(id);
      if (holder === undefined) throw new Error(`no holder for locked ${id}`);
      return { lock: 'readOnly', ...state, holder };
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

  /**
   * Writes the section, and the asset manifest entries handed with it, as one
   * revision.
   *
   * The entries are the submit's promotion: the bytes behind them are already
   * with the host, and this is where they and the section naming them become
   * a single revision. A refusal writes neither.
   */
  submit(
    id: ProtocolSectionId,
    document: SectionDoc,
    principal: HostPrincipal,
    assetEntries?: Readonly<Record<string, unknown>>,
  ): SubmitOutcome {
    this.read(id);
    const owner = this.#locks.get(id);
    if (owner === undefined || owner.sessionId !== principal.sessionId) {
      return { status: 'notLockHolder', holder: this.holderOf(id) };
    }
    const issues = shapeIssues(id, document);
    if (issues.length > 0) return { status: 'invalidShape', issues };
    const sequence = this.#advance();
    const revision = this.#write(id, document, sequence);
    if (assetEntries !== undefined) this.#mergeAssets(assetEntries, sequence);
    return { status: 'written', revision };
  }

  create(
    kind: CreatableSectionKind,
    document: SectionDoc,
    position: number | undefined,
  ): CreateOutcome {
    // The ego codebook is the one creatable singleton: a protocol whose
    // researcher has not given the participant any attributes yet has no such
    // section, and adding the first one is what creates it.
    const id = kind === 'codebookEgo' ? undefined : this.#nextId();
    const target = createdSectionId(kind, id);
    if (this.#sections.has(target)) {
      return { status: 'exists', sectionId: target };
    }
    const created: SectionDoc =
      kind === 'stage' && id !== undefined ? { ...document, id } : document;
    const issues = shapeIssues(target, created);
    if (issues.length > 0) {
      return { status: 'invalidShape', sectionId: target, issues };
    }
    const sequence = this.#advance();
    const revision = this.#write(target, created, sequence);
    if (kind === 'stage' && id !== undefined) {
      this.#registerStagePointer(id, position, sequence);
    }
    return { status: 'created', sectionId: target, revision };
  }

  /**
   * Removes a stage and its place in the stage order in one revision.
   *
   * Both writes or neither: a stage section the order does not name, or an
   * order naming a section that is gone, is a protocol `assembleProtocolSections`
   * refuses. Held sections block it on the terms every cross-section change
   * uses, since the deleting caller holds neither.
   */
  deleteStage(stageId: string, principal: HostPrincipal): RefactorOutcome {
    const target = sectionId({ kind: 'stage', stageId });
    this.read(target);
    const orderId = sectionId({ kind: 'stageOrder' });
    const order = this.read(orderId).document;
    const stages = stageList(order).filter((entry) => entry !== stageId);
    return this.#applyRefactor(
      [
        [target, undefined],
        [orderId, { ...order, stages }],
      ],
      principal,
      new Set(),
    );
  }

  /**
   * Removes a codebook variable, and the references to it that can go with the
   * list entry holding them.
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
    return this.#refactor(
      [[owner, { ...state.document, variables: nextVariables }]],
      (documents) => variableReferences(documents, subject, variableId),
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
    this.read(owner);
    return this.#refactor(
      [[owner, undefined]],
      (documents) => entityTypeReferences(documents, entity, typeId),
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
      // Every reader gets its own copy of an event, for the reason `read`
      // gives: in process, the document on it is the store's own.
      for (const entry of backlog) yield copyOf(entry);
      for await (const entry of queue) {
        if (last !== undefined && Number(entry.cursor) <= Number(last))
          continue;
        last = entry.cursor;
        yield copyOf(entry);
      }
    } finally {
      signal?.removeEventListener('abort', stop);
      this.#watchers.delete(queue);
      queue.close();
      this.#departed(principal);
    }
  }

  /**
   * What a refactor writes: the codebook change it was asked for, and every
   * section that stops naming what the change removed.
   *
   * The references come from the protocol schema rather than from the two or
   * three paths a host happens to know, so a stage naming a variable from a
   * form field or a filter rule is rewritten like one naming it from a prompt.
   * One reference is removed at a time and the protocol is asked again, since
   * removing a list entry moves every path after it. What the sweep cannot
   * remove — a stage's own subject, a quick-add attribute — is left standing
   * and refuses the whole change: reporting success there would leave the
   * protocol naming something that no longer exists.
   */
  #refactor(
    seed: readonly SectionWrite[],
    referencesTo: (
      documents: Readonly<Record<string, SectionDoc>>,
    ) => SectionReference[],
    principal: HostPrincipal,
  ): RefactorOutcome {
    const documents = this.#documentsWith(seed);
    const rewritten = new Map<ProtocolSectionId, SectionDoc>();
    let remaining = referencesTo(documents);
    while (remaining.length > 0) {
      if (!removeOneReference(documents, rewritten, remaining)) break;
      remaining = referencesTo(documents);
    }
    if (remaining.length > 0) return { status: 'referenced', remaining };
    return this.#applyRefactor(
      [...seed, ...rewritten],
      principal,
      new Set(seed.map(([id]) => id)),
    );
  }

  /** Every section document, with a refactor's own writes folded in. */
  #documentsWith(writes: readonly SectionWrite[]): Record<string, SectionDoc> {
    const documents: Record<string, SectionDoc> = {};
    for (const [id, state] of this.#sections) documents[id] = state.document;
    for (const [id, document] of writes) {
      if (document === undefined) delete documents[id];
      else documents[id] = document;
    }
    return documents;
  }

  /**
   * `owned` names the sections the caller is changing under its own lock — the
   * codebook section a dialog has open and is deleting from. Every other
   * section this change writes has to be free, this session's own included: a
   * stage editor and a codebook dialog in one tab are one session, and the
   * stage's draft lives in its form, so a sweep that rewrote the stage under it
   * would be undone by that editor's next whole-section submit.
   */
  #applyRefactor(
    writes: readonly SectionWrite[],
    principal: HostPrincipal,
    owned: ReadonlySet<ProtocolSectionId>,
  ): RefactorOutcome {
    const blocked: SectionHolder[] = [];
    for (const [id] of writes) {
      const owner = this.#locks.get(id);
      if (owner === undefined) continue;
      if (owner.sessionId === principal.sessionId && owned.has(id)) continue;
      blocked.push({ sectionId: id, holder: this.holderOf(id) });
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

  #registerStagePointer(
    stageId: string,
    position: number | undefined,
    sequence: bigint,
  ): void {
    const orderId = sectionId({ kind: 'stageOrder' });
    const order = this.read(orderId).document;
    const stages = stageList(order);
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
    // The submitter's document and this store's copy are two objects, and
    // `watch` hands every reader a third: see `read`.
    const stored = structuredClone(document);
    this.#sections.set(id, { document: stored, revision });
    this.#publish({
      type: 'revision',
      sectionId: id,
      revision,
      document: stored,
    });
    return revision;
  }

  #mergeAssets(
    entries: Readonly<Record<string, unknown>>,
    sequence: bigint,
  ): void {
    const id = sectionId({ kind: 'assets' });
    this.#write(id, { ...this.read(id).document, ...entries }, sequence);
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

  /**
   * The principal's stream ended, so they are no longer present.
   *
   * Their locks are not touched. A dropped socket ends the stream and the
   * channel resumes on a new one, while the editor behind it never stopped
   * holding its draft: releasing here would refuse that editor's next save
   * for a reconnect it never saw. A lock ends with `releaseLock` or with the
   * session, which a host that has sessions ends itself.
   */
  #departed(principal: HostPrincipal): void {
    this.#presence.delete(principal.sessionId);
    this.#publishPresence();
  }
}

/**
 * Removes the first reference the sweep can take, reporting whether it took
 * one. One at a time, because removing a list entry moves every path after it.
 */
function removeOneReference(
  documents: Record<string, SectionDoc>,
  rewritten: Map<ProtocolSectionId, SectionDoc>,
  remaining: readonly SectionReference[],
): boolean {
  for (const reference of inRemovalOrder(remaining)) {
    const current = documents[reference.sectionId];
    if (current === undefined) continue;
    const next = withoutReference(current, reference.path);
    if (next === undefined) continue;
    if (shapeIssues(reference.sectionId, next).length > 0) continue;
    documents[reference.sectionId] = next;
    rewritten.set(reference.sectionId, next);
    return true;
  }
  return false;
}

function createdSectionId(
  kind: CreatableSectionKind,
  id: string | undefined,
): ProtocolSectionId {
  if (kind === 'codebookEgo') return sectionId({ kind: 'codebookEgo' });
  if (id === undefined) throw new Error(`a ${kind} section needs an id`);
  return kind === 'stage'
    ? sectionId({ kind: 'stage', stageId: id })
    : sectionId({ kind, typeId: id });
}

function stageList(order: SectionDoc): string[] {
  return Array.isArray(order.stages)
    ? order.stages.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function copyOf(entry: LoggedEvent): LoggedEvent {
  return { cursor: entry.cursor, event: structuredClone(entry.event) };
}

function codebookSectionId(subject: CodebookSubject): ProtocolSectionId {
  if (subject.entity === 'ego') return sectionId({ kind: 'codebookEgo' });
  if (subject.entity === 'node') {
    return sectionId({ kind: 'codebookNode', typeId: subject.type });
  }
  return sectionId({ kind: 'codebookEdge', typeId: subject.type });
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
