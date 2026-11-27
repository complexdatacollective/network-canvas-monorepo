import { configureStore } from '@reduxjs/toolkit';
import { act, render, waitFor } from '@testing-library/react';
import { isEqual } from 'es-toolkit';
import { useContext, useEffect } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  testId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  createDefaultFinishSessionStage,
  type CurrentProtocol,
  dynamicValueNameFor,
  fieldBlockMarkdown,
} from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getTranslationGroups } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import { cellValue, readCellValue, translationFieldName } from '../cellNames';
import { saveTranslations } from '../saveTranslations';
import {
  useDefinitionsInTable,
  useTranslationDraft,
} from '../translationDrafts';

const NAME_FIELD = testId('field-name');
const NAME = testVariableId('name');
const SMOKES = testVariableId('smokes');
const SMOKES_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: SMOKES,
});
const SMOKING_WORDING = testId('smoking-wording');
const SMOKING_WORDING_NAME = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: SMOKING_WORDING,
});
const STAGE = ['stages', 0] as const;
const CONTENT = [...STAGE, 'form', 'content'];

/** An Ego Form whose heading shows a dynamic attribute on smoking. */
const protocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: {
    node: {},
    edge: {},
    ego: {
      variables: {
        [NAME]: { name: 'name', type: 'text', component: 'Text' },
        [SMOKES]: { name: 'smokes', type: 'boolean', component: 'Boolean' },
      },
    },
  },
  stages: [
    {
      id: testId('about'),
      type: 'EgoForm',
      label: { en: 'About you' },
      dynamicAttributes: {
        [SMOKING_WORDING]: {
          logic: 'answers',
          value: SMOKES_NAME,
          missing: { en: 'you' },
          answers: [
            { answer: 'true', wording: { en: 'a smoker' } },
            { answer: 'false', wording: { en: 'a non-smoker' } },
          ],
          other: { en: 'you' },
        },
      },
      form: formOf(
        [
          {
            id: NAME_FIELD,
            variable: NAME,
            prompt: { en: 'What is your name?' },
          },
        ],
        { before: `# About {${SMOKING_WORDING_NAME}}` },
      ),
    },
    createDefaultFinishSessionStage({
      id: testId('finish'),
      localization: { defaultLocale: 'en', locales: ['en'] },
    }),
  ],
} as unknown as CurrentProtocol;

type Definitions = NonNullable<ReturnType<typeof useDefinitionsInTable>>;

/** The conditions or dynamic attributes as a cell writes them. */
type Written = Readonly<{
  values: Readonly<Record<string, unknown>>;
  set: (next: Readonly<Record<string, unknown>>) => void;
}>;

const writable = (held: Definitions[keyof Definitions]): Written => {
  const { set } = held;
  if (set === undefined) throw new Error('The cell does not write them.');
  return { values: held.values, set };
};

type Cell = Readonly<{ path: readonly (string | number)[]; locale: string }>;

/** The English cell of the form's text. */
const CONTENT_EN: Cell = { path: CONTENT, locale: 'en' };

/**
 * The stage's conditions and dynamic attributes as cells of the table see
 * them, through the hook that a text's editor writes them with, over the
 * table's own form: as the English cell of the form's text writes them,
 * and as each of `others` does.
 */
