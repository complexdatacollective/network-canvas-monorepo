import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { buildCreateVariableRequest } from '../../codebook/editing.ts';
import type {
  CompoundEditResult,
  CompoundEditSubmission,
  ProtocolBuilderPresence,
} from '../../session.ts';
import { readMessage } from '../../testing/i18n.ts';
import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../InMemoryCompoundHost.ts';

/**
 * A refusal as the researcher reads it.
 *
 * `message` is a plain string because a host writes its own into the same
 * field, so the ones this package produces travel through it encoded and are
 * decoded where they are rendered. Asserting on the decoded text is what the
 * editors show; asserting on the raw string would pass for a message that had
 * been silently replaced.
 */
const asRead = (result: CompoundEditResult): CompoundEditResult =>
  result.status === 'failed'
    ? { ...result, message: readMessage(result.message) }
    : result;

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const secondStageSection = sectionId({
  kind: 'stage',
  stageId: 'stage-2',
});
const formStageSection = sectionId({
  kind: 'stage',
  stageId: 'form-stage',
});
const personSection = sectionId({
  kind: 'codebookNode',
  typeId: 'person',
});
const placeSection = sectionId({
  kind: 'codebookNode',
  typeId: 'place',
});
const edgeSection = sectionId({
  kind: 'codebookEdge',
  typeId: 'knows',
});
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });

const initialSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Compound host test', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1', 'stage-2'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [],
  },
  [secondStageSection]: {
    id: 'stage-2',
    type: 'Information',
    label: 'Closing',
    title: 'Closing',
    items: [],
  },
  [personSection]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {},
  },
  [edgeSection]: { name: 'Knows' },
  [assetsSection]: {},
};

const primaryHolder = presence(
  stageSection,
  'tab-primary',
  'user-primary',
  'Primary editor',
);

function presence(
  section: ProtocolSectionId,
  sessionId: string,
  userId: string,
  displayName: string,
): ProtocolBuilderPresence {
  return {
    sessionId,
    userId,
    displayName,
    sectionId: section,
    mode: 'editing',
  };
}

function lease(
  section: ProtocolSectionId,
  leaseOwner: string,
  leaseEpoch: bigint,
  holder: ProtocolBuilderPresence,
): InMemoryCompoundHostLease {
  return { sectionId: section, leaseOwner, leaseEpoch, holder };
}

function host(
  additionalLeases: readonly InMemoryCompoundHostLease[] = [],
  primaryLease = lease(stageSection, 'owner-primary', 4n, primaryHolder),
) {
  return new InMemoryCompoundHost({
    protocolSections: initialSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [primaryLease, ...additionalLeases],
  });
}

function baseHash(section: ProtocolSectionId): string {
  const document = initialSections[section];
  if (document === undefined)
    throw new Error(`missing base section ${section}`);
  return contentHash(document);
}

function submission(
  id: string,
  edits: CompoundEditSubmission['edits'],
  leaseEpoch = 4n,
): CompoundEditSubmission {
  return {
    id,
    description: `Compound edit ${id}`,
    authority: {
      sectionId: stageSection,
      leaseOwner: 'owner-primary',
      leaseEpoch,
    },
    edits,
  };
}

