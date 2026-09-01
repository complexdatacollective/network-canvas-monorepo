import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { ChangeAttribution, ManifestRevision } from '../session.ts';
import { attributeValidationIssues } from '../validationAttribution.ts';

const revision = (sequence: bigint): ManifestRevision => ({
  sequence,
  hash: `revision-${sequence}`,
});

const remoteChange = (atRevision: ManifestRevision): ChangeAttribution => ({
  sessionId: 'remote-tab',
  displayName: 'Remote editor',
  revision: atRevision,
});

describe('attributeValidationIssues', () => {
  it('maps ordered stage issues to the stable stage section id', () => {
    const stageSection = sectionId({ kind: 'stage', stageId: 'stage:two' });

    expect(
      attributeValidationIssues(
        [
          {
            code: 'custom',
            path: ['stages', 1, 'subject'],
            message: 'The selected variable no longer exists',
          },
        ],
        {
          stageOrder: { stages: ['stage-one', 'stage:two'] },
        },
        {},
        revision(2n),
      ),
    ).toEqual([
      {
        code: 'custom',
        path: ['stages', 1, 'subject'],
        message: 'The selected variable no longer exists',
        sectionId: stageSection,
      },
    ]);
  });

  it('attributes a dependency consequence to the referenced entity change', () => {
    const stageSection = sectionId({ kind: 'stage', stageId: 'stage-one' });
    const deletedNodeSection = sectionId({
      kind: 'codebookNode',
      typeId: '__proto__',
    });
    const currentRevision = revision(7n);
    const attribution = remoteChange(currentRevision);

    const [issue] = attributeValidationIssues(
      [
        {
          code: 'custom',
          path: ['stages', 0, 'subject', 'type'],
          message: 'Node type __proto__ does not exist in the codebook',
        },
      ],
      {
        stageOrder: { stages: ['stage-one'] },
        [stageSection]: {
          id: 'stage-one',
          type: 'AlterForm',
          label: 'People',
          subject: { entity: 'node', type: '__proto__' },
          introductionPanel: { title: 'People', text: 'Answer questions.' },
          form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
        },
      },
      {
        [stageSection]: remoteChange(revision(3n)),
        [deletedNodeSection]: attribution,
      },
      currentRevision,
    );

    expect(issue).toMatchObject({
      sectionId: stageSection,
      attributedChange: {
        sectionId: deletedNodeSection,
        attribution,
      },
    });
  });

  it('attributes a missing variable consequence to its referenced codebook section', () => {
    const stageSection = sectionId({ kind: 'stage', stageId: 'stage-one' });
    const personSection = sectionId({
      kind: 'codebookNode',
      typeId: 'person',
    });
    const currentRevision = revision(9n);
    const attribution = remoteChange(currentRevision);

    const [issue] = attributeValidationIssues(
      [
        {
          code: 'custom',
          path: ['stages', 0, 'form', 'fields', 0, 'variable'],
          message: 'The attribute "age" does not exist in the codebook',
        },
      ],
      {
        stageOrder: { stages: ['stage-one'] },
        [stageSection]: {
          id: 'stage-one',
          type: 'AlterForm',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'People', text: 'Answer questions.' },
          form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
        },
        [personSection]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {},
        },
      },
      {
        [stageSection]: remoteChange(revision(3n)),
        [personSection]: attribution,
      },
      currentRevision,
    );

    expect(issue).toMatchObject({
      sectionId: stageSection,
      attributedChange: { sectionId: personSection, attribution },
    });
  });

  it('does not blame an unrelated sole change for a pre-existing stage issue', () => {
    const stageSection = sectionId({ kind: 'stage', stageId: 'stage-one' });
    const unrelatedSection = sectionId({
      kind: 'codebookNode',
      typeId: 'unrelated',
    });
    const currentRevision = revision(10n);

    const [issue] = attributeValidationIssues(
      [
        {
          code: 'too_small',
          path: ['stages', 0, 'label'],
          message: 'Stage label is required',
        },
      ],
      {
        stageOrder: { stages: ['stage-one'] },
        [stageSection]: {
          id: 'stage-one',
          type: 'Information',
          label: 'Existing issue owner',
          title: 'Information',
          items: [],
        },
      },
      {
        [stageSection]: remoteChange(revision(2n)),
        [unrelatedSection]: remoteChange(currentRevision),
      },
      currentRevision,
    );

    expect(issue).toMatchObject({ sectionId: stageSection });
    expect(issue).not.toHaveProperty('attributedChange');
  });

  it('does not invent a causal change when several dependencies changed', () => {
    const currentRevision = revision(8n);
    const first = sectionId({ kind: 'codebookNode', typeId: 'first' });
    const second = sectionId({ kind: 'codebookNode', typeId: 'second' });

    const [issue] = attributeValidationIssues(
      [{ code: 'custom', path: [], message: 'Protocol is invalid' }],
      {},
      {
        [first]: remoteChange(currentRevision),
        [second]: remoteChange(currentRevision),
      },
      currentRevision,
    );

    expect(issue).not.toHaveProperty('attributedChange');
  });
});