const renderTableDefinitions = (
  seeded: CurrentProtocol = protocol,
  others: readonly Cell[] = [],
) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(seeded)));
  const cells = [CONTENT_EN, ...others];
  const held: {
    definitions: (Definitions | undefined)[];
    form?: NonNullable<React.ContextType<typeof FormStoreContext>>;
    logic: (ReturnType<typeof useTranslationDraft> | undefined)[];
  } = { definitions: [], logic: [] };
  const rows = getTranslationGroups(store.getState()).flatMap(
    (group) => group.rows,
  );
  const Probe = ({ index }: { index: number }) => {
    const cell = cells[index] ?? CONTENT_EN;
    const row = rows.find(
      ({ path }) => JSON.stringify(path) === JSON.stringify(cell.path),
    );
    if (row === undefined) throw new Error('The cell has no row.');
    const definitions = useDefinitionsInTable(STAGE, cell) ?? undefined;
    const form = useContext(FormStoreContext) ?? undefined;
    // Whether the cell is changed, its logic included, and Escape there.
    const logic = useTranslationDraft({ row, locale: cell.locale });
    useEffect(() => {
      held.definitions[index] = definitions;
      held.form = form;
      held.logic[index] = logic;
    });
    return null;
  };
  render(
    <Provider store={store}>
      <FormStoreProvider>
        {cells.map((cell, index) => (
          <Probe key={JSON.stringify(cell)} index={index} />
        ))}
      </FormStoreProvider>
    </Provider>,
  );
  /** The definitions as the cell at `index` (0, the English cell of the form's text, or one of `others` after it) writes them. */
  const definitions = (index = 0) => {
    const found = held.definitions[index];
    if (found === undefined) throw new Error('Not rendered');
    return {
      conditions: writable(found.conditions),
      dynamicAttributes: writable(found.dynamicAttributes),
    };
  };
  const form = () => {
    if (held.form === undefined) throw new Error('Not rendered');
    return held.form;
  };
  /** The logic that the cell at `index` changed. */
  const logic = (index = 0) => {
    const found = held.logic[index];
    if (found === undefined) throw new Error('Not rendered');
    return found;
  };
  /** Writes `text` into the cell of `path` in `locale`, as a cell does. */
  const type = (
    path: readonly (string | number)[],
    text: string,
    locale = 'en',
  ) => {
    const name = translationFieldName(path, locale);
    const state = form().getState();
    if (!state.fields.has(name)) {
      state.registerField({ name, initialValue: cellValue('') });
    }
    const was = readCellValue(state.getFieldState(name)?.value);
    state.setFieldValue(name, cellValue(text, was.logic));
  };
  const save = () =>
    saveTranslations({
      values: form().getState().getFormValues(),
      formStore: form(),
      getState: () => store.getState(),
      dispatch: store.dispatch,
      getWords: () => ({
        intl: createAppIntl({ locale: 'en' }),
        languageName: (locale: string) => locale,
      }),
    });
  const stage = () => {
    const saved = getProtocol(store.getState())?.stages[0];
    if (saved?.type !== 'EgoForm') throw new Error('The stage is a form.');
    return saved;
  };
  /** What the cell of `path` in `locale` shows, and whether it is unsaved. */
  const cell = (path: readonly (string | number)[], locale = 'en') => {
    const field = form()
      .getState()
      .getFieldState(translationFieldName(path, locale));
    return {
      text: readCellValue(field?.value).text,
      changed: field !== undefined && !isEqual(field.value, field.initialValue),
    };
  };
  return { definitions, form, logic, type, save, stage, cell, store };
};

const ASKED = testId('condition/asked');
const ASKED_NAME = dynamicValueNameFor({
  kind: 'condition',
  conditionId: ASKED,
});
const ASKED_CONDITION = {
  rules: [
    {
      id: testId('rule/asked'),
      type: 'ego',
      options: { attribute: NAME, operator: 'EXACTLY', value: 'Sam' },
    },
  ],
};
const GREETING = testId('dynamic/greeting');
const GREETING_NAME = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: GREETING,
});
const GREETING_DEFINITION = {
  logic: 'conditions',
  cases: [{ condition: ASKED, when: 'met', wording: { en: 'Sam' } }],
  otherwise: { en: 'friend' },
};

