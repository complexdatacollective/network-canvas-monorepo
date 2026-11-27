import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fieldBlockMarkdown } from '@codaco/protocol-validation';

import { writeInto } from '../../../editors/__tests__/writeInto.ts';
import {
  fixtureTypeId,
  fixtureVariableId,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import FormDocumentSection from '../FormDocumentSection.tsx';
import {
  attributeRow,
  blockFor,
  caretInQuestion,
  formEditor,
  insertPicker,
} from './formDocumentTesting.ts';

const PERSON = fixtureTypeId('node', 'person');
const AGE = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'age');

const FIXTURE = loadFixtureStage('alter-form-1');
const FIXTURE_FORM = FIXTURE.fields.form as Readonly<{
  content: Readonly<Record<string, string>>;
  fields: readonly Readonly<{ id: string; variable: string }>[];
}>;
const [FIRST_FIELD] = FIXTURE_FORM.fields;

const openForm = async () => {
  const harness = renderStageEditor({
    stageId: 'alter-form-1',
    sections: <FormDocumentSection subject="node" />,
  });
  await harness.opened();
  const editor = await formEditor();
  return { harness, editor };
};

const fieldBlocks = (editor: HTMLElement) =>
  editor.querySelectorAll('[data-field-block-view]');

// Widths that tell the Field button and a field's block apart, as what the
// list stands beside: jsdom draws nothing, so every element is otherwise
// 0 by 0.
const FIELD_BUTTON_WIDTH = 87;
const BLOCK_WIDTH = 640;

/** Gives the Field button and the field blocks the widths above. */
const measureAnchors = () => {
  const measure = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function boundingRect(this: HTMLElement) {
      if (this.hasAttribute('data-insert-field')) {
        return new DOMRect(0, 0, FIELD_BUTTON_WIDTH, 32);
      }
      // The block's frame, or the node view that the editor draws it in.
      if (
        this.hasAttribute('data-field-block-view') ||
        this.querySelector(':scope > [data-field-block-view]') !== null
      ) {
        return new DOMRect(0, 100, BLOCK_WIDTH, 120);
      }
      return measure.call(this);
    },
  );
};

