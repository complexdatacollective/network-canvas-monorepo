import { describe, expect, it } from 'vitest';

import {
  SUBJECT_INDEPENDENT_FIELDS,
  SUBJECT_INDEPENDENT_PARTS,
  subjectDependentPaths,
  subjectDependentResets,
} from '../subjectReset.ts';

describe('what a subject change invalidates', () => {
  /**
   * Written out rather than derived from the constant. A test that feeds the
   * list back in cannot see a member leave it — deleting `'introductionPanel'`
   * removes it from both sides at once and stays green — and the point of the
   * list is that a protocol edited in Architect and a protocol edited here
   * lose and keep exactly the same things.
   */
  it('keeps what Architect keeps, named one by one', () => {
    expect([...SUBJECT_INDEPENDENT_FIELDS]).toEqual([
      'id',
      'type',
      'label',
      'interviewScript',
      'introductionPanel',
      'panelTitle',
      'subject',
      'allAddedNotice',
      'externalDataError',
      'maxNodesNotice',
      'minNodesNotice',
      'quickAddHint',
      'searchFailed',
      'searchLabel',
      'searchNoMatch',
      'offlineNotice',
      'mapUnavailable',
      'outsideAreasLabel',
      'addNamePlaceholder',
      'overtakenEditNotice',
      'groupsHeading',
      'attributesHeading',
      'linksHeading',
      'tooltips',
      'keyHeading',
      'conditionText',
    ]);
  });

  it('keeps only what does not describe the subject', () => {
    const resets = subjectDependentResets(
      [
        'id',
        'type',
        'label',
        'interviewScript',
        'introductionPanel',
        'subject',
        'prompts',
        'form',
        'panels',
      ],
      {},
    );

    expect(resets.map((reset) => reset.key)).toEqual([
      'form',
      'panels',
      'prompts',
    ]);
  });

  it('names a key only the interface template knows about', () => {
    const resets = subjectDependentResets(['prompts'], {
      behaviours: { removeAfterConsideration: true },
    });

    expect(resets).toEqual([
      { key: 'behaviours', value: { removeAfterConsideration: true } },
      { key: 'prompts', value: undefined },
    ]);
  });

  /**
   * A capability the researcher has never opened contributes nothing to the
   * form's values while still holding configuration that belongs to the old
   * subject. Reading only the form would leave it in the saved stage.
   */
  it('names a key the form has but the draft does not, and the reverse', () => {
    const resets = subjectDependentResets(['panels', 'quickAdd'], {});

    expect(resets.map((reset) => reset.key)).toEqual(['panels', 'quickAdd']);
  });

  it('keeps prose inside a key that describes the subject', () => {
    expect(SUBJECT_INDEPENDENT_PARTS).toEqual({
      nodeConfiguration: ['nameField'],
    });
    const nameField = { prompt: { en: 'Name' } };

    expect(
      subjectDependentResets(['nodeConfiguration'], {}, () => ({
        nameAttribute: 'name',
        nameField,
      })),
    ).toEqual([{ key: 'nodeConfiguration', value: { nameField } }]);
  });

  it('removes a key whose prose it keeps is absent', () => {
    expect(
      subjectDependentResets(['nodeConfiguration'], {}, () => ({
        nameAttribute: 'name',
      })),
    ).toEqual([{ key: 'nodeConfiguration', value: undefined }]);
  });

  it('counts as lost only the parts of a key it does not keep', () => {
    expect(
      subjectDependentPaths('nodeConfiguration', {
        nameAttribute: 'name',
        nameField: { prompt: { en: 'Name' } },
      }),
    ).toEqual(['nodeConfiguration.nameAttribute']);
    expect(
      subjectDependentPaths('nodeConfiguration', {
        nameField: { prompt: { en: 'Name' } },
      }),
    ).toEqual([]);
    expect(subjectDependentPaths('prompts', [])).toEqual(['prompts']);
  });
});