describe('the logic that a cell of the translation table writes', () => {
  it('is saved with the text that uses it: a new dynamic attribute, and the rules of a new logic block', async () => {
    const table = renderTableDefinitions();

    act(() => {
      table.definitions().conditions.set({ [ASKED]: ASKED_CONDITION });
    });
    act(() => {
      table.definitions().dynamicAttributes.set({
        ...table.definitions().dynamicAttributes.values,
        [GREETING]: GREETING_DEFINITION,
      });
    });
    // The cell's text shows the new dynamic attribute, and its logic block
    // tests the new rules.
    const content = [
      `# About {${SMOKING_WORDING_NAME}}, {${GREETING_NAME}}`,
      fieldBlockMarkdown(NAME_FIELD),
      `{${ASKED_NAME}, select, true {Welcome back.} other {}}`,
    ].join('\n\n');
    act(() => table.type(CONTENT, content));
    // Read as the table holds it, before it is saved.
    expect(table.definitions().conditions.values).toEqual({
      [ASKED]: ASKED_CONDITION,
    });
    expect(table.definitions().dynamicAttributes.values).toHaveProperty(
      GREETING,
      GREETING_DEFINITION,
    );

    const result = await act(() => table.save());

    expect(result).toEqual({ success: true });
    const stage = table.stage();
    expect(stage.form.content.en).toBe(content);
    expect(stage.conditions).toEqual({ [ASKED]: ASKED_CONDITION });
    expect(stage.dynamicAttributes).toHaveProperty(
      GREETING,
      GREETING_DEFINITION,
    );
    expect(stage.dynamicAttributes).toHaveProperty(SMOKING_WORDING);
  });

  it('drops a dynamic attribute and the rules that no text uses, and is not refused for them', async () => {
    const table = renderTableDefinitions();

    act(() => {
      table.definitions().conditions.set({ [ASKED]: ASKED_CONDITION });
    });
    act(() => {
      table.definitions().dynamicAttributes.set({
        ...table.definitions().dynamicAttributes.values,
        [GREETING]: GREETING_DEFINITION,
      });
    });

    const result = await act(() => table.save());

    expect(result).toEqual({ success: true });
    const stage = table.stage();
    expect(stage.conditions).toBeUndefined();
    expect(Object.keys(stage.dynamicAttributes ?? {})).toEqual([
      SMOKING_WORDING,
    ]);
  });

  it("writes a version's new wording to that version's own row", () => {
    const table = renderTableDefinitions();
    const { values } = table.definitions().dynamicAttributes;

    act(() => {
      table.definitions().dynamicAttributes.set({
        ...values,
        [SMOKING_WORDING]: {
          ...(values[SMOKING_WORDING] as object),
          missing: { en: 'someone' },
        },
      });
    });

    expect(
      table.cell([...STAGE, 'dynamicAttributes', SMOKING_WORDING, 'missing']),
    ).toEqual({ text: 'someone', changed: true });
  });

  it("is not the cell's own change when only a version's wording changes: the version's row has it, and Escape there puts it back", async () => {
    const table = renderTableDefinitions();
    const { values } = table.definitions().dynamicAttributes;
    const missing = translationFieldName(
      [...STAGE, 'dynamicAttributes', SMOKING_WORDING, 'missing'],
      'en',
    );

    act(() => {
      table.definitions().dynamicAttributes.set({
        ...values,
        [SMOKING_WORDING]: {
          ...(values[SMOKING_WORDING] as object),
          missing: { en: 'someone' },
        },
      });
    });

    await waitFor(() =>
      expect(table.definitions().dynamicAttributes.values).toHaveProperty(
        [SMOKING_WORDING, 'missing'],
        { en: 'someone' },
      ),
    );
    expect(table.logic().changed).toBe(false);
    act(() => table.form().getState().resetField(missing));
    await waitFor(() =>
      expect(table.definitions().dynamicAttributes.values).toHaveProperty(
        [SMOKING_WORDING, 'missing'],
        { en: 'you' },
      ),
    );
  });

  it("keeps the wording typed in a version's row when a change to the logic moves that version", async () => {
    const table = renderTableDefinitions();
    // Typed in the row of the second answer's version.
    act(() =>
      table.type(
        [
          ...STAGE,
          'dynamicAttributes',
          SMOKING_WORDING,
          'answers',
          1,
          'wording',
        ],
        'not a smoker',
      ),
    );
    const { values } = table.definitions().dynamicAttributes;
    // Read as its row holds it.
    expect(values[SMOKING_WORDING]).toMatchObject({
      answers: [
        { answer: 'true', wording: { en: 'a smoker' } },
        { answer: 'false', wording: { en: 'not a smoker' } },
      ],
    });

    // The first answer's version is removed, so the second moves up.
    act(() => {
      table.definitions().dynamicAttributes.set({
        ...values,
        [SMOKING_WORDING]: {
          ...(values[SMOKING_WORDING] as object),
          answers: [{ answer: 'false', wording: { en: 'not a smoker' } }],
        },
      });
    });
    const result = await act(() => table.save());

    expect(result).toEqual({ success: true });
    expect(table.stage().dynamicAttributes?.[SMOKING_WORDING]).toMatchObject({
      answers: [{ answer: 'false', wording: { en: 'not a smoker' } }],
    });
  });
});

/** The protocol, in English and Spanish. */
const inSpanishToo = (() => {
  const both = structuredClone(protocol) as unknown as {
    localization: { locales: string[] };
    stages: [{ form: { content: Record<string, string> } }];
  };
  both.localization.locales = ['en', 'es'];
  both.stages[0].form.content.es = [
    '# Sobre usted',
    fieldBlockMarkdown(NAME_FIELD),
  ].join('\n\n');
  return both as unknown as CurrentProtocol;
})();

