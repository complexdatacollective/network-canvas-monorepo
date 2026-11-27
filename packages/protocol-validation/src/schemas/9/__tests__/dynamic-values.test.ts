import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { interfaceTextFor } from '../../../__tests__/suppliedWording.ts';
import {
  testId,
  testTypeId,
  testVariableId,
  withTestIds,
} from '../../../__tests__/testIds.ts';
import { fieldBlockMarkdown } from '../../../localization/fieldBlock.ts';
import type { MessageArguments } from '../../../localization/messageArguments.ts';
import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import {
  dynamicValueContextFor,
  stageDynamicValueContext,
} from '../dynamic-value-validation.ts';
import {
  type AttributeDynamicValueRole,
  dynamicValueArgumentsAt,
  dynamicValueNameFor,
  type LabelledDynamicValueRole,
  optionCaseKey,
} from '../dynamic-values.ts';
import {
  getLocalizedStringDescriptor,
  localizedMessage,
} from '../localized-string.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

type Protocol = ReturnType<typeof completeProtocol>;
type Stage = Record<string, unknown>;

// A stage by the readable id the fixture gives it, before or after
// `withTestIds` makes that id a UUID.
const isStage = (stage: Stage, id: string) =>
  stage.id === id || stage.id === testId(id);

const stageIn = (protocol: Protocol, id: string): Stage => {
  const stage = (protocol.stages as Stage[]).find((candidate) =>
    isStage(candidate, id),
  );
  if (stage === undefined) throw new Error(`No stage "${id}"`);
  return stage;
};

/** The complete protocol with one stage edited. */
const editing = (id: string, edit: (stage: Stage) => void) => {
  const protocol = completeProtocol();
  edit(stageIn(protocol, id));
  return withTestIds(protocol);
};

const issuesOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
};

const stageIndex = (protocol: Protocol, id: string) =>
  (protocol.stages as Stage[]).findIndex((stage) => isStage(stage, id));

// Text names an attribute by the id `withTestIds` gives the fixture's
// readable key, so it names it the same before and after.
const attribute = (role: AttributeDynamicValueRole, key: string) =>
  dynamicValueNameFor({
    kind: 'attribute',
    role,
    variableId: testVariableId(key),
  });

const labelOf = (role: LabelledDynamicValueRole) =>
  dynamicValueNameFor({ kind: 'label', role });

const IS_PARTICIPANT = dynamicValueNameFor({
  kind: 'participant',
  role: 'node',
});

// The case key of an option the fixture writes without an id: `withTestIds`
// gives it `testId` of its place in the codebook as written.
const optionKey = (
  entity: 'node' | 'edge',
  type: string,
  variable: string,
  index: number,
) =>
  optionCaseKey(
    testId(
      JSON.stringify([
        'codebook',
        entity,
        type,
        'variables',
        variable,
        'options',
        index,
      ]),
    ),
  );

const EGO_NAME = attribute('ego', 'egoName');
const EGO_AGE = attribute('ego', 'egoAge');
const NICKNAME = attribute('node', 'nickname');
const CATEGORY = attribute('node', 'category');
const FLAG = attribute('node', 'flag');
const FRIEND = optionKey('node', 'person', 'category', 0);
const FAMILY = optionKey('node', 'person', 'category', 1);

const guarded = (name: string) =>
  `{${name}, select, missing {Tell us about them.} other {Tell us about {${name}}.}}`;

/** The block that places the fixture forms' one field (`field-1`). */
const FIELD = fieldBlockMarkdown('field-1');

/**
 * A form's text: `text`, then the form's field, unless `text` places it
 * itself.
 */
const formText = (text: string) =>
  text.includes(FIELD) ? text : `${text}\n\n${FIELD}`;

/** An alter form whose text is `text`, with its one field. */
const askingInAlterForm = (text: string) =>
  editing('alterForm', (stage) => {
    stage.form = {
      content: { en: formText(text) },
      fields: [
        { id: 'field-1', variable: 'nickname', prompt: { en: 'Nickname?' } },
      ],
    };
  });

const NOTHING =
  'it does not refer to an attribute, a node’s label, a condition or today’s date';

