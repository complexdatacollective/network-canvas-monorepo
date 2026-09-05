import { describe, expect, it, vi } from 'vitest';

import {
  applyCommands,
  contentHash,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildCreateEntityRequest,
  buildCreateVariableRequest,
  buildRemoveEntityRequest,
  buildRemoveVariableRequest,
  buildUpdateEntityRequest,
  buildUpdateVariableRequest,
  DuplicateVariableIdError,
  DuplicateVariableNameError,
  InvalidCodebookDraftError,
  withStageSectionEdit,
} from '../editing.ts';

const SUBJECT = { entity: 'node', type: 'person:adult' } as const;
const EMPTY_CONTEXT = {
  codebook: { node: {}, edge: {} },
  assets: {},
  orderedStages: [],
  issues: [],
} as const;

const personDocument = (variables: Record<string, unknown> = {}): SectionDoc =>
  ({
    name: 'Person',
    color: 'node-color-seq-1',
    icon: 'person',
    shape: { default: 'circle' },
    variables,
  }) as SectionDoc;

const updateDocumentFrom = (
  document: SectionDoc,
  request: ReturnType<typeof buildUpdateEntityRequest>,
): SectionDoc => {
  const [edit] = request.edits;
  if (edit?.kind !== 'update') throw new Error('expected an update edit');
  return applyCommands(document, [...edit.commands]);
};

const deferred = <Value>() => {
  let resolvePromise: ((value: Value) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value: Value) {
      if (resolvePromise === null) throw new Error('deferred is not ready');
      resolvePromise(value);
    },
    reject(reason: unknown) {
      if (rejectPromise === null) throw new Error('deferred is not ready');
      rejectPromise(reason);
    },
  };
};

const appliedResult = (): Extract<
  CompoundEditResult,
  { status: 'applied' }
> => ({
  status: 'applied',
  update: {
    protocolSections: {},
    manifestRevision: { sequence: 2n, hash: 'revision-2' },
  },
});

const entityUpdateRequest = (
  draft: Readonly<SectionDoc>,
  authoritativeDocument: Readonly<SectionDoc> | null,
): CompoundEditRequest => {
  if (authoritativeDocument === null) {
    throw new Error('expected an authoritative entity document');
  }
  return buildUpdateEntityRequest({
    requestId: 'request-pending-update',
    description: 'Update person type',
    subject: SUBJECT,
    authoritativeDocument,
    draft,
  });
};

