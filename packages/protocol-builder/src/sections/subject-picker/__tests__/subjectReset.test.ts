import { describe, expect, it } from 'vitest';

import { testVariableId } from '../../../testing/testId.ts';
import {
  fitPromptsToNodeTypes,
  promptsNeedingNodeType,
  SUBJECT_INDEPENDENT_FIELDS,
  SUBJECT_INDEPENDENT_PARTS,
  subjectDependentPaths,
  subjectDependentResets,
} from '../subjectReset.ts';

const NAME = testVariableId('name');

describe('what a subject change invalidates', () => {
  /**
   * Written out rather than derived from the constant. A test that feeds the
   * list back in cannot see a member leave it — deleting `'panelTitle'`
   * removes it from both sides at once and stays green — and the point of the
   * list is that a protocol edited in Architect and a protocol edited here
   * lose and keep exactly the same things.
   */
  it("keeps what Architect keeps, named one by one, and a pedigree's words", () => {
    expect([...SUBJECT_INDEPENDENT_FIELDS]).toEqual([
      'id',
      'type',
      'label',
      'interviewScript',
      'panelTitle',
      'subject',
      'allAddedNotice',
      'maxNodesNotice',
      'minNodesNotice',
      'unnamedLabel',
      'addNamePlaceholder',
      'unplacedNodesNotice',
      'outsideAreasLabel',
      'groupsHeading',
      'attributesHeading',
      'linksHeading',
      'conditionText',
      // The Family Pedigree's words for the participant, which only schema 9
      // stages hold: prose about the task, which Architect never edits.
      'wording',
    ]);
  });

  it('keeps only what does not describe the subject', () => {
    const resets = subjectDependentResets(
      [
        'id',
        'type',
        'label',
        'interviewScript',
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
        nameAttribute: NAME,
        nameField,
      })),
    ).toEqual([{ key: 'nodeConfiguration', value: { nameField } }]);
  });

  it('removes a key whose prose it keeps is absent', () => {
    expect(
      subjectDependentResets(['nodeConfiguration'], {}, () => ({
        nameAttribute: NAME,
      })),
    ).toEqual([{ key: 'nodeConfiguration', value: undefined }]);
  });

  it('counts as lost only the parts of a key it does not keep', () => {
    expect(
      subjectDependentPaths('nodeConfiguration', {
        nameAttribute: NAME,
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

describe('fitting prompts to the node types a stage shows', () => {
  const [A, B, C] = ['type-a', 'type-b', 'type-c'];

  it('takes a removed type out of a longer order and keeps the rest', () => {
    expect(
      fitPromptsToNodeTypes(
        [{ task: 'layout', nodeTypeOrder: [C, B, A] }],
        [B],
      ),
    ).toEqual([{ task: 'layout', nodeTypeOrder: [C, A] }]);
  });

  it('puts an added type at the end of an order', () => {
    expect(
      fitPromptsToNodeTypes(
        [{ task: 'layout', nodeTypeOrder: [B, A] }],
        [],
        [C],
      ),
    ).toEqual([{ task: 'layout', nodeTypeOrder: [B, A, C] }]);
  });

  it('keeps an order that names two types after one goes and another comes', () => {
    expect(
      fitPromptsToNodeTypes(
        [{ task: 'layout', nodeTypeOrder: [B, A] }],
        [B],
        [C],
      ),
    ).toEqual([{ task: 'layout', nodeTypeOrder: [A, C] }]);
  });

  it('writes nothing when adding a type to prompts that have no order', () => {
    expect(
      fitPromptsToNodeTypes([{ task: 'layout' }], [], [C]),
    ).toBeUndefined();
  });
});

describe('the prompts that need a node type', () => {
  const [A, B] = ['type-a', 'type-b'];
  const allowsOnly =
    (pair: readonly string[]) =>
    (_edgeType: string, types: readonly string[]) =>
      pair.every((type) => types.includes(type));

  it('names a highlight prompt that highlights only the type, by position', () => {
    expect(
      promptsNeedingNodeType(
        [
          { task: 'highlight', highlight: [{ type: A }, { type: B }] },
          { task: 'highlight', highlight: [{ type: A }] },
        ],
        A,
        [B],
        () => true,
      ),
    ).toEqual({ highlight: [2], connect: [] });
  });

  it('names a connect prompt whose edge type joins none of the types left', () => {
    expect(
      promptsNeedingNodeType(
        [
          { task: 'connect', edges: { create: 'knows' } },
          { task: 'layout', edges: { display: ['knows'] } },
        ],
        A,
        [B],
        allowsOnly([A, B]),
      ),
    ).toEqual({ highlight: [], connect: [1] });
  });

  it('names no connect prompt whose edge type still joins the types left', () => {
    expect(
      promptsNeedingNodeType(
        [
          { task: 'connect', edges: { create: 'knows' } },
          { task: 'connect', edges: { create: 'likes' } },
        ],
        A,
        [B],
        (edgeType, types) => edgeType === 'knows' && types.includes(B),
      ),
    ).toEqual({ highlight: [], connect: [2] });
  });
});