describe('dynamic values in stage text', () => {
  it('accepts the complete protocol, which shows no values', () => {
    expect(issuesOf(withTestIds(completeProtocol()))).toEqual([]);
  });

  it('accepts an ego value guarded by a missing version on an Information screen', () => {
    const protocol = editing('information', (stage) => {
      stage.content = { en: guarded(EGO_NAME) };
    });
    expect(issuesOf(protocol)).toEqual([]);
  });

  it('shows a value that can be missing anywhere, since a missing value shows nothing', () => {
    const protocol = editing('information', (stage) => {
      stage.content = { en: `Hello {${EGO_NAME}}` };
    });
    expect(issuesOf(protocol)).toEqual([]);
  });

  it('refuses a choice by answer without a missing version, which is no logic block', () => {
    const protocol = editing('information', (stage) => {
      stage.content = {
        en: `{${EGO_NAME}, select, other {Hi {${EGO_NAME}}}}`,
      };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('is not a logic block'),
      }),
    ]);
  });

  it('needs no missing version for a value every host guarantees', () => {
    const protocol = editing('information', (stage) => {
      stage.content = { en: 'Since {now}' };
    });
    expect(issuesOf(protocol)).toEqual([]);
  });

  it.each([
    'interview_id',
    'protocol_hash',
    'stage_id',
    'someone',
    'ego',
    `ego_`,
    'ego_label',
    'edge_label',
    'ego_isParticipant',
    `edgeFrom_${testVariableId('nickname').replaceAll('-', '_')}`,
    'condition_',
  ])('refuses %s, which refers to nothing', (name) => {
    const protocol = editing('information', (stage) => {
      stage.content = { en: guarded(name) };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      {
        path: `stages.${index}.content.en`,
        message: `This wording cannot use "${name}": ${NOTHING}.`,
      },
    ]);
  });

  it('refuses an attribute that does not exist, once, where the text names it', () => {
    const gone = attribute('ego', 'deleted');
    const protocol = editing('information', (stage) => {
      stage.content = { en: guarded(gone) };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      {
        path: `stages.${index}.content.en`,
        message: 'This wording refers to an attribute that no longer exists.',
      },
    ]);
  });

  it('refuses a condition that does not exist', () => {
    const name = dynamicValueNameFor({
      kind: 'condition',
      conditionId: testId('no such condition'),
    });
    const protocol = editing('information', (stage) => {
      stage.content = {
        en: `{${name}, select, true {Yes.} other {No.}}`,
      };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: 'This wording has a logic block whose rules no longer exist.',
      }),
    ]);
  });

  it('refuses text that is blank in every version', () => {
    const protocol = editing('information', (stage) => {
      stage.content = { en: `{${EGO_NAME}, select, missing {} other {}}` };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        path: `stages.${index}.content.en`,
        message: expect.stringContaining('blank in every version'),
      }),
    ]);
  });

  it('refuses text whose only words are in a plural version its language never chooses', () => {
    const protocol = editing('information', (stage) => {
      stage.content = {
        en: `{${EGO_AGE}, select, missing {} other {{${EGO_AGE}, plural, few {Some} other {}}}}`,
      };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        path: `stages.${index}.content.en`,
        message: expect.stringContaining('blank in every version'),
      }),
    ]);
  });

  it('refuses text holding the marker the interview places values with', () => {
    const protocol = editing('information', (stage) => {
      stage.content = { en: 'Hello \uE000' };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('U+E000'),
      }),
    ]);
  });

  it('keeps sites outside the field boundary literal', () => {
    const protocol = editing('information', (stage) => {
      stage.label = { en: guarded(EGO_NAME) };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('cannot contain placeholders'),
      }),
    ]);
  });

  describe('cases', () => {
    it('lets a categorical value choose a version by the id of an option', () => {
      // `category` is not asked in this form, so it can already have a value.
      expect(
        issuesOf(
          askingInAlterForm(
            `{${CATEGORY}, select, missing {Their name?} ${FRIEND} {Your friend’s name?} other {Their name?}}`,
          ),
        ),
      ).toEqual([]);
    });

    it('refuses a case that is not an option of the attribute', () => {
      const strong = optionKey('node', 'person', 'strength', 1);
      for (const key of ['friend', strong]) {
        expect(
          issuesOf(
            askingInAlterForm(
              `{${CATEGORY}, select, missing {Them?} ${key} {Your friend?} other {Them?}}`,
            ),
          ),
        ).toEqual([
          expect.objectContaining({
            message:
              'This wording chooses between versions by the "Category" attribute of the node this stage is about, but one of its versions is for an option that no longer exists.',
          }),
        ]);
      }
    });

    it('refuses cases on a value without options', () => {
      expect(
        issuesOf(
          askingInAlterForm(
            `{${NICKNAME}, select, missing {Them?} bob {Bob?} other {{${NICKNAME}}?}}`,
          ),
        ),
      ).toEqual([
        expect.objectContaining({
          message:
            'This wording chooses between versions by each answer of the "Nickname" attribute of the node this stage is about, but only a categorical, ordinal or yes/no attribute can have a different version for each answer.',
        }),
      ]);
    });

    it('reads "other" only for an option the text gives no version for', () => {
      // With a version for every option, an answer always chooses one of
      // them, so words only in "other" are never shown.
      const everyOption = `{${CATEGORY}, select, missing {} ${FRIEND} {} ${FAMILY} {} other {${FIELD}}}`;
      expect(issuesOf(askingInAlterForm(everyOption))).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('blank in every version'),
        }),
      ]);
      // With a version for only some, the others read "other".
      const someOptions = `{${CATEGORY}, select, missing {} ${FRIEND} {} other {${FIELD}}}`;
      expect(issuesOf(askingInAlterForm(someOptions))).toEqual([]);
    });
  });

  describe('yes/no attributes', () => {
    type Variables = Record<string, Record<string, unknown>>;
    const personVariables = (protocol: Protocol): Variables =>
      (protocol.codebook.node as Record<string, { variables: Variables }>)[
        testTypeId('person')
      ]!.variables;
    const UNLABELLED = `The "Flag" attribute of the node this stage is about cannot be shown as words. "Flag" is a yes/no attribute without labels for both of its answers. Add a label for yes and for no to "Flag", or give the wording a different version for each answer.`;

    it('shows a yes/no attribute with a label for each answer', () => {
      expect(issuesOf(askingInAlterForm(guarded(FLAG)))).toEqual([]);
    });

    it('refuses text whose words are only in the version no answer reaches', () => {
      const protocol = askingInAlterForm(
        `{${FLAG}, select, missing {} true {} false {} other {${FIELD}}}`,
      );
      const index = stageIndex(protocol, 'alterForm');
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          path: `stages.${index}.form.content.en`,
          message: expect.stringContaining('blank in every version'),
        }),
      ]);
      // With a version for only one answer, the other answer reads `other`.
      expect(
        issuesOf(
          askingInAlterForm(
            `{${FLAG}, select, missing {} true {} other {${FIELD}}}`,
          ),
        ),
      ).toEqual([]);
    });

    it('refuses a case other than true or false', () => {
      expect(
        issuesOf(
          askingInAlterForm(
            `{${FLAG}, select, missing {Anything else?} yes {Tell us why.} other {Anything else?}}`,
          ),
        ),
      ).toEqual([
        expect.objectContaining({
          message:
            'This wording chooses between versions by the "Flag" attribute of the node this stage is about, but one of its versions is neither for yes nor for no.',
        }),
      ]);
    });

    it('refuses to show a yes/no attribute without labels as words', () => {
      const protocol = askingInAlterForm(guarded(FLAG));
      delete personVariables(protocol)[testVariableId('flag')]!.options;
      const index = stageIndex(protocol, 'alterForm');
      expect(issuesOf(protocol)).toEqual([
        {
          path: `stages.${index}.form.content.en`,
          message: UNLABELLED,
        },
      ]);
    });

    it('refuses a yes/no attribute with a label for only one answer', () => {
      const protocol = askingInAlterForm(guarded(FLAG));
      const flag = personVariables(protocol)[testVariableId('flag')]!;
      flag.options = (flag.options as { value: boolean }[]).filter(
        (option) => option.value,
      );
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({ message: UNLABELLED }),
      ]);
    });

    it('lets text choose its wording by a Toggle, which has no labels, but not show it', () => {
      const byAnswer = askingInAlterForm(
        `{${FLAG}, select, missing {Anything else?} true {Tell us why.} other {Anything else?}}`,
      );
      const flag = personVariables(byAnswer)[testVariableId('flag')]!;
      flag.component = 'Toggle';
      delete flag.options;
      expect(issuesOf(byAnswer)).toEqual([]);

      const shown = askingInAlterForm(guarded(FLAG));
      const toggle = personVariables(shown)[testVariableId('flag')]!;
      toggle.component = 'Toggle';
      delete toggle.options;
      expect(issuesOf(shown)).toEqual([
        expect.objectContaining({ message: UNLABELLED }),
      ]);
    });
  });

  describe('where values are available', () => {
    // The names, among `names`, that a site's text can use.
    const argumentsAt = (
      protocol: Protocol,
      id: string,
      sitePath: (string | number)[],
      site: 'stageText' | 'prompt' | 'formField',
      names: readonly string[],
    ) => {
      const stage = stageIn(protocol, id);
      return Object.keys(
        dynamicValueArgumentsAt(
          names.map((name) => `{${name}}`).join(' '),
          dynamicValueContextFor({
            codebook: protocol.codebook,
            stage,
            sitePath,
            site,
          }),
        ),
      );
    };

    const YOU = EGO_NAME;
    const THEM = NICKNAME;
    const FIRST = attribute('dyadSource', 'nickname');
    const SECOND = attribute('dyadTarget', 'nickname');
    const FOCAL = attribute('focal', 'nickname');
    const TIE = attribute('edge', 'note');
    const ALL_ROLES = [YOU, THEM, FIRST, SECOND, FOCAL, TIE, 'now'];

    const unedited = (id: string) => editing(id, () => undefined);
    const promptNames = (id: string, names = ALL_ROLES) =>
      argumentsAt(unedited(id), id, ['prompts', 0, 'text'], 'prompt', names);

    it('offers the participant and the interview on every stage', () => {
      expect(promptNames('sociogram')).toEqual([YOU, 'now']);
    });

    it('offers no one person on an interface that shows many', () => {
      for (const id of [
        'sociogram',
        'ordinalBin',
        'categoricalBin',
        'nameGenerator',
      ]) {
        expect(promptNames(id)).toEqual([YOU, 'now']);
      }
    });

    it('offers the pair to a Dyad Census and Tie Strength Census prompt', () => {
      for (const id of ['dyadCensus', 'tieStrength']) {
        expect(promptNames(id)).toEqual([YOU, FIRST, SECOND, 'now']);
      }
    });

    it('offers only the focal person to a one-to-many census prompt', () => {
      expect(promptNames('oneToMany')).toEqual([YOU, FOCAL, 'now']);
    });

    it('offers a form field every attribute of the node it asks about', () => {
      const names = [NICKNAME, attribute('node', 'name'), CATEGORY, TIE];
      const protocol = editing('alterForm', (stage) => {
        stage.form = {
          fields: [
            {
              id: 'field-1',
              variable: 'nickname',
              prompt: { en: 'Nickname?' },
            },
            { id: 'field-2', variable: 'name', prompt: { en: 'Name?' } },
            {
              id: 'field-3',
              variable: 'strength',
              prompt: { en: 'Strength?' },
            },
          ],
        };
      });
      for (const index of [0, 1, 2]) {
        expect(
          argumentsAt(
            protocol,
            'alterForm',
            ['form', 'fields', index, 'prompt'],
            'formField',
            names,
          ),
        ).toEqual(names.slice(0, 3));
      }
    });

    it('offers an ego form field every attribute of the participant', () => {
      const protocol = editing('egoForm', (stage) => {
        stage.form = {
          fields: [
            { id: 'field-1', variable: 'egoName', prompt: { en: 'Name?' } },
            { id: 'field-2', variable: 'egoAge', prompt: { en: 'Age?' } },
          ],
        };
      });
      for (const index of [0, 1]) {
        expect(
          argumentsAt(
            protocol,
            'egoForm',
            ['form', 'fields', index, 'prompt'],
            'formField',
            [EGO_NAME, EGO_AGE],
          ),
        ).toEqual([EGO_NAME, EGO_AGE]);
      }
    });

    it('offers an edge form the edge, and a Network Composer edge type form only the participant', () => {
      const fieldOf = (
        id: string,
        sitePath: (string | number)[],
        names = ALL_ROLES,
      ) => argumentsAt(unedited(id), id, sitePath, 'formField', names);
      expect(fieldOf('alterEdgeForm', ['form', 'fields', 0, 'prompt'])).toEqual(
        [YOU, TIE, 'now'],
      );
      const tieStrength = attribute('edge', 'tieStrength');
      expect(
        fieldOf(
          'alterEdgeForm',
          ['form', 'fields', 0, 'prompt'],
          [tieStrength],
        ),
      ).toEqual([tieStrength]);
      expect(fieldOf('composer', ['nodeForm', 'fields', 0, 'label'])).toEqual([
        YOU,
        THEM,
        'now',
      ]);
      expect(
        fieldOf('composer', ['edges', 0, 'form', 'fields', 0, 'label']),
      ).toEqual([YOU, 'now']);
    });

    describe('node labels', () => {
      const NODE_LABEL = labelOf('node');
      const FIRST_LABEL = labelOf('dyadSource');
      const SECOND_LABEL = labelOf('dyadTarget');
      const FOCAL_LABEL = labelOf('focal');
      const FROM_LABEL = labelOf('edgeFrom');
      const TO_LABEL = labelOf('edgeTo');
      const LABELS = [
        NODE_LABEL,
        FIRST_LABEL,
        SECOND_LABEL,
        FOCAL_LABEL,
        FROM_LABEL,
        TO_LABEL,
        THEM,
      ];
      const promptOf = (id: string) => promptNames(id, LABELS);

      it('offers the label of each node a prompt is about', () => {
        expect(promptOf('dyadCensus')).toEqual([FIRST_LABEL, SECOND_LABEL]);
        expect(promptOf('tieStrength')).toEqual([FIRST_LABEL, SECOND_LABEL]);
        expect(promptOf('oneToMany')).toEqual([FOCAL_LABEL]);
        expect(promptOf('geospatial')).toEqual([NODE_LABEL, THEM]);
        for (const id of ['sociogram', 'ordinalBin', 'categoricalBin']) {
          expect(promptOf(id)).toEqual([]);
        }
      });

      it('offers a bin prompt in select mode the node being placed', () => {
        for (const id of ['ordinalBin', 'categoricalBin']) {
          const protocol = editing(id, (stage) => {
            stage.behaviours = { interactionMode: 'select' };
          });
          expect(
            argumentsAt(protocol, id, ['prompts', 0, 'text'], 'prompt', LABELS),
          ).toEqual([NODE_LABEL, THEM]);
        }
        const dragging = editing('ordinalBin', (stage) => {
          stage.behaviours = { interactionMode: 'drag' };
        });
        expect(
          argumentsAt(
            dragging,
            'ordinalBin',
            ['prompts', 0, 'text'],
            'prompt',
            LABELS,
          ),
        ).toEqual([]);
      });

      it('shows the label of the node a bin is placing, which shows nothing once every node is placed', () => {
        const protocol = editing('ordinalBin', (stage) => {
          stage.behaviours = { interactionMode: 'select' };
          (stage.prompts as Stage[])[0]!.text = {
            en: `How close is {${NODE_LABEL}}?`,
          };
        });
        expect(issuesOf(protocol)).toEqual([]);
      });

      it('keeps the node a bin is placing out of the "other" bin\'s label', () => {
        const edited = editing('categoricalBin', (stage) => {
          stage.behaviours = { interactionMode: 'select' };
          (stage.prompts as Stage[])[0]!.otherOptionLabel = {
            en: `Not like {${NODE_LABEL}}`,
          };
        });
        // Placing by tapping also shows the bin's Place here button.
        const protocol = {
          ...edited,
          interfaceText: interfaceTextFor(edited),
        };
        expect(issuesOf(protocol)).toEqual([
          expect.objectContaining({
            message:
              'This wording cannot use the label of the node this stage is about, because the wording does not refer to that node.',
          }),
        ]);
      });

      it('offers the node a form is about by its label', () => {
        expect(
          argumentsAt(
            unedited('alterForm'),
            'alterForm',
            ['form', 'fields', 0, 'prompt'],
            'formField',
            LABELS,
          ),
        ).toEqual([NODE_LABEL, THEM]);
        expect(
          argumentsAt(
            unedited('composer'),
            'composer',
            ['nodeForm', 'fields', 0, 'label'],
            'formField',
            LABELS,
          ),
        ).toEqual([NODE_LABEL, THEM]);
      });

      it('offers the question about a node put in the "other" bin that node, but not the bin\'s label', () => {
        const protocol = unedited('categoricalBin');
        expect(
          argumentsAt(
            protocol,
            'categoricalBin',
            ['prompts', 0, 'otherVariablePrompt'],
            'formField',
            LABELS,
          ),
        ).toEqual([NODE_LABEL, THEM]);
        const misplaced = editing('categoricalBin', (stage) => {
          (stage.prompts as Stage[])[0]!.otherOptionLabel = {
            en: `Not {${NODE_LABEL}}`,
          };
        });
        expect(issuesOf(misplaced)).toEqual([
          expect.objectContaining({
            message: expect.stringContaining(
              'This wording cannot use the label of the node this stage is about, because the wording does not refer to that node.',
            ),
          }),
        ]);
      });

      it('offers an edge form both ends of its edge by label alone', () => {
        expect(
          argumentsAt(
            unedited('alterEdgeForm'),
            'alterEdgeForm',
            ['form', 'fields', 0, 'prompt'],
            'formField',
            LABELS,
          ),
        ).toEqual([FROM_LABEL, TO_LABEL]);
        expect(
          argumentsAt(
            unedited('composer'),
            'composer',
            ['edges', 0, 'form', 'fields', 0, 'label'],
            'formField',
            LABELS,
          ),
        ).toEqual([FROM_LABEL, TO_LABEL]);
      });

      it("names every label the stage's text can show, edge type forms included", () => {
        const protocol = unedited('composer');
        const shown = Object.keys(
          dynamicValueArgumentsAt(
            LABELS.slice(0, -1)
              .map((name) => `{${name}}`)
              .join(' '),
            stageDynamicValueContext({
              codebook: protocol.codebook,
              stage: stageIn(protocol, 'composer'),
            }),
          ),
        );
        expect(shown).toEqual([NODE_LABEL, FROM_LABEL, TO_LABEL]);
      });

      it('needs no missing version for a label, which is never missing', () => {
        const protocol = editing('dyadCensus', (stage) => {
          (stage.prompts as Stage[])[0]!.text = {
            en: `Do {${FIRST_LABEL}} and {${SECOND_LABEL}} know each other?`,
          };
        });
        expect(issuesOf(protocol)).toEqual([]);
      });

      it('refuses cases on a label', () => {
        const protocol = askingInAlterForm(
          `{${NODE_LABEL}, select, missing {Who?} bob {Is it Bob?} other {Who is it?}}`,
        );
        expect(issuesOf(protocol)).toEqual([
          expect.objectContaining({
            message:
              'This wording chooses between versions by each value of the label of the node this stage is about, but only a categorical, ordinal or yes/no attribute can have a different version for each answer.',
          }),
        ]);
      });

      it('refuses a choice inside a sentence', () => {
        const protocol = editing('dyadCensus', (stage) => {
          (stage.prompts as Stage[])[0]!.text = {
            en: `Do they know {${FIRST_LABEL}, select, missing {} other {{${FIRST_LABEL}}}}?`,
          };
        });
        expect(issuesOf(protocol)).toEqual([
          expect.objectContaining({
            message:
              'This wording chooses between versions inside a sentence. Use a dynamic attribute instead.',
          }),
        ]);
      });
    });

    describe('whether the node is the participant', () => {
      const choosing = `{${IS_PARTICIPANT}, select, true {What year were you born?} other {What year were they born?}}`;
      const personForm = (text: string) =>
        editing('familyPedigree', (stage) => {
          (stage.form as { content: unknown }).content = {
            en: formText(text),
          };
        });

      it("lets a Family Pedigree's person form choose its wording by it", () => {
        const protocol = personForm(choosing);
        expect(issuesOf(protocol)).toEqual([]);
        expect(
          argumentsAt(
            protocol,
            'familyPedigree',
            ['form', 'content'],
            'formField',
            [IS_PARTICIPANT],
          ),
        ).toEqual([IS_PARTICIPANT]);
      });

      it('needs no missing version, since it is never missing, and is written with one version for the participant and one for anyone else', () => {
        expect(
          issuesOf(
            personForm(
              `{${IS_PARTICIPANT}, select, true {Your birth year?} other {Their birth year?}}`,
            ),
          ),
        ).toEqual([]);
        expect(
          issuesOf(
            personForm(
              `{${IS_PARTICIPANT}, select, true {} false {} other {Never shown.}}`,
            ),
          ),
        ).toEqual([
          expect.objectContaining({
            message: expect.stringContaining('is not a logic block'),
          }),
        ]);
      });

      it('refuses to show it as words', () => {
        expect(
          issuesOf(personForm(`Participant: {${IS_PARTICIPANT}}`)),
        ).toEqual([
          expect.objectContaining({
            message:
              'Whether the node is the participant cannot be shown as words. It chooses which version of the wording is shown. Give the wording a version for the participant and a version for everyone else.',
          }),
        ]);
      });

      it('is not offered on any other node form, or outside the person form', () => {
        const alterForm = askingInAlterForm(choosing);
        expect(issuesOf(alterForm)).toEqual([
          expect.objectContaining({
            message: expect.stringContaining(
              'known only in the questions of a Family Pedigree',
            ),
          }),
        ]);
        expect(
          argumentsAt(
            unedited('familyPedigree'),
            'familyPedigree',
            ['nominationPrompts', 0, 'text'],
            'prompt',
            [IS_PARTICIPANT],
          ),
        ).toEqual([]);
      });

      it('refuses any case but true and false', () => {
        const protocol = personForm(
          `{${IS_PARTICIPANT}, select, participant {You?} other {Them?}}`,
        );
        expect(issuesOf(protocol)).toEqual([
          expect.objectContaining({
            path:
              'stages.' +
              String(stageIndex(protocol, 'familyPedigree')) +
              '.form.content.en',
            message: expect.stringContaining('is not a logic block'),
          }),
        ]);
      });
    });

    it('reports a value used where it is not available', () => {
      const protocol = editing('sociogram', (stage) => {
        (stage.prompts as Stage[])[0]!.text = {
          en: `Tell us about {${THEM}}.`,
        };
      });
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          message:
            'This wording cannot use the "Nickname" attribute of the node this stage is about, because the wording does not refer to that node.',
        }),
      ]);
    });

    it('refuses an encrypted attribute', () => {
      const secret = attribute('node', 'name');
      const protocol = askingInAlterForm(guarded(secret));
      const person = (
        protocol.codebook.node as Record<
          string,
          { variables: Record<string, Record<string, unknown>> }
        >
      )[testTypeId('person')]!;
      person.variables[testVariableId('name')]!.encrypted = true;
      expect(issuesOf(protocol)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message:
              'This wording cannot use the "Name" attribute of the node this stage is about, because the attribute is encrypted.',
          }),
        ]),
      );
    });
  });

  describe('translations', () => {
    const twoLanguages = (titles: Record<string, string>) => {
      const protocol = editing('information', (stage) => {
        stage.content = titles;
      });
      return {
        ...protocol,
        localization: {
          defaultLocale: 'en',
          locales: ['en', 'ar', 'de', 'fr', 'ru'],
        },
      };
    };

    const contentIssues = (titles: Record<string, string>) =>
      issuesOf(twoLanguages(titles)).filter((issue) =>
        issue.path.includes('content'),
      );

    it('accepts a translation showing what the default-language text shows', () => {
      expect(
        contentIssues({
          en: guarded(EGO_NAME),
          fr: `{${EGO_NAME}, select, missing {Parlez-nous d’eux.} other {Parlez-nous de {${EGO_NAME}}.}}`,
        }),
      ).toEqual([]);
    });

    it('accepts a translation that leaves out a value the default-language text shows', () => {
      // Piped values are optional: a translation may word the text without
      // them, in some version or in all of them.
      expect(
        contentIssues({
          en: guarded(EGO_NAME),
          fr: `{${EGO_NAME}, select, missing {Parlez-nous d’eux.} other {Parlez-nous de cette personne.}}`,
        }),
      ).toEqual([]);
      expect(
        contentIssues({ en: guarded(EGO_NAME), fr: 'Parlez-nous d’eux.' }),
      ).toEqual([]);
    });

    it('accepts a number left out of every plural version of a translation', () => {
      const count = EGO_AGE;
      expect(
        contentIssues({
          en: `{${count}, select, missing {Some years.} other {{${count}, plural, one {# year.} other {# years.}}}}`,
          de: 'Einige Jahre.',
          ru: `{${count}, select, missing {Годы.} other {{${count}, plural, one {Один год.} few {Несколько лет.} many {Много лет.} other {Несколько лет.}}}}`,
          ar: `{${count}, select, missing {Some years.} other {{${count}, plural, zero {No years.} other {Some years.}}}}`,
        }),
      ).toEqual([]);
    });

    it('accepts text that shows a value only in a translation', () => {
      expect(
        contentIssues({
          en: 'Tell us about them.',
          fr: guarded(EGO_NAME),
        }),
      ).toEqual([]);
    });

    it('still checks each translation on its own', () => {
      // A choice of versions inside a sentence.
      expect(
        contentIssues({
          en: guarded(EGO_NAME),
          fr: `Parlez-nous {${EGO_NAME}, select, missing {d’eux} other {de {${EGO_NAME}}}}.`,
        }),
      ).toEqual([
        expect.objectContaining({
          path: expect.stringMatching(/content\.fr$/),
          message:
            'This wording chooses between versions inside a sentence. Use a dynamic attribute instead.',
        }),
      ]);
      // A name that refers to nothing.
      expect(
        contentIssues({ en: guarded(EGO_NAME), fr: 'Parlez-nous de {other}.' }),
      ).toEqual([
        expect.objectContaining({
          path: expect.stringMatching(/content\.fr$/),
        }),
      ]);
    });
  });

  describe('a required argument declared by a field', () => {
    const NAMED: MessageArguments = {
      name: { kind: 'text', required: [{}] },
    };
    const field = localizedMessage(z.string(), { arguments: NAMED });
    const issuesIn = (value: Record<string, string>) => {
      const result = field.safeParse(value);
      return result.success
        ? []
        : result.error.issues.map((issue) => issue.path.join('.'));
    };

    it('is enforced alike in the default language and in every translation', () => {
      expect(issuesIn({ en: 'Add parents for {name}' })).toEqual([]);
      expect(issuesIn({ en: 'Add parents' })).toEqual(['en']);
      expect(
        issuesIn({ en: 'Add parents', fr: 'Ajoutez des parents' }),
      ).toEqual(['en', 'fr']);
    });

    it('does not depend on what the default-language text shows', () => {
      expect(
        issuesIn({ en: 'Add parents for {name}', fr: 'Ajoutez des parents' }),
      ).toEqual(['fr']);
      expect(
        issuesIn({
          en: 'Add parents for {name}',
          fr: 'Ajoutez les parents de {name}',
        }),
      ).toEqual([]);
    });
  });

  describe('reference collection', () => {
    it('counts each attribute text names as a use of it, with the options it gives versions for', () => {
      const protocol = askingInAlterForm(
        `${guarded(EGO_NAME)} {${CATEGORY}, select, ${FRIEND} {Friend} other {{now}}}`,
      );
      const index = stageIndex(protocol, 'alterForm');
      const path = ['stages', index, 'form', 'content', 'en'];
      const hits = collectEntityAttributeReferences(protocol).filter(
        (hit) => hit.inMessage !== undefined,
      );
      expect(hits).toEqual([
        {
          path,
          variableId: testVariableId('egoName'),
          subject: { entity: 'ego' },
          existence: 'unchecked',
          inMessage: { name: EGO_NAME, optionIds: [] },
        },
        {
          path,
          variableId: testVariableId('category'),
          subject: { entity: 'node', type: testTypeId('person') },
          existence: 'unchecked',
          inMessage: {
            name: CATEGORY,
            optionIds: [
              testId(
                JSON.stringify([
                  'codebook',
                  'node',
                  'person',
                  'variables',
                  'category',
                  'options',
                  0,
                ]),
              ),
            ],
          },
        },
      ]);
    });

    it('counts a label, a condition or today’s date as a use of no attribute', () => {
      const protocol = askingInAlterForm(
        `{${labelOf('node')}} {now} {${dynamicValueNameFor({ kind: 'condition', conditionId: testId('c') })}, select, true {Yes} other {No}}`,
      );
      expect(
        collectEntityAttributeReferences(protocol).filter(
          (hit) => hit.inMessage !== undefined,
        ),
      ).toEqual([]);
    });
  });

  it('tags exactly the inventoried stage sites, and none outside stages', () => {
    // Read from the schema itself, through every optional field and union
    // variant, so a site the complete protocol happens not to fill (a hint,
    // a scale's labels) is inventoried too.
    const allSites = schemaDynamicValueSites();
    // The sites outside stages are a node type's own label, which shows
    // values about the node it is on, and the wording of its dynamic
    // attributes (`findNodeLabelProblems`).
    const sites = allSites.filter((site) => site.startsWith('stages '));
    expect(allSites.filter((site) => !site.startsWith('stages '))).toEqual([
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.answers.#.wording dynamicAttribute',
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.cases.#.wording dynamicAttribute',
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.missing dynamicAttribute',
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.other dynamicAttribute',
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.otherwise dynamicAttribute',
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.participant dynamicAttribute',
      'codebook.node.*.dynamicLabel.dynamicAttributes.*.wording dynamicAttribute',
      'codebook.node.*.dynamicLabel.text nodeLabel',
    ]);
    const inventory = sites.map((site) => site.slice('stages '.length));
    // What the walk of a document tags is a part of that inventory.
    const collected = collectLocalizedStrings(completeProtocol())
      .filter(
        (hit) => hit.dynamicValues !== undefined && hit.path[0] === 'stages',
      )
      .map((hit) => {
        const [, index, ...rest] = hit.path;
        const stage = (completeProtocol().stages as Stage[])[index as number];
        return `${String(stage?.type)} ${rest.map((step) => (typeof step === 'number' ? '#' : step)).join('.')} ${hit.dynamicValues}`;
      });
    expect(collected.filter((site) => !inventory.includes(site))).toEqual([]);
    expect(inventory).toMatchSnapshot();
  });
});