describe('codebook entity requests', () => {
  it('uses injected stable ids and preserves colon-containing entity ids', () => {
    const request = buildCreateEntityRequest({
      requestId: 'request-stable-1',
      description: 'Create person type',
      subject: SUBJECT,
      draft: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    });

    expect(request.id).toBe('request-stable-1');
    expect(request.edits).toEqual([
      {
        kind: 'create',
        sectionId: 'codebook:node:person:adult',
        document: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {},
        },
      },
    ]);
  });

  it('treats __proto__ as data rather than a prototype mutation', () => {
    const request = buildCreateEntityRequest({
      requestId: 'request-proto',
      description: 'Create unusual type',
      subject: { entity: 'node', type: '__proto__' },
      draft: {
        name: 'Unusual',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    });

    expect(request.edits[0]?.sectionId).toBe('codebook:node:__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('updates only rendered properties and preserves variables and icon', () => {
    const authoritativeDocument = personDocument({
      'existing-variable': { name: 'age', type: 'number' },
    });
    const request = buildUpdateEntityRequest({
      requestId: 'request-update',
      description: 'Rename person type',
      subject: SUBJECT,
      authoritativeDocument,
      draft: {
        name: 'Adult',
        variables: {},
      },
    });

    expect(updateDocumentFrom(authoritativeDocument, request)).toEqual({
      ...authoritativeDocument,
      name: 'Adult',
    });
  });

  it('emits a structural remove rather than invalidating an existing section', () => {
    const authoritativeDocument = personDocument();
    expect(
      buildRemoveEntityRequest({
        requestId: 'request-remove',
        description: 'Remove person type',
        subject: SUBJECT,
        authoritativeDocument,
      }).edits,
    ).toEqual([
      {
        kind: 'remove',
        sectionId: 'codebook:node:person:adult',
        expectedContentHash: contentHash(authoritativeDocument),
      },
    ]);
  });

  it('builds one explicit stage-and-codebook request for a nested action', () => {
    const authoritativeStageDocument = {
      id: 'stage-1',
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [],
    } satisfies SectionDoc;
    const codebookRequest = buildCreateEntityRequest({
      requestId: 'request-create-and-select',
      description: 'Create and select person type',
      subject: SUBJECT,
      draft: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    });

    const compound = withStageSectionEdit(
      codebookRequest,
      sectionId({ kind: 'stage', stageId: 'stage-1' }),
      authoritativeStageDocument,
      [
        {
          op: 'set',
          key: 'subject',
          value: { entity: 'node', type: 'person:adult' },
        },
      ],
    );

    expect(compound.id).toBe('request-create-and-select');
    expect(compound.edits.map(({ kind }) => kind)).toEqual([
      'create',
      'update',
    ]);
    expect(Object.isFrozen(compound.edits)).toBe(true);
    expect(Object.isFrozen(compound.edits[0])).toBe(true);
    expect(compound.edits[1]).toMatchObject({
      expectedContentHash: contentHash(authoritativeStageDocument),
    });
  });
});

describe('codebook variable requests', () => {
  it('rejects a variable record id already used by another subject', () => {
    expect(() =>
      buildCreateVariableRequest({
        requestId: 'request-duplicate-id',
        description: 'Create attribute',
        subject: SUBJECT,
        authoritativeDocument: personDocument(),
        variableId: 'global-id',
        protocolContext: {
          codebook: {
            node: {},
            edge: {
              relationship: {
                name: 'Relationship',
                variables: {
                  'global-id': { name: 'elsewhere', type: 'text' },
                },
              },
            },
          },
          assets: {},
          orderedStages: [],
          issues: [],
        },
        draft: { name: 'age', type: 'number' },
      }),
    ).toThrow(DuplicateVariableIdError);
  });

  it('rejects duplicate names within the owning subject', () => {
    expect(() =>
      buildCreateVariableRequest({
        requestId: 'request-duplicate-name',
        description: 'Create attribute',
        subject: SUBJECT,
        authoritativeDocument: personDocument({
          'existing-id': { name: 'age', type: 'number' },
        }),
        variableId: 'new-id',
        protocolContext: EMPTY_CONTEXT,
        draft: { name: 'age', type: 'number' },
      }),
    ).toThrow(DuplicateVariableNameError);
  });

  it('rejects a normalized-equivalent name when creating a variable', () => {
    expect(() =>
      buildCreateVariableRequest({
        requestId: 'request-canonical-duplicate-name',
        description: 'Create attribute',
        subject: SUBJECT,
        authoritativeDocument: personDocument({
          'existing-id': { name: 'Cafe', type: 'text' },
        }),
        variableId: 'new-id',
        protocolContext: EMPTY_CONTEXT,
        draft: { name: 'cafe', type: 'text' },
      }),
    ).toThrow(DuplicateVariableNameError);
  });

  it('rejects a case-equivalent name when renaming a variable', () => {
    expect(() =>
      buildUpdateVariableRequest({
        requestId: 'request-case-duplicate-name',
        description: 'Rename attribute',
        subject: SUBJECT,
        authoritativeDocument: personDocument({
          edited: { name: 'height', type: 'number' },
          existing: { name: 'Age', type: 'number' },
        }),
        variableId: 'edited',
        draft: { name: 'age' },
      }),
    ).toThrow(DuplicateVariableNameError);
  });

  it.each([
    {
      caseName: 'an incomplete row',
      options: [
        { label: 'First', value: 'first' },
        { label: '   ', value: '' },
      ],
      expectedIssue: 'Every option needs both a label and a value.',
    },
    {
      caseName: 'duplicate values',
      options: [
        { label: 'First', value: 'Caf\u00e9' },
        { label: 'Second', value: 'CAFE\u0301' },
      ],
      expectedIssue: 'Every option needs a unique value.',
    },
    {
      caseName: 'string and numeric values with the same export key',
      options: [
        { label: 'Number', value: 1 },
        { label: 'Text', value: '1' },
      ],
      expectedIssue: 'Every option needs a unique value.',
    },
    {
      caseName: 'duplicate labels',
      options: [
        { label: 'Caf\u00e9', value: 'first' },
        { label: 'CAFE\u0301', value: 'second' },
      ],
      expectedIssue: 'Every option needs a unique label.',
    },
    {
      caseName: 'an export-unsafe value',
      options: [
        { label: 'Safe', value: 'safe' },
        { label: 'Unsafe', value: 'not safe' },
      ],
      expectedIssue:
        'Not a valid option value. Only letters, numbers and the symbols ._-: are supported',
    },
  ])(
    'rejects categorical options with $caseName',
    ({ options, expectedIssue }) => {
      let error: unknown;
      try {
        buildCreateVariableRequest({
          requestId: 'request-invalid-options',
          description: 'Create attribute',
          subject: SUBJECT,
          authoritativeDocument: personDocument(),
          variableId: 'choice',
          protocolContext: EMPTY_CONTEXT,
          draft: { name: 'choice', type: 'categorical', options },
        });
      } catch (caught: unknown) {
        error = caught;
      }

      expect(error).toBeInstanceOf(InvalidCodebookDraftError);
      if (!(error instanceof InvalidCodebookDraftError)) {
        throw new Error('expected an invalid codebook draft');
      }
      expect(error.issues).toContainEqual({
        path: ['options'],
        message: expectedIssue,
      });
    },
  );

  it('delegates the minimum categorical option count to VariableSchema', () => {
    let error: unknown;
    try {
      buildCreateVariableRequest({
        requestId: 'request-one-option',
        description: 'Create attribute',
        subject: SUBJECT,
        authoritativeDocument: personDocument(),
        variableId: 'choice',
        protocolContext: EMPTY_CONTEXT,
        draft: {
          name: 'choice',
          type: 'categorical',
          options: [{ label: 'Only', value: 'only' }],
        },
      });
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(InvalidCodebookDraftError);
    if (!(error instanceof InvalidCodebookDraftError)) {
      throw new Error('expected an invalid codebook draft');
    }
    expect(error.issues.some(({ path }) => path[0] === 'options')).toBe(true);
  });

  it('stores __proto__ as an own variable id without polluting prototypes', () => {
    const authoritativeDocument = personDocument();
    const request = buildCreateVariableRequest({
      requestId: 'request-variable-proto',
      description: 'Create unusual attribute',
      subject: SUBJECT,
      authoritativeDocument,
      variableId: '__proto__',
      protocolContext: EMPTY_CONTEXT,
      draft: { name: 'unusual', type: 'text' },
    });
    const updated = updateDocumentFrom(authoritativeDocument, request);
    const variables = updated.variables as Record<string, unknown>;

    expect(Object.hasOwn(variables, '__proto__')).toBe(true);
    expect(variables.__proto__).toEqual({ name: 'unusual', type: 'text' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('preserves unrendered variable properties unless explicitly replaced', () => {
    const authoritativeDocument = personDocument({
      'variable-1': {
        name: 'score',
        type: 'number',
        component: 'Number',
        validation: { required: true },
      },
    });
    const request = buildUpdateVariableRequest({
      requestId: 'request-variable-update',
      description: 'Rename attribute',
      subject: SUBJECT,
      authoritativeDocument,
      variableId: 'variable-1',
      draft: { name: 'renamed' },
    });
    const variables = updateDocumentFrom(authoritativeDocument, request)
      .variables as Record<string, unknown>;

    expect(variables['variable-1']).toEqual({
      name: 'renamed',
      type: 'number',
      component: 'Number',
      validation: { required: true },
    });
  });

  it('preserves schema-valid punctuation in attribute names', () => {
    const authoritativeDocument = personDocument({
      'variable-1': { name: 'person-age', type: 'number' },
    });
    const request = buildUpdateVariableRequest({
      requestId: 'request-punctuated-variable-update',
      description: 'Rename attribute with schema-valid punctuation',
      subject: SUBJECT,
      authoritativeDocument,
      variableId: 'variable-1',
      draft: { name: 'person.age' },
    });
    const variables = updateDocumentFrom(authoritativeDocument, request)
      .variables as Record<string, unknown>;

    expect(variables['variable-1']).toEqual({
      name: 'person.age',
      type: 'number',
    });
  });

  it('removes one variable without rebuilding the entity section', () => {
    const authoritativeDocument = personDocument({
      keep: { name: 'keep', type: 'text' },
      remove: { name: 'remove', type: 'text' },
    });
    const request = buildRemoveVariableRequest({
      requestId: 'request-variable-remove',
      description: 'Remove attribute',
      subject: SUBJECT,
      authoritativeDocument,
      variableId: 'remove',
    });
    const variables = updateDocumentFrom(authoritativeDocument, request)
      .variables as Record<string, unknown>;

    expect(variables).toEqual({ keep: { name: 'keep', type: 'text' } });
  });
});

describe('AuxiliaryCodebookDraftSession', () => {
  it('preserves a null validation-rule draft when local validation rejects submit', async () => {
    const draft = {
      name: 'comment',
      type: 'text',
      validation: { minLength: null },
    };
    const session = new AuxiliaryCodebookDraftSession(draft);
    const submit = vi.fn();

    await expect(
      session.submit(
        (currentDraft) =>
          buildCreateVariableRequest({
            requestId: 'request-invalid-rule',
            description: 'Create comment',
            subject: SUBJECT,
            authoritativeDocument: personDocument(),
            variableId: 'comment-id',
            protocolContext: EMPTY_CONTEXT,
            draft: currentDraft,
          }),
        submit,
      ),
    ).rejects.toBeInstanceOf(InvalidCodebookDraftError);

    expect(submit).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      draft: { validation: { minLength: null } },
      status: 'editing',
      lastFailure: {
        kind: 'error',
        message: 'the variable draft is invalid',
      },
    });
  });

  it('preserves the draft when the host rejects the compound request', async () => {
    const draft = { name: 'comment', type: 'text' };
    const session = new AuxiliaryCodebookDraftSession(draft);
    const failure = {
      status: 'failed',
      reason: 'stale-epoch',
      message: 'editing authority changed',
    } as const;

    await expect(
      session.submit(
        (currentDraft) =>
          buildCreateVariableRequest({
            requestId: 'request-stale',
            description: 'Create comment',
            subject: SUBJECT,
            authoritativeDocument: personDocument(),
            variableId: 'comment-id',
            protocolContext: EMPTY_CONTEXT,
            draft: currentDraft,
          }),
        () => failure,
      ),
    ).resolves.toBe(failure);

    expect(session.getSnapshot()).toMatchObject({
      draft,
      status: 'editing',
      lastFailure: { kind: 'result', result: failure },
    });
  });

  it('keeps a dirty draft separate from a remote authoritative update', () => {
    const session = new AuxiliaryCodebookDraftSession(
      { name: 'Person' },
      { name: 'Person' },
    );
    session.replaceDraft({ name: 'Local name' });
    expect(session.receiveAuthoritative({ name: 'Remote name' })).toBe(true);

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: { name: 'Remote name' },
      draft: { name: 'Local name' },
      authoritativeChanged: true,
    });
  });

  it('ignores a content-identical authoritative re-emission', () => {
    const authoritativeDocument = personDocument();
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft({ ...authoritativeDocument, name: 'LocalName' });
    const before = session.getSnapshot();
    const listener = vi.fn();
    session.subscribe(listener);

    expect(
      session.receiveAuthoritative(structuredClone(authoritativeDocument)),
    ).toBe(false);

    expect(session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      draft: { name: 'LocalName' },
      authoritativeChanged: false,
      status: 'editing',
    });
  });

  it('reconciles a matching authoritative update received before apply resolves', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);
    const pending = deferred<CompoundEditResult>();
    const submission = session.submit(
      entityUpdateRequest,
      () => pending.promise,
    );

    session.receiveAuthoritative(structuredClone(submittedDraft));
    pending.resolve(appliedResult());
    await submission;

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: submittedDraft,
      draft: submittedDraft,
      authoritativeChanged: false,
      lastFailure: null,
      status: 'editing',
    });
    expect(session.isDirty()).toBe(false);
  });

  it('returns to an editable conflict when a different authoritative update arrives before apply resolves', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const remoteDocument = { ...authoritativeDocument, name: 'RemoteName' };
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);
    const pending = deferred<CompoundEditResult>();
    const submission = session.submit(
      entityUpdateRequest,
      () => pending.promise,
    );

    session.receiveAuthoritative(remoteDocument);
    pending.resolve(appliedResult());
    await submission;

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: remoteDocument,
      draft: submittedDraft,
      authoritativeChanged: true,
      lastFailure: null,
      status: 'editing',
    });
  });

  it('settles an applied submit after changed content is published and then reverted', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);
    const pending = deferred<CompoundEditResult>();
    const submission = session.submit(
      entityUpdateRequest,
      () => pending.promise,
    );

    session.receiveAuthoritative(structuredClone(submittedDraft));
    session.receiveAuthoritative(structuredClone(authoritativeDocument));
    pending.resolve(appliedResult());
    await submission;

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument,
      draft: submittedDraft,
      authoritativeChanged: true,
      lastFailure: null,
      status: 'editing',
    });
  });

  it('still awaits publication when submit saw only an identity-only re-emission', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);
    const pending = deferred<CompoundEditResult>();
    const submission = session.submit(
      entityUpdateRequest,
      () => pending.promise,
    );

    session.receiveAuthoritative(structuredClone(authoritativeDocument));
    pending.resolve(appliedResult());
    await submission;

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument,
      draft: submittedDraft,
      authoritativeChanged: false,
      lastFailure: null,
      status: 'awaiting-authoritative',
    });
  });

  it.each([
    {
      caseName: 'blocked',
      result: {
        status: 'blocked',
        blockedSections: [{ sectionId: sectionId({ kind: 'codebookEgo' }) }],
      } satisfies CompoundEditResult,
    },
    {
      caseName: 'stale',
      result: {
        status: 'failed',
        reason: 'stale-epoch',
        message: 'editing authority changed',
      } satisfies CompoundEditResult,
    },
  ])(
    'keeps a pending remote conflict and the $caseName result visible',
    async ({ result }) => {
      const authoritativeDocument = personDocument();
      const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
      const remoteDocument = {
        ...authoritativeDocument,
        name: 'RemoteName',
      };
      const session = new AuxiliaryCodebookDraftSession(
        authoritativeDocument,
        authoritativeDocument,
      );
      session.replaceDraft(submittedDraft);
      const pending = deferred<CompoundEditResult>();
      const submission = session.submit(
        entityUpdateRequest,
        () => pending.promise,
      );

      session.receiveAuthoritative(remoteDocument);
      pending.resolve(result);
      await submission;

      expect(session.getSnapshot()).toMatchObject({
        authoritativeDocument: remoteDocument,
        draft: submittedDraft,
        authoritativeChanged: true,
        lastFailure: { kind: 'result', result },
        status: 'editing',
      });
    },
  );

  it('reconciles a matching publication while retaining a blocked result', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const blocked = {
      status: 'blocked',
      blockedSections: [{ sectionId: sectionId({ kind: 'codebookEgo' }) }],
    } satisfies CompoundEditResult;
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);
    const pending = deferred<CompoundEditResult>();
    const submission = session.submit(
      entityUpdateRequest,
      () => pending.promise,
    );

    session.receiveAuthoritative(structuredClone(submittedDraft));
    pending.resolve(blocked);
    await submission;

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: submittedDraft,
      draft: submittedDraft,
      authoritativeChanged: false,
      lastFailure: { kind: 'result', result: blocked },
      status: 'editing',
    });
    expect(session.isDirty()).toBe(false);
  });

  it.each([
    {
      caseName: 'blocked',
      result: {
        status: 'blocked',
        blockedSections: [{ sectionId: sectionId({ kind: 'codebookEgo' }) }],
      } satisfies CompoundEditResult,
    },
    {
      caseName: 'stale',
      result: {
        status: 'failed',
        reason: 'stale-epoch',
        message: 'editing authority changed',
      } satisfies CompoundEditResult,
    },
  ])(
    'reconciles a matching publication received after a $caseName result',
    async ({ result }) => {
      const authoritativeDocument = personDocument();
      const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
      const session = new AuxiliaryCodebookDraftSession(
        authoritativeDocument,
        authoritativeDocument,
      );
      session.replaceDraft(submittedDraft);

      await session.submit(entityUpdateRequest, () => result);
      session.receiveAuthoritative(structuredClone(submittedDraft));

      expect(session.getSnapshot()).toMatchObject({
        authoritativeDocument: submittedDraft,
        draft: submittedDraft,
        authoritativeChanged: false,
        lastFailure: null,
        status: 'editing',
      });
      expect(session.isDirty()).toBe(false);
    },
  );

  it('keeps a pending remote conflict visible when submission rejects', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const remoteDocument = { ...authoritativeDocument, name: 'RemoteName' };
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);
    const pending = deferred<CompoundEditResult>();
    const submission = session.submit(
      entityUpdateRequest,
      () => pending.promise,
    );

    session.receiveAuthoritative(remoteDocument);
    pending.reject(new Error('network unavailable'));
    await expect(submission).rejects.toThrow('network unavailable');

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: remoteDocument,
      draft: submittedDraft,
      authoritativeChanged: true,
      lastFailure: { kind: 'error', message: 'network unavailable' },
      status: 'editing',
    });
  });

  it('reconciles a matching publication received after submission rejects', async () => {
    const authoritativeDocument = personDocument();
    const submittedDraft = { ...authoritativeDocument, name: 'Adult' };
    const session = new AuxiliaryCodebookDraftSession(
      authoritativeDocument,
      authoritativeDocument,
    );
    session.replaceDraft(submittedDraft);

    await expect(
      session.submit(entityUpdateRequest, () =>
        Promise.reject(new Error('network unavailable')),
      ),
    ).rejects.toThrow('network unavailable');
    session.receiveAuthoritative(structuredClone(submittedDraft));

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: submittedDraft,
      draft: submittedDraft,
      authoritativeChanged: false,
      lastFailure: null,
      status: 'editing',
    });
    expect(session.isDirty()).toBe(false);
  });
});