/** The width of the element that the list of `picker` stands beside. */
const anchorWidthOf = (picker: HTMLElement) =>
  picker.parentElement?.style.getPropertyValue('--anchor-width');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the attribute list of a new field', () => {
  it('stands beside the Field button when the button put the field in', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);

    measureAnchors();

    await harness.user.click(screen.getByRole('button', { name: 'Field' }));

    const picker = await insertPicker();
    await waitFor(() =>
      expect(anchorWidthOf(picker)).toBe(`${FIELD_BUTTON_WIDTH}px`),
    );
    expect(fieldBlocks(editor)).toHaveLength(3);
  });

  it('stands beside the new block when Mod-Shift-F put the field in', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);

    measureAnchors();

    // jsdom is not a Mac, so Mod is Control.
    await harness.user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');

    const picker = await insertPicker();
    await waitFor(() => expect(anchorWidthOf(picker)).toBe(`${BLOCK_WIDTH}px`));
    const newBlock = picker.getAttribute('data-field-insert-picker');
    expect(
      editor.querySelector(`[data-field-id="${newBlock ?? ''}"]`),
    ).not.toBeNull();
  });

  it('takes away the new field when it is dismissed untouched', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);
    await harness.user.click(screen.getByRole('button', { name: 'Field' }));
    await insertPicker();
    expect(fieldBlocks(editor)).toHaveLength(3);

    await harness.user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(fieldBlocks(editor)).toHaveLength(2));
    const saved = await harness.submit();
    expect(saved?.stageDocument.form).toEqual(FIXTURE_FORM);
  });

  it('dims each attribute that cannot be chosen, with the reason under it', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);
    await harness.user.click(screen.getByRole('button', { name: 'Field' }));

    const taken = await attributeRow('relationship_to_ego');
    expect(taken).toHaveAttribute('aria-disabled', 'true');
    expect(taken).toHaveTextContent(
      'Another field on this stage already uses this attribute.',
    );
    const layout = await attributeRow('layout');
    expect(layout).toHaveAttribute('aria-disabled', 'true');
    expect(layout).toHaveTextContent(
      'A form cannot collect Layout attributes.',
    );
    const age = await attributeRow('age');
    expect(age).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('gives the new field the attribute chosen, which the save writes', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);
    await harness.user.click(screen.getByRole('button', { name: 'Field' }));

    await harness.user.click(await attributeRow('age'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const added = [...fieldBlocks(editor)].find(
      (frame) =>
        !FIXTURE_FORM.fields.some(
          (field) => field.id === frame.getAttribute('data-field-id'),
        ),
    );
    if (added === undefined) throw new Error('No field was added.');
    expect(within(added as HTMLElement).getByText('age')).toBeInTheDocument();
    // The caret is in the new field's question, where the next words go.
    await harness.user.keyboard('How old are they?');

    const saved = await harness.submit();
    const fields = (
      saved?.stageDocument.form as
        | Readonly<{ fields: readonly Record<string, unknown>[] }>
        | undefined
    )?.fields;
    expect(fields?.at(-1)).toEqual({
      id: added.getAttribute('data-field-id'),
      variable: AGE,
      prompt: { 'en-US': 'How old are they?' },
    });
  });

  it('keeps a field with a question when dismissed, and refuses to save it without an attribute', async () => {
    const unfinished = testId('field/unfinished');
    const harness = renderStageEditor({
      stage: {
        ...FIXTURE,
        fields: {
          ...FIXTURE.fields,
          form: {
            content: {
              'en-US': `${FIXTURE_FORM.content['en-US'] ?? ''}\n\n${fieldBlockMarkdown(unfinished)}`,
            },
            fields: [
              ...FIXTURE_FORM.fields,
              {
                id: unfinished,
                variable: '',
                prompt: { 'en-US': 'Where did you meet?' },
              },
            ],
          },
        },
      },
      sections: <FormDocumentSection subject="node" />,
    });
    await harness.opened();
    const editor = await formEditor();

    await harness.user.click(
      within(blockFor(editor, unfinished)).getByRole('button', {
        name: 'Choose an attribute',
      }),
    );
    expect(await insertPicker()).toHaveAttribute('data-picker-origin', 'block');
    await harness.user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(blockFor(editor, unfinished)).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Choose an attribute for this field.'),
    ).toBeInTheDocument();
  });
});

/**
 * Asks for a new attribute named `name` of `type` in the list of a field put
 * in from the Field button.
 */
const createIn = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
  type: string,
) => {
  await harness.user.click(screen.getByRole('button', { name: 'Field' }));
  const picker = await insertPicker();
  await harness.user.type(within(picker).getByRole('combobox'), name);
  await harness.user.click(
    await within(picker).findByRole('option', {
      name: new RegExp(`Create “${name}”`),
    }),
  );
  // jsdom puts no space between the type's name and its description.
  await harness.user.click(
    await within(await insertPicker()).findByRole('button', {
      name: new RegExp(`^${type}`),
    }),
  );
};