// Wrappers whose inner schema holds the same paths as the wrapper.
const unwrapSchema = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    if (getLocalizedStringDescriptor(current)) return current;
    let inner: unknown;
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault ||
      current instanceof z.ZodPrefault ||
      current instanceof z.ZodNonOptional ||
      current instanceof z.ZodReadonly ||
      current instanceof z.ZodCatch
    ) {
      inner = current.def.innerType;
    } else if (current instanceof z.ZodLazy) {
      inner = current.def.getter();
    } else if (current instanceof z.ZodPipe) {
      inner = current.in;
    }
    if (!(inner instanceof z.ZodType)) return current;
    current = inner;
  }
};

/**
 * Every site in the protocol schema that may show dynamic values, as
 * "<first path step> <stage type> <path within the stage> <site kind>" for
 * sites under `stages`, with `#` for any array index and `*` for any record
 * key.
 */
const schemaDynamicValueSites = (): string[] => {
  const found = new Set<string>();
  const visit = (
    schema: z.ZodType,
    path: readonly string[],
    stageType: string | undefined,
    ancestors: ReadonlySet<z.ZodType>,
  ) => {
    const node = unwrapSchema(schema);
    if (ancestors.has(node)) return;
    const descriptor = getLocalizedStringDescriptor(node);
    if (descriptor !== undefined) {
      if (descriptor.dynamicValues === undefined) return;
      const [root, , ...rest] = path;
      found.add(
        root === 'stages'
          ? `stages ${String(stageType)} ${rest.join('.')} ${descriptor.dynamicValues}`
          : `${path.join('.')} ${descriptor.dynamicValues}`,
      );
      return;
    }
    const within = new Set(ancestors).add(node);
    if (node instanceof z.ZodObject) {
      let ownType = stageType;
      const type: unknown = node.shape.type;
      if (
        path.length === 2 &&
        path[0] === 'stages' &&
        type instanceof z.ZodType
      ) {
        const literal = unwrapSchema(type);
        if (literal instanceof z.ZodLiteral) ownType = String(literal.value);
      }
      for (const [key, child] of Object.entries(node.shape)) {
        if (child instanceof z.ZodType) {
          visit(child, [...path, key], ownType, within);
        }
      }
    } else if (node instanceof z.ZodArray) {
      const element: unknown = node.element;
      if (element instanceof z.ZodType) {
        visit(element, [...path, '#'], stageType, within);
      }
    } else if (node instanceof z.ZodRecord) {
      const valueType: unknown = node.valueType;
      if (valueType instanceof z.ZodType) {
        visit(valueType, [...path, '*'], stageType, within);
      }
    } else if (node instanceof z.ZodUnion) {
      for (const option of node.options) {
        if (option instanceof z.ZodType) {
          visit(option, path, stageType, within);
        }
      }
    }
  };
  visit(ProtocolSchemaV9, [], undefined, new Set());
  return [...found].toSorted();
};