/** A dynamic attribute with wording in Spanish alone. */
const SPANISH_GREETING = {
  logic: 'conditions',
  cases: [{ condition: ASKED, when: 'met', wording: { es: 'Sam' } }],
  otherwise: { es: 'amigo' },
};

describe('the logic that a cell changed, put back with Escape', () => {
  // The English text has a logic block on whether the participant is Sam.
  const withLogicBlock = (() => {
    const seeded = structuredClone(protocol) as unknown as {
      stages: [
        {
          conditions?: Record<string, unknown>;
          form: { content: Record<string, string> };
        },
      ];
    };
    const [stage] = seeded.stages;
    stage.conditions = { [ASKED]: ASKED_CONDITION };
    stage.form.content.en = [
      stage.form.content.en,
      `{${ASKED_NAME}, select, true {Welcome back.} other {}}`,
    ].join('\n\n');
    return seeded as unknown as CurrentProtocol;
  })();
  const askedAlex = {
    rules: [
      {
        ...ASKED_CONDITION.rules[0],
        options: { attribute: NAME, operator: 'EXACTLY', value: 'Alex' },
      },
    ],
  };

  it('is changed when a rule of its logic block is, though the text is not', async () => {
    const table = renderTableDefinitions(withLogicBlock);
    expect(table.logic().changed).toBe(false);

    act(() => {
      table.definitions().conditions.set({ [ASKED]: askedAlex });
    });

    await waitFor(() => expect(table.logic().changed).toBe(true));
  });

  it('puts back the rules that the cell changed, so that a save leaves them as they were', async () => {
    const table = renderTableDefinitions(withLogicBlock);
    act(() => {
      table.definitions().conditions.set({ [ASKED]: askedAlex });
    });
    await waitFor(() => expect(table.logic().changed).toBe(true));

    act(() => table.logic().revert());

    await waitFor(() => expect(table.logic().changed).toBe(false));
    expect(table.definitions().conditions.values).toEqual({
      [ASKED]: ASKED_CONDITION,
    });
    await act(() => table.save());
    expect(table.stage().conditions).toEqual({ [ASKED]: ASKED_CONDITION });
  });

  describe('when two cells of the stage changed its logic one after the other', () => {
    /** The cell of the stage's name, whose owner is the stage too. */
    const LABEL_EN: Cell = { path: [...STAGE, 'label'], locale: 'en' };
    const FIRST = 0;
    const SECOND = 1;
    const askedJo = {
      rules: [
        {
          ...ASKED_CONDITION.rules[0],
          options: { attribute: NAME, operator: 'EXACTLY', value: 'Jo' },
        },
      ],
    };
    /** The answers that the dynamic attribute on smoking has a version for. */
    const answered = (table: ReturnType<typeof renderTableDefinitions>) => {
      const definition = table.definitions().dynamicAttributes.values[
        SMOKING_WORDING
      ] as { answers: { answer: string }[] };
      return definition.answers.map(({ answer }) => answer);
    };

    /** The first cell changes the rule; the second, the dynamic attribute's logic: it drops the version for non-smokers. */
    const changeBoth = async () => {
      const table = renderTableDefinitions(withLogicBlock, [LABEL_EN]);
      act(() => {
        table.definitions(FIRST).conditions.set({ [ASKED]: askedAlex });
      });
      act(() => {
        const { values } = table.definitions(SECOND).dynamicAttributes;
        const smoking = values[SMOKING_WORDING] as {
          answers: { answer: string }[];
        };
        table.definitions(SECOND).dynamicAttributes.set({
          ...values,
          [SMOKING_WORDING]: {
            ...smoking,
            answers: smoking.answers.filter(({ answer }) => answer === 'true'),
          },
        });
      });
      await waitFor(() => expect(table.logic(SECOND).changed).toBe(true));
      expect(table.logic(FIRST).changed).toBe(true);
      expect(answered(table)).toEqual(['true']);
      return table;
    };

    /** Both cells change the same rule. */
    const changeSameRule = async () => {
      const table = renderTableDefinitions(withLogicBlock, [LABEL_EN]);
      act(() => {
        table.definitions(FIRST).conditions.set({ [ASKED]: askedAlex });
      });
      act(() => {
        table.definitions(SECOND).conditions.set({ [ASKED]: askedJo });
      });
      await waitFor(() => expect(table.logic(SECOND).changed).toBe(true));
      expect(table.logic(FIRST).changed).toBe(true);
      return table;
    };

    it("puts back with Escape in the first cell only that cell's change", async () => {
      const table = await changeBoth();

      act(() => table.logic(FIRST).revert());

      await waitFor(() => expect(table.logic(FIRST).changed).toBe(false));
      expect(table.logic(SECOND).changed).toBe(true);
      expect(table.definitions().conditions.values).toEqual({
        [ASKED]: ASKED_CONDITION,
      });
      expect(answered(table)).toEqual(['true']);
    });

    it("puts back with Escape in the second cell only that cell's change", async () => {
      const table = await changeBoth();

      act(() => table.logic(SECOND).revert());

      await waitFor(() => expect(table.logic(SECOND).changed).toBe(false));
      expect(table.logic(FIRST).changed).toBe(true);
      expect(table.definitions().conditions.values).toEqual({
        [ASKED]: askedAlex,
      });
      expect(answered(table)).toEqual(['true', 'false']);
    });

    it("keeps the second cell's change to the same rule after Escape in the first, and Escape in the second then puts the rule back as it was", async () => {
      const table = await changeSameRule();

      act(() => table.logic(FIRST).revert());

      await waitFor(() => expect(table.logic(FIRST).changed).toBe(false));
      expect(table.logic(SECOND).changed).toBe(true);
      expect(table.definitions().conditions.values).toEqual({
        [ASKED]: askedJo,
      });

      act(() => table.logic(SECOND).revert());

      await waitFor(() => expect(table.logic(SECOND).changed).toBe(false));
      expect(table.definitions().conditions.values).toEqual({
        [ASKED]: ASKED_CONDITION,
      });
    });

    it("puts the same rule back to the first cell's change with Escape in the second, and as it was with Escape in the first", async () => {
      const table = await changeSameRule();

      act(() => table.logic(SECOND).revert());

      await waitFor(() => expect(table.logic(SECOND).changed).toBe(false));
      expect(table.logic(FIRST).changed).toBe(true);
      expect(table.definitions().conditions.values).toEqual({
        [ASKED]: askedAlex,
      });

      act(() => table.logic(FIRST).revert());

      await waitFor(() => expect(table.logic(FIRST).changed).toBe(false));
      expect(table.definitions().conditions.values).toEqual({
        [ASKED]: ASKED_CONDITION,
      });
      await act(() => table.save());
      expect(table.stage().conditions).toEqual({ [ASKED]: ASKED_CONDITION });
    });
  });
});

