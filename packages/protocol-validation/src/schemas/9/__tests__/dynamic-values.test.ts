import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import {
  dynamicValueContextFor,
  stageDynamicValueContext,
} from '../dynamic-value-validation.ts';
import { dynamicValueArgumentsAt } from '../dynamic-values.ts';
import { getLocalizedStringDescriptor } from '../localized-string.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

type Protocol = ReturnType<typeof completeProtocol>;
type Stage = Record<string, unknown>;

const stageIn = (protocol: Protocol, id: string): Stage => {
  const stage = (protocol.stages as Stage[]).find(
    (candidate) => candidate.id === id,
  );
  if (stage === undefined) throw new Error(`No stage "${id}"`);
  return stage;
};

/** The complete protocol with one stage edited. */
const editing = (id: string, edit: (stage: Stage) => void) => {
  const protocol = completeProtocol();
  edit(stageIn(protocol, id));
  return protocol;
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
  (protocol.stages as Stage[]).findIndex((stage) => stage.id === id);

const guarded = (name: string) =>
  `{${name}, select, missing {Tell us about them.} other {Tell us about {${name}}.}}`;

describe('dynamic values in stage text', () => {
  it('accepts the complete protocol, which binds nothing', () => {
    expect(issuesOf(completeProtocol())).toEqual([]);
  });

  it('accepts an ego value guarded by a missing version on an Information screen', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { egoName: { path: 'ego.egoName' } };
      stage.title = { en: guarded('egoName') };
    });
    expect(issuesOf(protocol)).toEqual([]);
  });

  it('refuses a network value shown outside a version for when it has one', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { egoName: { path: 'ego.egoName' } };
      stage.title = { en: 'Hello {egoName}' };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        path: `stages.${index}.title.en`,
        message: expect.stringContaining('"egoName" can be missing'),
      }),
    ]);
  });

  it('refuses a select without a missing version as the guard of its other version', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { egoName: { path: 'ego.egoName' } };
      stage.title = { en: '{egoName, select, other {Hi {egoName}}}' };
    });
    expect(issuesOf(protocol)).toHaveLength(1);
  });

  it('needs no missing version for a value every host guarantees', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { today: { path: 'now' } };
      stage.title = { en: 'Since {today}' };
    });
    expect(issuesOf(protocol)).toEqual([]);
  });

  it.each([
    'interview.id',
    'interview.caseId',
    'interview.startedAt',
    'protocol.name',
    'protocol.hash',
    'stage.id',
  ])('refuses the interview metadata %s', (path) => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { meta: { path } };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: 'This does not name a value the interview can show.',
      }),
    ]);
  });

  it('refuses a name the stage does not bind', () => {
    const protocol = editing('information', (stage) => {
      stage.title = { en: 'Hello {someone}' };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          '"someone" is not a value this text can show here',
        ),
      }),
    ]);
  });

  it('refuses a binding to an attribute that does not exist, at the binding and at every site', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { gone: { path: 'ego.deleted' } };
      stage.title = { en: guarded('gone') };
      stage.items = [
        { id: 'i1', type: 'text', content: { en: guarded('gone') } },
      ];
    });
    const index = stageIndex(protocol, 'information');
    const issues = issuesOf(protocol);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: `stages.${index}.dynamicValues.gone.path`,
        }),
        expect.objectContaining({
          path: `stages.${index}.title.en`,
          message: expect.stringContaining('does not exist'),
        }),
        expect.objectContaining({
          path: `stages.${index}.items.0.content.en`,
          message: expect.stringContaining('does not exist'),
        }),
      ]),
    );
  });

  it('refuses an argument name that is not a short identifier', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { 'partner-name': { path: 'ego.egoName' } };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('cannot name a value'),
      }),
    ]);
  });

  it('refuses a path outside the vocabulary', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { other: { path: 'session.secret' } };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: 'This does not name a value the interview can show.',
      }),
    ]);
  });

  it('refuses text that is blank in every version', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { you: { path: 'ego.egoName' } };
      stage.title = { en: '{you, select, missing {} other {}}' };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        path: `stages.${index}.title.en`,
        message: expect.stringContaining('blank in every version'),
      }),
    ]);
  });

  it('refuses text whose only words are in a plural version its language never chooses', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { count: { path: 'ego.egoAge' } };
      stage.title = {
        en: '{count, select, missing {} other {{count, plural, few {Some} other {}}}}',
      };
    });
    const index = stageIndex(protocol, 'information');
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        path: `stages.${index}.title.en`,
        message: expect.stringContaining('blank in every version'),
      }),
    ]);
  });

  it('refuses text holding the marker the interview places values with', () => {
    const protocol = editing('information', (stage) => {
      stage.title = { en: 'Hello ' };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('U+E000'),
      }),
    ]);
  });

  it('keeps sites outside the field boundary literal', () => {
    const protocol = editing('information', (stage) => {
      stage.dynamicValues = { egoName: { path: 'ego.egoName' } };
      stage.label = { en: guarded('egoName') };
    });
    expect(issuesOf(protocol)).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('cannot contain placeholders'),
      }),
    ]);
  });

  describe('cases', () => {
    it('lets a categorical value choose a version by case', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = {
          kind: { path: 'node.category', cases: { friend: 'friend' } },
        };
        stage.form = {
          fields: [
            { variable: 'nickname', prompt: { en: 'Nickname' } },
            {
              variable: 'name',
              prompt: {
                en: '{kind, select, missing {Their name?} friend {Your friend’s name?} other {Their name?}}',
              },
            },
          ],
        };
      });
      // `category` is not asked in this form, so it can already have a value.
      expect(issuesOf(protocol)).toEqual([]);
    });

    it('refuses a case the binding does not declare', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = { kind: { path: 'node.category' } };
        stage.form = {
          fields: [
            {
              variable: 'name',
              prompt: {
                en: '{kind, select, friend {Your friend?} other {Them?}}',
              },
            },
          ],
        };
      });
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('"friend" is not a version'),
        }),
      ]);
    });

    it('refuses a case standing for no option', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = {
          kind: { path: 'node.category', cases: { work: 'colleague' } },
        };
      });
      const index = stageIndex(protocol, 'alterForm');
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          path: `stages.${index}.dynamicValues.kind.cases.work`,
        }),
      ]);
    });

    it('refuses a second case for an option another case already stands for', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = {
          kind: {
            path: 'node.category',
            cases: { friend: 'friend', pal: 'friend' },
          },
        };
      });
      const index = stageIndex(protocol, 'alterForm');
      expect(issuesOf(protocol)).toEqual([
        {
          path: `stages.${index}.dynamicValues.kind.cases.pal`,
          message:
            'Case "pal" stands for "friend", as case "friend" already does, so it would never be chosen. Give each option at most one case.',
        },
      ]);
    });

    it('refuses cases on a value without options', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = {
          nick: { path: 'node.nickname', cases: { bob: 'Bob' } },
        };
      });
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          message: 'Only an attribute with options can have cases.',
        }),
      ]);
    });
  });

  describe('yes/no attributes', () => {
    type Variables = Record<string, Record<string, unknown>>;
    const personVariables = (protocol: Protocol): Variables =>
      (protocol.codebook.node as Record<string, { variables: Variables }>)
        .person!.variables;
    const showingFlag = (message: string, cases?: Record<string, boolean>) =>
      editing('alterForm', (stage) => {
        stage.dynamicValues = {
          flag: { path: 'node.flag', ...(cases && { cases }) },
        };
        stage.form = {
          fields: [{ variable: 'nickname', prompt: { en: message } }],
        };
      });
    const UNLABELLED =
      '"flag" cannot be shown as words: "Flag" is a yes/no attribute without labels for both of its answers. Add a label for yes and for no to "Flag", or give the text a different wording for each answer.';

    it('shows a yes/no attribute with a label for each answer', () => {
      expect(issuesOf(showingFlag(guarded('flag')))).toEqual([]);
    });

    it('refuses text whose words are only in the version no answer reaches', () => {
      const protocol = showingFlag(
        '{flag, select, missing {} yes {} no {} other {Shown to nobody.}}',
        { yes: true, no: false },
      );
      const index = stageIndex(protocol, 'alterForm');
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          path: `stages.${index}.form.fields.0.prompt.en`,
          message: expect.stringContaining('blank in every version'),
        }),
      ]);
      // With a case for only one answer, the other answer reads `other`.
      expect(
        issuesOf(
          showingFlag(
            '{flag, select, missing {} yes {} other {Shown for no.}}',
            { yes: true },
          ),
        ),
      ).toEqual([]);
    });

    it('refuses to show a yes/no attribute without labels as words', () => {
      const protocol = showingFlag(guarded('flag'));
      delete personVariables(protocol).flag!.options;
      const index = stageIndex(protocol, 'alterForm');
      expect(issuesOf(protocol)).toEqual([
        {
          path: `stages.${index}.form.fields.0.prompt.en`,
          message: UNLABELLED,
        },
      ]);
    });

    it('refuses a yes/no attribute with a label for only one answer', () => {
      const protocol = showingFlag(guarded('flag'));
      const flag = personVariables(protocol).flag!;
      flag.options = (flag.options as { value: boolean }[]).filter(
        (option) => option.value,
      );
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({ message: UNLABELLED }),
      ]);
    });

    it('lets text choose its wording by a Toggle, which has no labels, but not show it', () => {
      const wording =
        '{flag, select, missing {Anything else?} yes {Tell us why.} other {Anything else?}}';
      const byAnswer = showingFlag(wording, { yes: true });
      const flag = personVariables(byAnswer).flag!;
      flag.component = 'Toggle';
      delete flag.options;
      expect(issuesOf(byAnswer)).toEqual([]);

      const shown = showingFlag(guarded('flag'));
      const toggle = personVariables(shown).flag!;
      toggle.component = 'Toggle';
      delete toggle.options;
      expect(issuesOf(shown)).toEqual([
        expect.objectContaining({ message: UNLABELLED }),
      ]);
    });
  });

  describe('where values are available', () => {
    const argumentsAt = (
      protocol: Protocol,
      id: string,
      sitePath: (string | number)[],
      site: 'stageText' | 'prompt' | 'formField',
    ) => {
      const stage = stageIn(protocol, id);
      return Object.keys(
        dynamicValueArgumentsAt(
          stage.dynamicValues as never,
          dynamicValueContextFor({
            codebook: protocol.codebook,
            stage,
            sitePath,
            site,
          }),
        ),
      );
    };

    const allRoles = {
      you: { path: 'ego.egoName' },
      them: { path: 'node.nickname' },
      first: { path: 'dyad.source.nickname' },
      second: { path: 'dyad.target.nickname' },
      focal: { path: 'one_to_many.focal.nickname' },
      tie: { path: 'edge.note' },
      today: { path: 'now' },
    };

    const withAllRoles = (id: string) =>
      editing(id, (stage) => {
        stage.dynamicValues = allRoles;
      });

    it('offers the participant and the interview on every stage', () => {
      const protocol = withAllRoles('sociogram');
      expect(
        argumentsAt(protocol, 'sociogram', ['prompts', 0, 'text'], 'prompt'),
      ).toEqual(['you', 'today']);
    });

    it('offers no one person on an interface that shows many', () => {
      for (const id of [
        'sociogram',
        'ordinalBin',
        'categoricalBin',
        'nameGenerator',
      ]) {
        const protocol = withAllRoles(id);
        expect(
          argumentsAt(protocol, id, ['prompts', 0, 'text'], 'prompt'),
        ).toEqual(['you', 'today']);
      }
    });

    it('offers the pair to a Dyad Census and Tie Strength Census prompt', () => {
      for (const id of ['dyadCensus', 'tieStrength']) {
        const protocol = withAllRoles(id);
        expect(
          argumentsAt(protocol, id, ['prompts', 0, 'text'], 'prompt'),
        ).toEqual(['you', 'first', 'second', 'today']);
      }
    });

    it('offers only the focal person to a one-to-many census prompt', () => {
      const protocol = withAllRoles('oneToMany');
      expect(
        argumentsAt(protocol, 'oneToMany', ['prompts', 0, 'text'], 'prompt'),
      ).toEqual(['you', 'focal', 'today']);
    });

    it('offers a form field every attribute of the node it asks about', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = {
          nick: { path: 'node.nickname' },
          name: { path: 'node.name' },
          kind: { path: 'node.category' },
          tie: { path: 'edge.note' },
        };
        stage.form = {
          fields: [
            { variable: 'nickname', prompt: { en: 'Nickname?' } },
            { variable: 'name', prompt: { en: 'Name?' } },
            { variable: 'strength', prompt: { en: 'Strength?' } },
          ],
        };
      });
      const field = (index: number) =>
        argumentsAt(
          protocol,
          'alterForm',
          ['form', 'fields', index, 'prompt'],
          'formField',
        );
      for (const index of [0, 1, 2]) {
        expect(field(index)).toEqual(['nick', 'name', 'kind']);
      }
    });

    it('offers an ego form field every attribute of the participant', () => {
      const protocol = editing('egoForm', (stage) => {
        stage.dynamicValues = {
          you: { path: 'ego.egoName' },
          age: { path: 'ego.egoAge' },
        };
        stage.form = {
          fields: [
            { variable: 'egoName', prompt: { en: 'Name?' } },
            { variable: 'egoAge', prompt: { en: 'Age?' } },
          ],
        };
      });
      const field = (index: number) =>
        argumentsAt(
          protocol,
          'egoForm',
          ['form', 'fields', index, 'prompt'],
          'formField',
        );
      expect(field(0)).toEqual(['you', 'age']);
      expect(field(1)).toEqual(['you', 'age']);
    });

    it('offers an edge form the edge, and a Network Composer edge type form only the participant', () => {
      const edgeForm = withAllRoles('alterEdgeForm');
      expect(
        argumentsAt(
          edgeForm,
          'alterEdgeForm',
          ['form', 'fields', 0, 'prompt'],
          'formField',
        ),
      ).toEqual(['you', 'tie', 'today']);
      const before = editing('alterEdgeForm', (stage) => {
        stage.dynamicValues = { tie: { path: 'edge.tieStrength' } };
      });
      expect(
        argumentsAt(
          before,
          'alterEdgeForm',
          ['form', 'fields', 0, 'prompt'],
          'formField',
        ),
      ).toEqual(['tie']);

      const composer = withAllRoles('composer');
      expect(
        argumentsAt(
          composer,
          'composer',
          ['nodeForm', 'fields', 0, 'label'],
          'formField',
        ),
      ).toEqual(['you', 'them', 'today']);
      expect(
        argumentsAt(
          composer,
          'composer',
          ['edges', 0, 'form', 'fields', 0, 'label'],
          'formField',
        ),
      ).toEqual(['you', 'today']);
    });

    describe('node labels', () => {
      const labels = {
        nodeLabel: { path: 'node.$label' },
        firstLabel: { path: 'dyad.source.$label' },
        secondLabel: { path: 'dyad.target.$label' },
        focalLabel: { path: 'one_to_many.focal.$label' },
        fromLabel: { path: 'edge.from.$label' },
        toLabel: { path: 'edge.to.$label' },
      };
      const withLabels = (id: string) =>
        editing(id, (stage) => {
          stage.dynamicValues = { ...labels, them: { path: 'node.nickname' } };
        });
      const promptOf = (id: string) =>
        argumentsAt(withLabels(id), id, ['prompts', 0, 'text'], 'prompt');

      it('offers the label of each node a prompt is about', () => {
        expect(promptOf('dyadCensus')).toEqual(['firstLabel', 'secondLabel']);
        expect(promptOf('tieStrength')).toEqual(['firstLabel', 'secondLabel']);
        expect(promptOf('oneToMany')).toEqual(['focalLabel']);
        expect(promptOf('geospatial')).toEqual(['nodeLabel', 'them']);
        for (const id of ['sociogram', 'ordinalBin', 'categoricalBin']) {
          expect(promptOf(id)).toEqual([]);
        }
      });

      it('offers the node a form is about by its label', () => {
        expect(
          argumentsAt(
            withLabels('alterForm'),
            'alterForm',
            ['form', 'fields', 0, 'prompt'],
            'formField',
          ),
        ).toEqual(['nodeLabel', 'them']);
        expect(
          argumentsAt(
            withLabels('composer'),
            'composer',
            ['nodeForm', 'fields', 0, 'label'],
            'formField',
          ),
        ).toEqual(['nodeLabel', 'them']);
      });

      it('offers the question about a node put in the "other" bin that node, but not the bin\'s label', () => {
        const protocol = withLabels('categoricalBin');
        expect(
          argumentsAt(
            protocol,
            'categoricalBin',
            ['prompts', 0, 'otherVariablePrompt'],
            'formField',
          ),
        ).toEqual(['nodeLabel', 'them']);
        expect(issuesOf(protocol)).toEqual([]);
        const misplaced = editing('categoricalBin', (stage) => {
          stage.dynamicValues = labels;
          (stage.prompts as Stage[])[0]!.otherOptionLabel = {
            en: 'Not {nodeLabel}',
          };
        });
        expect(issuesOf(misplaced)).toEqual([
          expect.objectContaining({
            message: expect.stringContaining(
              'values about the node this stage is about cannot be shown here',
            ),
          }),
        ]);
      });

      it('offers an edge form both ends of its edge by label alone', () => {
        expect(
          argumentsAt(
            withLabels('alterEdgeForm'),
            'alterEdgeForm',
            ['form', 'fields', 0, 'prompt'],
            'formField',
          ),
        ).toEqual(['fromLabel', 'toLabel']);
        expect(
          argumentsAt(
            withLabels('composer'),
            'composer',
            ['edges', 0, 'form', 'fields', 0, 'label'],
            'formField',
          ),
        ).toEqual(['fromLabel', 'toLabel']);
        // An end's attributes have no codebook type to name them by.
        expect(
          issuesOf(
            editing('alterEdgeForm', (stage) => {
              stage.dynamicValues = { theirs: { path: 'edge.from.nickname' } };
            }),
          ),
        ).toEqual([
          expect.objectContaining({
            message: expect.stringContaining('does not exist'),
          }),
        ]);
      });

      it("names every label the stage's text can show, edge type forms included", () => {
        const protocol = withLabels('composer');
        const shown = Object.keys(
          dynamicValueArgumentsAt(
            labels,
            stageDynamicValueContext({
              codebook: protocol.codebook,
              stage: stageIn(protocol, 'composer'),
            }),
          ),
        );
        expect(shown).toEqual(['nodeLabel', 'fromLabel', 'toLabel']);
      });

      it('needs no missing version for a label, which is never missing', () => {
        const protocol = editing('dyadCensus', (stage) => {
          stage.dynamicValues = labels;
          (stage.prompts as Stage[])[0]!.text = {
            en: 'Do {firstLabel} and {secondLabel} know each other?',
          };
        });
        expect(issuesOf(protocol)).toEqual([]);
      });

      it('refuses cases on a label', () => {
        const protocol = editing('dyadCensus', (stage) => {
          stage.dynamicValues = {
            firstLabel: { path: 'dyad.source.$label', cases: { bob: 'Bob' } },
          };
        });
        expect(issuesOf(protocol)).toEqual([
          expect.objectContaining({
            message: 'Only an attribute with options can have cases.',
          }),
        ]);
      });

      it('refuses a label for the participant, which has none', () => {
        const protocol = editing('information', (stage) => {
          stage.dynamicValues = { me: { path: 'ego.$label' } };
          stage.title = { en: guarded('me') };
        });
        expect(issuesOf(protocol)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('does not exist'),
            }),
          ]),
        );
      });
    });

    it('reports a value used where it is not available', () => {
      const protocol = editing('sociogram', (stage) => {
        stage.dynamicValues = { them: { path: 'node.nickname' } };
        (stage.prompts as Stage[])[0]!.text = { en: guarded('them') };
      });
      expect(issuesOf(protocol)).toEqual([
        expect.objectContaining({
          message: expect.stringContaining(
            '"them" cannot be shown here: values about the node this stage is about cannot be shown here',
          ),
        }),
      ]);
    });

    it('refuses an encrypted attribute', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = { secret: { path: 'node.name' } };
        stage.form = {
          fields: [{ variable: 'nickname', prompt: { en: guarded('secret') } }],
        };
      });
      const person = (
        protocol.codebook.node as Record<
          string,
          { variables: Record<string, Record<string, unknown>> }
        >
      ).person!;
      person.variables.name!.encrypted = true;
      expect(issuesOf(protocol)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('encrypted'),
          }),
        ]),
      );
    });
  });

  describe('translations', () => {
    const twoLanguages = (titles: Record<string, string>) => {
      const protocol = editing('information', (stage) => {
        stage.dynamicValues = {
          you: { path: 'ego.egoName' },
          count: { path: 'ego.egoAge' },
        };
        stage.title = titles;
      });
      return {
        ...protocol,
        localization: {
          defaultLocale: 'en',
          locales: ['en', 'ar', 'de', 'fr', 'ru'],
        },
      };
    };

    it('accepts a translation showing what its original shows', () => {
      expect(
        issuesOf(
          twoLanguages({
            en: guarded('you'),
            fr: '{you, select, missing {Parlez-nous d’eux.} other {Parlez-nous de {you}.}}',
          }),
        ).filter((issue) => issue.path.includes('title')),
      ).toEqual([]);
    });

    it('refuses a translation that drops a value in some version', () => {
      const issues = issuesOf(
        twoLanguages({
          en: guarded('you'),
          fr: '{you, select, missing {Parlez-nous d’eux.} other {Parlez-nous de cette personne.}}',
        }),
      ).filter((issue) => issue.path.includes('title'));
      expect(issues).toEqual([
        expect.objectContaining({
          path: expect.stringMatching(/title\.fr$/),
          message: expect.stringContaining('must show "{you}"'),
        }),
      ]);
    });

    it('lets a plural category for zero alone leave its number out, but not a category covering several', () => {
      const english =
        '{count, select, missing {Some years.} other {{count, plural, one {# year.} other {# years.}}}}';
      const translated = (translations: Record<string, string>) =>
        issuesOf(twoLanguages({ en: english, ...translations })).filter(
          (issue) => issue.path.includes('title'),
        );
      // Russian "one" also covers 21, which the English shows; German "one"
      // covers -1 as well as 1, and a number answer can be negative.
      expect(
        translated({
          de: english.replace('# year.', 'A year.'),
          ru: '{count, select, missing {Годы.} other {{count, plural, one {Один год.} few {# года.} many {# лет.} other {# года.}}}}',
        }),
      ).toEqual([
        expect.objectContaining({ path: expect.stringMatching(/title\.de$/) }),
        expect.objectContaining({ path: expect.stringMatching(/title\.ru$/) }),
      ]);
      // Arabic "zero" is only 0, so it may say "no years".
      expect(
        translated({
          ar: '{count, select, missing {Some years.} other {{count, plural, zero {No years.} other {# years.}}}}',
        }),
      ).toEqual([]);
    });
  });

  describe('reference collection', () => {
    it('counts a binding as a use of the attribute it shows', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = {
          you: { path: 'ego.egoName' },
          them: { path: 'node.nickname' },
          now: { path: 'now' },
        };
      });
      const index = stageIndex(protocol, 'alterForm');
      const hits = collectEntityAttributeReferences(protocol).filter((hit) =>
        hit.path.includes('dynamicValues'),
      );
      expect(hits).toEqual([
        {
          path: ['stages', index, 'dynamicValues', 'you', 'path'],
          variableId: 'egoName',
          subject: { entity: 'ego' },
        },
        {
          path: ['stages', index, 'dynamicValues', 'them', 'path'],
          variableId: 'nickname',
          subject: { entity: 'node', type: 'person' },
        },
      ]);
    });

    it('counts a label as a use of no attribute', () => {
      const protocol = editing('alterForm', (stage) => {
        stage.dynamicValues = { label: { path: 'node.$label' } };
      });
      expect(
        collectEntityAttributeReferences(protocol).filter((hit) =>
          hit.path.includes('dynamicValues'),
        ),
      ).toEqual([]);
    });
  });

  it('tags exactly the inventoried stage sites, and none outside stages', () => {
    // Read from the schema itself, through every optional field and union
    // variant, so a site the complete protocol happens not to fill (a hint,
    // a scale's labels) is inventoried too.
    const sites = schemaDynamicValueSites();
    expect(sites.every((site) => site.startsWith('stages '))).toBe(true);
    const inventory = sites.map((site) => site.slice('stages '.length));
    // What the walk of a document tags is a part of that inventory.
    const collected = collectLocalizedStrings(completeProtocol())
      .filter((hit) => hit.dynamicValues !== undefined)
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
  return [...found].sort();
};