describe('InMemoryCompoundHost', () => {
  it('updates and removes sections in one committed revision', () => {
    const compoundHost = host();

    const result = compoundHost.submit(
      submission('update-and-remove', [
        {
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: baseHash(stageSection),
          commands: [{ op: 'set', key: 'label', value: 'Introductions' }],
        },
        {
          kind: 'remove',
          sectionId: edgeSection,
          expectedContentHash: baseHash(edgeSection),
        },
      ]),
    );

    expect(result.status).toBe('applied');
    const snapshot = compoundHost.getSnapshot();
    expect(snapshot.manifestRevision.sequence).toBe(8n);
    expect(snapshot.manifestRevision.hash).not.toBe('revision-7');
    expect(snapshot.protocolSections[stageSection]?.label).toBe(
      'Introductions',
    );
    expect(snapshot.protocolSections).not.toHaveProperty(edgeSection);
    expect(snapshot.protocolSections[personSection]).toEqual(
      initialSections[personSection],
    );
  });

  it('returns every blocker with its exact holder and changes nothing', () => {
    const personHolder = presence(
      personSection,
      'tab-person',
      'user-person',
      'Person editor',
    );
    const edgeHolder = presence(
      edgeSection,
      'tab-edge',
      'user-edge',
      'Edge editor',
    );
    const compoundHost = host([
      lease(personSection, 'owner-person', 2n, personHolder),
      lease(edgeSection, 'owner-edge', 8n, edgeHolder),
    ]);
    const before = compoundHost.getSnapshot();

    const result = compoundHost.submit(
      submission('blocked-edit', [
        {
          kind: 'update',
          sectionId: personSection,
          expectedContentHash: baseHash(personSection),
          commands: [{ op: 'set', key: 'name', value: 'People' }],
        },
        {
          kind: 'update',
          sectionId: edgeSection,
          expectedContentHash: baseHash(edgeSection),
          commands: [{ op: 'set', key: 'name', value: 'Friend' }],
        },
      ]),
    );

    expect(result).toEqual({
      status: 'blocked',
      blockedSections: [
        { sectionId: edgeSection, holder: edgeHolder },
        { sectionId: personSection, holder: personHolder },
      ],
    });
    expect(compoundHost.getSnapshot()).toEqual(before);
  });

  it('rolls back every edit when validation fails after applying the working copy', () => {
    const compoundHost = host();
    const before = compoundHost.getSnapshot();

    const result = compoundHost.submit(
      submission('invalid-create', [
        {
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: baseHash(stageSection),
          commands: [{ op: 'set', key: 'label', value: 'Must roll back' }],
        },
        {
          kind: 'create',
          sectionId: placeSection,
          document: { name: 'Place' },
        },
      ]),
    );

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'host-error',
      sectionId: placeSection,
    });
    expect(compoundHost.getSnapshot()).toEqual(before);
  });

  it('rejects a compound edit that breaks an untouched stage dependency', () => {
    const personWithAge = {
      ...initialSections[personSection],
      variables: {
        age: { name: 'Age', type: 'number', component: 'Number' },
      },
    } satisfies SectionDoc;
    const authoritativeSections = {
      ...initialSections,
      [stageOrderSection]: {
        stages: ['stage-1', 'stage-2', 'form-stage'],
      },
      [formStageSection]: {
        id: 'form-stage',
        type: 'AlterForm',
        label: 'Person form',
        subject: { entity: 'node', type: 'person' },
        introductionPanel: { title: 'Questions', text: 'Answer these.' },
        form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
      },
      [personSection]: personWithAge,
    } satisfies Record<string, SectionDoc>;
    expect(
      CurrentProtocolSchema.safeParse(
        assembleProtocolSections(authoritativeSections),
      ).success,
    ).toBe(true);
    const compoundHost = new InMemoryCompoundHost({
      protocolSections: authoritativeSections,
      manifestRevision: { sequence: 7n, hash: 'revision-7' },
      leases: [lease(stageSection, 'owner-primary', 4n, primaryHolder)],
    });
    const before = compoundHost.getSnapshot();

    const result = compoundHost.submit(
      submission('delete-referenced-variable', [
        {
          kind: 'update',
          sectionId: personSection,
          expectedContentHash: contentHash(personWithAge),
          commands: [{ op: 'set', key: 'variables', value: {} }],
        },
      ]),
    );

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'host-error',
      sectionId: formStageSection,
    });
    expect(compoundHost.getSnapshot()).toEqual(before);
  });

  it.each([
    {
      name: 'duplicate stage order',
      sectionId: stageOrderSection,
      document: { stages: ['stage-1', 'stage-2'] },
      command: {
        op: 'set',
        key: 'stages',
        value: ['stage-1', 'stage-1', 'stage-2'],
      },
    },
    {
      name: 'invalid settings',
      sectionId: settingsSection,
      document: { name: 'Protocol', schemaVersion: 8 },
      command: { op: 'set', key: 'schemaVersion', value: 7 },
    },
    {
      name: 'invalid assets',
      sectionId: assetsSection,
      document: {},
      command: {
        op: 'set',
        key: 'portrait',
        value: {
          name: 'Portrait',
          type: 'image',
          source: '../portrait.png',
        },
      },
    },
  ] as const)(
    'rejects and rolls back $name with default validation',
    (testCase) => {
      const authoritativeSections = {
        ...initialSections,
        [testCase.sectionId]: testCase.document,
      };
      const compoundHost = new InMemoryCompoundHost({
        protocolSections: authoritativeSections,
        manifestRevision: { sequence: 7n, hash: 'revision-7' },
        leases: [lease(stageSection, 'owner-primary', 4n, primaryHolder)],
      });
      const before = compoundHost.getSnapshot();

      const result = compoundHost.submit(
        submission(`malformed-${testCase.sectionId}`, [
          {
            kind: 'update',
            sectionId: testCase.sectionId,
            expectedContentHash: contentHash(testCase.document),
            commands: [testCase.command],
          },
        ]),
      );

      expect(result).toMatchObject({
        status: 'failed',
        reason: 'host-error',
        sectionId: testCase.sectionId,
      });
      expect(compoundHost.getSnapshot()).toEqual(before);
    },
  );

  it.each([
    {
      name: 'settings',
      sectionId: settingsSection,
      document: { name: 'Protocol', schemaVersion: 8 },
      command: { op: 'set', key: 'description', value: 'Updated protocol' },
      expectedDocument: {
        name: 'Protocol',
        schemaVersion: 8,
        description: 'Updated protocol',
      },
    },
    {
      name: 'stage order',
      sectionId: stageOrderSection,
      document: { stages: ['stage-1', 'stage-2'] },
      command: {
        op: 'set',
        key: 'stages',
        value: ['stage-2', 'stage-1'],
      },
      expectedDocument: { stages: ['stage-2', 'stage-1'] },
    },
    {
      name: 'assets',
      sectionId: assetsSection,
      document: {},
      command: {
        op: 'set',
        key: 'portrait',
        value: {
          name: 'Portrait',
          type: 'image',
          source: 'portrait.png',
        },
      },
      expectedDocument: {
        portrait: {
          name: 'Portrait',
          type: 'image',
          source: 'portrait.png',
        },
      },
    },
  ] as const)(
    'accepts a valid $name edit with default validation',
    (testCase) => {
      const authoritativeSections = {
        ...initialSections,
        [testCase.sectionId]: testCase.document,
      };
      const compoundHost = new InMemoryCompoundHost({
        protocolSections: authoritativeSections,
        manifestRevision: { sequence: 7n, hash: 'revision-7' },
        leases: [lease(stageSection, 'owner-primary', 4n, primaryHolder)],
      });

      const result = compoundHost.submit(
        submission(`valid-${testCase.sectionId}`, [
          {
            kind: 'update',
            sectionId: testCase.sectionId,
            expectedContentHash: contentHash(testCase.document),
            commands: [testCase.command],
          },
        ]),
      );

      expect(result).toMatchObject({
        status: 'applied',
        update: {
          protocolSections: {
            [testCase.sectionId]: testCase.expectedDocument,
          },
          manifestRevision: { sequence: 8n },
        },
      });
      expect(compoundHost.getSnapshot()).toMatchObject({
        protocolSections: {
          [testCase.sectionId]: testCase.expectedDocument,
        },
        manifestRevision: { sequence: 8n },
      });
    },
  );

  it('rejects a stale primary epoch before changing any section', () => {
    const compoundHost = host();
    const before = compoundHost.getSnapshot();

    const result = compoundHost.submit(
      submission(
        'stale-epoch',
        [
          {
            kind: 'update',
            sectionId: personSection,
            expectedContentHash: baseHash(personSection),
            commands: [{ op: 'set', key: 'name', value: 'People' }],
          },
        ],
        3n,
      ),
    );

    expect(asRead(result)).toEqual({
      status: 'failed',
      reason: 'stale-epoch',
      message: 'the primary section lease epoch is stale',
      sectionId: stageSection,
    });
    expect(compoundHost.getSnapshot()).toEqual(before);
  });

  it('structurally creates a new codebook section', () => {
    const compoundHost = host();
    const place = {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {},
    };

    const result = compoundHost.submit(
      submission('create-place', [
        { kind: 'create', sectionId: placeSection, document: place },
      ]),
    );

    expect(result.status).toBe('applied');
    expect(compoundHost.getSnapshot()).toMatchObject({
      manifestRevision: { sequence: 8n },
      protocolSections: { [placeSection]: place },
    });
  });

  it('returns one applied result for an exact retry and rejects id reuse', () => {
    const compoundHost = host();
    const request = submission('retry-once', [
      {
        kind: 'update',
        sectionId: stageSection,
        expectedContentHash: baseHash(stageSection),
        commands: [{ op: 'set', key: 'label', value: 'Retried safely' }],
      },
    ]);

    const first = compoundHost.submit(request);
    const retry = compoundHost.submit(request);

    expect(first.status).toBe('applied');
    expect(retry).toBe(first);
    expect(compoundHost.getSnapshot().manifestRevision.sequence).toBe(8n);

    const reused = compoundHost.submit({
      ...request,
      description: 'Different intent under the same id',
    });
    expect(reused).toMatchObject({
      status: 'failed',
      reason: 'invalid-request',
    });
    expect(compoundHost.getSnapshot().manifestRevision.sequence).toBe(8n);
    expect(
      compoundHost.getSnapshot().protocolSections[stageSection]?.label,
    ).toBe('Retried safely');
  });

  it('rejects structural stage edits and stage identity commands at the host boundary', () => {
    const compoundHost = host();
    const before = compoundHost.getSnapshot();

    expect(
      compoundHost.submit(
        submission('remove-stage', [
          {
            kind: 'remove',
            sectionId: stageSection,
            expectedContentHash: baseHash(stageSection),
          },
        ]),
      ),
    ).toMatchObject({
      status: 'failed',
      reason: 'invalid-request',
      sectionId: stageSection,
    });
    expect(
      compoundHost.submit(
        submission('change-stage-identity', [
          {
            kind: 'update',
            sectionId: stageSection,
            expectedContentHash: baseHash(stageSection),
            commands: [{ op: 'set', key: 'id', value: 'replacement' }],
          },
        ]),
      ),
    ).toMatchObject({
      status: 'failed',
      reason: 'invalid-request',
      sectionId: stageSection,
    });
    expect(compoundHost.getSnapshot()).toEqual(before);
  });

  it('returns lease-lost with the exact holder when primary ownership changed', () => {
    const replacementHolder = presence(
      stageSection,
      'tab-replacement',
      'user-replacement',
      'Replacement editor',
    );
    const compoundHost = host(
      [],
      lease(stageSection, 'owner-replacement', 5n, replacementHolder),
    );
    const before = compoundHost.getSnapshot();

    expect(
      asRead(
        compoundHost.submit(
          submission('lost-primary-owner', [
            {
              kind: 'update',
              sectionId: personSection,
              expectedContentHash: baseHash(personSection),
              commands: [{ op: 'set', key: 'name', value: 'People' }],
            },
          ]),
        ),
      ),
    ).toEqual({
      status: 'failed',
      reason: 'lease-lost',
      message: 'the primary section lease is now held by another editor',
      sectionId: stageSection,
      holder: replacementHolder,
    });
    expect(compoundHost.getSnapshot()).toEqual(before);
  });

  it('rejects a stale variable-map base before a remote variable can be erased', () => {
    const basePerson = initialSections[personSection];
    if (basePerson === undefined) throw new Error('missing person section');
    const currentPerson = {
      ...basePerson,
      variables: {
        remote: { name: 'remote', type: 'text' },
      },
    } satisfies SectionDoc;
    const compoundHost = new InMemoryCompoundHost({
      protocolSections: {
        ...initialSections,
        [personSection]: currentPerson,
      },
      manifestRevision: { sequence: 8n, hash: 'revision-8' },
      leases: [lease(stageSection, 'owner-primary', 4n, primaryHolder)],
    });
    const request = buildCreateVariableRequest({
      requestId: 'create-local-from-stale-map',
      description: 'Create local attribute',
      subject: { entity: 'node', type: 'person' },
      authoritativeDocument: basePerson,
      variableId: 'local',
      protocolContext: {
        codebook: { node: {}, edge: {} },
        assets: {},
        orderedStages: [],
        issues: [],
      },
      draft: { name: 'local', type: 'text' },
    });

    expect(
      asRead(compoundHost.submit(submission(request.id, request.edits))),
    ).toEqual({
      status: 'failed',
      reason: 'stale-base',
      message: 'the compound edit was built from an outdated section document',
      sectionId: personSection,
    });
    expect(compoundHost.getSnapshot()).toMatchObject({
      manifestRevision: { sequence: 8n, hash: 'revision-8' },
      protocolSections: {
        [personSection]: {
          variables: { remote: { name: 'remote', type: 'text' } },
        },
      },
    });
    expect(
      compoundHost.getSnapshot().protocolSections[personSection]?.variables,
    ).not.toHaveProperty('local');
  });
});

