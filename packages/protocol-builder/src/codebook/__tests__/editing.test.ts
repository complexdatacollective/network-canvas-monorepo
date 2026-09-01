import { describe, expect, it, vi } from 'vitest';

import {
  applyCommands,
  contentHash,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

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
    session.receiveAuthoritative({ name: 'Remote name' });

    expect(session.getSnapshot()).toMatchObject({
      authoritativeDocument: { name: 'Remote name' },
      draft: { name: 'Local name' },
      authoritativeChanged: true,
    });
  });
});