describe('a new attribute of a type with options', () => {
  it.each(['Categorical', 'Ordinal', 'Scalar'])(
    'opens the codebook editor for a %s attribute',
    async (type) => {
      const { harness, editor } = await openForm();
      if (FIRST_FIELD === undefined) {
        throw new Error('The fixture has no field.');
      }
      await caretInQuestion(harness, editor, FIRST_FIELD.id);
      await createIn(harness, 'favourite_colour', type);

      // The codebook's own editor asks for the rest of the attribute, and
      // the new field waits for it.
      expect(
        await screen.findByRole('dialog', { name: /favourite_colour/ }),
      ).toBeVisible();
      expect(fieldBlocks(editor)).toHaveLength(3);
    },
  );

  it('makes the attribute with the first control its type offers, which a form needs', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) {
      throw new Error('The fixture has no field.');
    }
    await caretInQuestion(harness, editor, FIRST_FIELD.id);
    await createIn(harness, 'favourite_colour', 'Categorical');
    await screen.findByRole('dialog', { name: /favourite_colour/ });
    for (const [index, [label, value]] of [
      ['Red', 'red'],
      ['Blue', 'blue'],
    ].entries()) {
      const position = index + 1;
      await harness.user.click(
        screen.getByRole('button', { name: 'Create new option' }),
      );
      await writeInto(
        harness,
        screen.getByRole('textbox', { name: `Option ${position} label` }),
        label ?? '',
      );
      await writeInto(
        harness,
        screen.getByRole('textbox', { name: `Option ${position} value` }),
        value ?? '',
      );
    }
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /favourite_colour/ }),
      ).not.toBeInTheDocument(),
    );

    const created = Object.values(
      harness.editorCodebook().node?.[PERSON]?.variables ?? {},
    ).find((variable) => variable.name === 'favourite_colour');
    expect(created).toMatchObject({
      type: 'categorical',
      component: 'CheckboxGroup',
    });
  });

  it('opens the codebook editor for the first attribute of the participant', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <FormDocumentSection subject="ego" />,
    });
    await harness.opened();
    // The protocol has asked the participant nothing yet, so it has no
    // section for the participant's attributes.
    act(() => harness.receiveCodebookUpdate({ ego: null }));
    expect(
      Object.keys(harness.protocolSections()).some((id) => id.includes('Ego')),
    ).toBe(false);
    const editor = await formEditor();
    await harness.user.click(editor);

    await createIn(harness, 'favourite_colour', 'Categorical');

    expect(
      await screen.findByRole('dialog', { name: /favourite_colour/ }),
    ).toBeVisible();
  });
});

/** The block of the field that the test put in. */
const newBlockIn = (editor: HTMLElement): HTMLElement => {
  const added = [...fieldBlocks(editor)].find(
    (frame) =>
      !FIXTURE_FORM.fields.some(
        (field) => field.id === frame.getAttribute('data-field-id'),
      ),
  );
  if (!(added instanceof HTMLElement)) throw new Error('No field was added.');
  return added;
};

describe('a new attribute that a name and a type finish', () => {
  it('is made with its type, and the new field collects it', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);
    await createIn(harness, 'nickname', 'Text');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
      ).toBeNull(),
    );
    const created = Object.entries(
      harness.editorCodebook().node?.[PERSON]?.variables ?? {},
    ).find(([, variable]) => variable.name === 'nickname');
    expect(created?.[1]).toMatchObject({ type: 'text', component: 'Text' });
    expect(created).toBeDefined();
    const added = newBlockIn(editor);
    expect(added).not.toHaveAttribute('data-indeterminate');
    expect(within(added).getByText('nickname')).toBeVisible();
  });

  it('can be made with the keyboard alone', async () => {
    const { harness, editor } = await openForm();
    if (FIRST_FIELD === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, FIRST_FIELD.id);
    await harness.user.click(screen.getByRole('button', { name: 'Field' }));
    const picker = await insertPicker();
    const search = within(picker).getByRole('combobox');
    await waitFor(() => expect(search).toHaveFocus());

    await harness.user.keyboard('nickname');
    await within(picker).findByRole('option', { name: /Create “nickname”/ });
    await harness.user.keyboard('{ArrowDown}{Enter}');

    // The type step takes the keyboard, and Back gives it to the search box.
    const text = await within(picker).findByRole('button', { name: /^Text/ });
    await waitFor(() => expect(text).toHaveFocus());
    await harness.user.keyboard('{Shift>}{Tab}{/Shift}{Enter}');
    await waitFor(() =>
      expect(within(picker).getByRole('combobox')).toHaveFocus(),
    );
    await harness.user.keyboard('nickname');
    await within(picker).findByRole('option', { name: /Create “nickname”/ });
    await harness.user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(
        within(picker).getByRole('button', { name: /^Text/ }),
      ).toHaveFocus(),
    );
    await harness.user.keyboard('{Enter}');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
      ).toBeNull(),
    );
    const created = Object.entries(
      harness.editorCodebook().node?.[PERSON]?.variables ?? {},
    ).find(([, variable]) => variable.name === 'nickname');
    expect(created).toBeDefined();
    expect(within(newBlockIn(editor)).getByText('nickname')).toBeVisible();
  });
});