/**
 * The other way a protocol on this host changes: not through a session's
 * compound edit, but because someone else already changed it and this host is
 * being told.
 */
describe('an authoritative change made outside every session', () => {
  it('replaces and removes sections, and issues the revision for them', () => {
    const compoundHost = host();

    const applied = compoundHost.receiveAuthoritativeSections({
      [personSection]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: { nickname: { name: 'nickname', type: 'text' } },
      },
      [edgeSection]: null,
    });

    expect(applied.manifestRevision.sequence).toBe(8n);
    expect(applied.manifestRevision.hash).not.toBe('revision-7');
    expect(applied).toEqual(compoundHost.getSnapshot());
    expect(applied.protocolSections[personSection]?.variables).toHaveProperty(
      'nickname',
    );
    expect(applied.protocolSections).not.toHaveProperty(edgeSection);
  });

  /**
   * Unchecked on purpose. An arrival is not a submission: it holds no lease,
   * it IS the new base rather than being built on one, and whoever made it has
   * already answered for it. A fixture seeds states no submission could
   * produce — here, an attribute deleted out from under a form stage that
   * still asks for it, which `rejects a compound edit that breaks an untouched
   * stage dependency` above proves a submission cannot do — because that
   * broken state is exactly what an editor has to be seen reacting to.
   */
  it('applies a change no submission could make', () => {
    const personWithAge = {
      ...initialSections[personSection],
      variables: { age: { name: 'Age', type: 'number', component: 'Number' } },
    } satisfies SectionDoc;
    const compoundHost = new InMemoryCompoundHost({
      protocolSections: {
        ...initialSections,
        [stageOrderSection]: { stages: ['stage-1', 'stage-2', 'form-stage'] },
        [formStageSection]: {
          id: 'form-stage',
          type: 'AlterForm',
          label: 'Person form',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'Questions', text: 'Answer these.' },
          form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
        },
        [personSection]: personWithAge,
      },
      manifestRevision: { sequence: 7n, hash: 'revision-7' },
      leases: [lease(stageSection, 'owner-primary', 4n, primaryHolder)],
    });

    const applied = compoundHost.receiveAuthoritativeSections({
      [personSection]: { ...personWithAge, variables: {} },
    });

    expect(applied.protocolSections[personSection]?.variables).toEqual({});
    expect(
      CurrentProtocolSchema.safeParse(
        assembleProtocolSections(applied.protocolSections),
      ).success,
    ).toBe(false);
  });

  it('is a base the next compound edit is accepted against', () => {
    const compoundHost = host();
    const arrived = {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { nickname: { name: 'nickname', type: 'text' } },
    } satisfies SectionDoc;
    compoundHost.receiveAuthoritativeSections({ [personSection]: arrived });

    const result = compoundHost.submit(
      submission('rename-the-arrived-attribute', [
        {
          kind: 'update',
          sectionId: personSection,
          // Built from what the arrival said, which is what a session told
          // about it would have been shown.
          expectedContentHash: contentHash(arrived),
          commands: [
            {
              op: 'set',
              key: 'variables',
              value: { nickname: { name: 'preferred_name', type: 'text' } },
            },
          ],
        },
      ]),
    );

    expect(result.status).toBe('applied');
    expect(
      compoundHost.getSnapshot().protocolSections[personSection]?.variables,
    ).toEqual({ nickname: { name: 'preferred_name', type: 'text' } });
  });
});