describe("a version's wording changed in the popover of a dynamic attribute opened from a cell", () => {
  /** The cell of the stage's name, whose owner is the stage too. */
  const LABEL_EN: Cell = { path: [...STAGE, 'label'], locale: 'en' };
  const CONTENT_ES: Cell = { path: CONTENT, locale: 'es' };
  const FIRST = 0;
  const SECOND = 1;
  const MISSING = [...STAGE, 'dynamicAttributes', SMOKING_WORDING, 'missing'];

  /**
   * Writes `wording` in `locale` as the wording of the version for a
   * missing answer, through the popover of the cell at `index`.
   */
  const word = (
    table: ReturnType<typeof renderTableDefinitions>,
    index: number,
    wording: string,
    locale = 'en',
  ) =>
    act(() => {
      const { values, set } = table.definitions(index).dynamicAttributes;
      const smoking = values[SMOKING_WORDING] as {
        missing: Record<string, string>;
      };
      set({
        ...values,
        [SMOKING_WORDING]: {
          ...smoking,
          missing: { ...smoking.missing, [locale]: wording },
        },
      });
    });

  /** The wording for a missing answer, as the cell at `index` sees it. */
  const missingWording = (
    table: ReturnType<typeof renderTableDefinitions>,
    index = 0,
  ) =>
    (
      table.definitions(index).dynamicAttributes.values[SMOKING_WORDING] as {
        missing: Record<string, string>;
      }
    ).missing;

  it("is put back by Escape in that cell, though it is not the cell's own text or logic, and the version's row is unsaved until then", async () => {
    const table = renderTableDefinitions();
    word(table, FIRST, 'someone');

    await waitFor(() => expect(table.logic().revertible).toBe(true));
    expect(table.logic().changed).toBe(false);
    expect(table.cell(MISSING)).toEqual({ text: 'someone', changed: true });

    act(() => table.logic().revert());

    expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
    await waitFor(() => expect(table.logic().revertible).toBe(false));
    expect(missingWording(table)).toEqual({ en: 'you' });
  });

  it('is not a change once the popover writes back what the row had', async () => {
    const table = renderTableDefinitions();
    word(table, FIRST, 'someone');
    await waitFor(() => expect(table.logic().revertible).toBe(true));

    word(table, FIRST, 'you');

    expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
    await waitFor(() => expect(table.logic().revertible).toBe(false));
  });

  describe('when the popovers of two cells changed the same wording, one after the other', () => {
    const changeInBoth = async () => {
      const table = renderTableDefinitions(protocol, [LABEL_EN]);
      word(table, FIRST, 'someone');
      word(table, SECOND, 'anyone');
      await waitFor(() => expect(table.logic(SECOND).revertible).toBe(true));
      expect(table.logic(FIRST).revertible).toBe(true);
      expect(table.cell(MISSING).text).toBe('anyone');
      return table;
    };

    it("shows the first cell's wording after Escape in the second, and the protocol's after Escape in the first", async () => {
      const table = await changeInBoth();

      act(() => table.logic(SECOND).revert());
      expect(table.cell(MISSING)).toEqual({ text: 'someone', changed: true });
      await waitFor(() => expect(table.logic(SECOND).revertible).toBe(false));

      act(() => table.logic(FIRST).revert());
      expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
    });

    it("keeps the second cell's wording after Escape in the first, and shows the protocol's after Escape in the second", async () => {
      const table = await changeInBoth();

      act(() => table.logic(FIRST).revert());
      expect(table.cell(MISSING)).toEqual({ text: 'anyone', changed: true });
      await waitFor(() => expect(table.logic(FIRST).revertible).toBe(false));
      expect(table.logic(SECOND).revertible).toBe(true);

      act(() => table.logic(SECOND).revert());
      expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
    });

    it('saves what is left after Escape in one of them, as one change that one undo takes back', async () => {
      const table = await changeInBoth();
      const before = table.stage();
      act(() => table.logic(SECOND).revert());

      const result = await act(() => table.save());

      expect(result).toEqual({ success: true });
      expect(table.stage().dynamicAttributes?.[SMOKING_WORDING]).toMatchObject({
        missing: { en: 'someone' },
      });
      act(() => {
        table.store.dispatch(timelineActions.undo());
      });
      expect(table.stage()).toEqual(before);
    });
  });

  it("keeps what was typed in the version's row afterwards when Escape is pressed in the cell, and Escape in the row puts back the protocol's", async () => {
    const table = renderTableDefinitions();
    word(table, FIRST, 'someone');
    act(() => table.type(MISSING, 'a person'));

    // The row's own text replaces the popover's wording, so the cell has
    // nothing of it left to put back.
    await waitFor(() => expect(table.logic().revertible).toBe(false));
    act(() => table.logic().revert());
    expect(table.cell(MISSING)).toEqual({ text: 'a person', changed: true });

    act(() =>
      table.form().getState().resetField(translationFieldName(MISSING, 'en')),
    );
    expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
  });

  it('puts back what was typed in the row before the popover changed it, with Escape in the cell', async () => {
    const table = renderTableDefinitions();
    act(() => table.type(MISSING, 'a person'));
    word(table, FIRST, 'someone');
    expect(table.cell(MISSING).text).toBe('someone');

    act(() => table.logic().revert());

    expect(table.cell(MISSING)).toEqual({ text: 'a person', changed: true });
  });

  it("leaves the row as the protocol has it when Escape was pressed in the row first, and Escape in the cell then puts back only the cell's own changes", async () => {
    const table = renderTableDefinitions();
    act(() => table.type(CONTENT, 'Changed text'));
    word(table, FIRST, 'someone');

    act(() =>
      table.form().getState().resetField(translationFieldName(MISSING, 'en')),
    );
    expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
    expect(table.logic().changed).toBe(true);

    act(() => table.logic().revert());

    expect(table.cell(MISSING)).toEqual({ text: 'you', changed: false });
    expect(table.cell(CONTENT).changed).toBe(false);
  });

  it("puts back with Escape in a cell only the wording in that cell's language", async () => {
    const table = renderTableDefinitions(inSpanishToo, [CONTENT_ES]);
    word(table, FIRST, 'someone', 'en');
    word(table, SECOND, 'alguien', 'es');
    expect(table.cell(MISSING, 'es').text).toBe('alguien');

    act(() => table.logic(SECOND).revert());

    expect(table.cell(MISSING, 'es')).toEqual({ text: '', changed: false });
    expect(table.cell(MISSING, 'en')).toEqual({
      text: 'someone',
      changed: true,
    });
    expect(missingWording(table)).toEqual({ en: 'someone' });
  });
});

