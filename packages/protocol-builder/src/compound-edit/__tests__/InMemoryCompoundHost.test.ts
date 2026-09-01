import { describe, expect, it } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { buildCreateVariableRequest } from '../../codebook/editing.ts';
import type {
  CompoundEditSubmission,
  ProtocolBuilderPresence,
} from '../../session.ts';
import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../InMemoryCompoundHost.ts';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
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

const initialSections: Record<string, SectionDoc> = {
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [],
  },
  [personSection]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {},
  },
  [edgeSection]: { name: 'Knows' },
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

    expect(result).toEqual({
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
        orderedStages: [],
        issues: [],
      },
      draft: { name: 'local', type: 'text' },
    });

    expect(compoundHost.submit(submission(request.id, request.edits))).toEqual({
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