describe('a dynamic attribute created in a language that is not the default', () => {
  const create = (table: ReturnType<typeof renderTableDefinitions>) => {
    act(() => {
      table.definitions().conditions.set({ [ASKED]: ASKED_CONDITION });
    });
    act(() => {
      table.definitions().dynamicAttributes.set({
        ...table.definitions().dynamicAttributes.values,
        [GREETING]: SPANISH_GREETING,
      });
    });
  };
  const spanish = [
    `# Sobre usted, {${GREETING_NAME}}`,
    fieldBlockMarkdown(NAME_FIELD),
  ].join('\n\n');

  it('is saved with no wording in the default language, when only its own language shows it', async () => {
    const table = renderTableDefinitions(inSpanishToo);
    create(table);
    act(() => table.type(CONTENT, spanish, 'es'));

    const result = await act(() => table.save());

    expect(result).toEqual({ success: true });
    expect(table.stage().dynamicAttributes).toHaveProperty(
      GREETING,
      SPANISH_GREETING,
    );
  });

  it('lacks wording in the default language, said in the cell whose text shows it there', async () => {
    const table = renderTableDefinitions(inSpanishToo);
    create(table);
    act(() => table.type(CONTENT, spanish, 'es'));
    act(() =>
      table.type(
        CONTENT,
        [
          `# About {${SMOKING_WORDING_NAME}}, {${GREETING_NAME}}`,
          fieldBlockMarkdown(NAME_FIELD),
        ].join('\n\n'),
      ),
    );

    const result = await act(() => table.save());
    expect(result).toEqual({
      success: false,
      formErrors: [],
      fieldErrors: {
        [translationFieldName(CONTENT, 'en')]: [
          'A dynamic attribute in this translation has no wording in en for some of its versions. Select the dynamic attribute to write the missing wording.',
        ],
      },
    });
    expect(table.stage().dynamicAttributes).not.toHaveProperty(GREETING);
  });
});

describe('a saved dynamic attribute whose versions have wording in a language that is not the default', () => {
  /** The protocol, whose Spanish text alone shows a dynamic attribute with Spanish wording. */
  const withSpanishGreeting = (() => {
    const seeded = structuredClone(inSpanishToo) as unknown as {
      stages: [
        {
          conditions?: unknown;
          dynamicAttributes: Record<string, unknown>;
          form: { content: Record<string, string> };
        },
      ];
    };
    const [stage] = seeded.stages;
    stage.conditions = { [ASKED]: ASKED_CONDITION };
    stage.dynamicAttributes[GREETING] = SPANISH_GREETING;
    stage.form.content.es = [
      `# Sobre usted, {${GREETING_NAME}}`,
      fieldBlockMarkdown(NAME_FIELD),
    ].join('\n\n');
    return seeded as unknown as CurrentProtocol;
  })();

  it("says in each version's own row which language needs wording, once the default language's text shows it", async () => {
    const table = renderTableDefinitions(withSpanishGreeting);
    act(() =>
      table.type(
        CONTENT,
        [
          `# About {${SMOKING_WORDING_NAME}}, {${GREETING_NAME}}`,
          fieldBlockMarkdown(NAME_FIELD),
        ].join('\n\n'),
      ),
    );

    const result = await act(() => table.save());

    const needs =
      'Participants who read en see this dynamic attribute, so this version needs wording in en.';
    const at = (...version: (string | number)[]) =>
      translationFieldName(
        [...STAGE, 'dynamicAttributes', GREETING, ...version],
        'en',
      );
    expect(result).toEqual({
      success: false,
      formErrors: [],
      fieldErrors: {
        [at('cases', 0, 'wording')]: [needs],
        [at('otherwise')]: [needs],
      },
    });
  });
});
