import { fireEvent, screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import BuilderSection from '../../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { createStageDraftProbe } from '../../__tests__/stageDraftProbe.tsx';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import ProtocolField from '../../ProtocolField.tsx';
import DialogArrayField from '../DialogArrayField.tsx';
import Options, { optionsValidation } from '../Options.tsx';
import { promptItemLabel } from './itemLabel.ts';

type Prompt = { id: string; text: string };
type HarnessUser = ReturnType<typeof userEvent.setup>;

const rowsOf = (value: unknown): Prompt[] =>
  Array.isArray(value) ? (value as Prompt[]) : [];

function PromptPreview({ text }: Record<string, unknown>) {
  return <span>{typeof text === 'string' ? text : ''}</span>;
}

function PromptFields({ item }: Record<string, unknown>) {
  const row = (item ?? {}) as Partial<Prompt>;
  return (
    <Field
      name="text"
      label="Prompt text"
      component={InputField}
      initialValue={row.text ?? ''}
    />
  );
}

/**
 * One list, in a real stage editor, over the stage key the call names.
 *
 * `prompts` and `tags` are not keys an Information page's schema declares, so
 * nothing here is saved: what an edit reached is read out of the document the
 * editor is holding, which is the value a save would assemble.
 */
function renderList(
  fields: SectionDoc,
  list: React.ReactNode,
  title = 'Prompts',
) {
  const { probe, draft } = createStageDraftProbe();
  const harness = renderStageEditor({
    stage: { type: 'Information', fields },
    sections: (
      <>
        <BuilderSection title="Page content">
          {probe}
          <ProtocolField
            name="title"
            label="Page heading"
            component={InputField}
          />
        </BuilderSection>
        <BuilderSection title={title}>{list}</BuilderSection>
      </>
    ),
  });
  return { harness, draft };
}

const promptList = (
  <ProtocolArrayField
    name="prompts"
    label="Prompts"
    component={DialogArrayField}
    addButtonLabel="Create new prompt"
    editorTitle="Edit prompt"
    addTitle="Add prompt"
    itemLabel={promptItemLabel}
    previewComponent={PromptPreview}
    editorFieldsComponent={PromptFields}
  />
);

/**
 * Removes the row at `index` through its own confirmation.
 *
 * The confirmation's button carries the same accessible name as the row's — it
 * IS the row's confirmation, and names the same thing. They are told apart by
 * the modal: while it is open the list behind it is hidden from assistive
 * technology, so exactly one control by that name is reachable, and waiting for
 * that is also what proves the confirmation opened.
 */
async function removeRow(user: HarnessUser, index: number) {
  await user.click(
    screen.getAllByRole('button', { name: 'Remove prompt' })[index]!,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Remove prompt' }),
  );
}

describe('a list bound to a stage document key', () => {
  const threePrompts = {
    title: 'Welcome',
    items: [],
    label: 'Welcome',
    prompts: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Bravo' },
      { id: 'c', text: 'Charlie' },
    ],
  };

  it('removes the row the researcher confirmed and leaves the rest', async () => {
    const { harness, draft } = renderList(threePrompts, promptList);

    await screen.findByText('Bravo');
    await removeRow(harness.user, 1);

    await waitFor(() =>
      expect(rowsOf(draft().prompts).map(({ id }) => id)).toEqual(['a', 'c']),
    );
  });

  it('leaves every surviving row bound to its own values', async () => {
    const { harness } = renderList(threePrompts, promptList);

    await screen.findByText('Bravo');
    await removeRow(harness.user, 1);
    await waitFor(() => expect(screen.queryByText('Bravo')).toBeNull());

    // The row that has taken the deleted one's place must still edit ITSELF.
    // A dialog opening on Alpha here is the relabelling this whole seam exists
    // to prevent.
    await harness.user.click(
      screen.getAllByRole('button', { name: 'Edit prompt' })[1]!,
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
        'Charlie',
      ),
    );
  });

  it('does not disturb the rest of the editor when a row is added', async () => {
    const { harness, draft } = renderList(
      { title: 'Welcome', items: [], label: 'Welcome', prompts: [] },
      promptList,
    );

    // Something typed and not yet saved. Adding a prompt is a structural write
    // to the same document, and it must reach it without going near the
    // controls the researcher is working in.
    const heading = await screen.findByRole('textbox', {
      name: 'Page heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'Half-written heading');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });
    await harness.user.type(text, 'First prompt');
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(rowsOf(draft().prompts).map(({ text: value }) => value)).toEqual([
        'First prompt',
      ]),
    );
    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      'Half-written heading',
    );
  });
});

/**
 * The same list, kept where a stage that holds a whole form keeps it.
 *
 * A Family Pedigree's family-member form lives at `nodeConfig.form`, beside the
 * node type and the variable slots the tree is drawn from. Synthetic here — the
 * rows are the prompts above, so this is the SAME editor at a different place,
 * and the only thing under test is where its edits land.
 */
const nestedPromptList = (
  <ProtocolArrayField
    name="nodeConfig.form"
    label="Prompts"
    component={DialogArrayField}
    addButtonLabel="Create new prompt"
    editorTitle="Edit prompt"
    addTitle="Add prompt"
    itemLabel={promptItemLabel}
    previewComponent={PromptPreview}
    editorFieldsComponent={PromptFields}
    sortable
  />
);

const NODE_CONFIG = {
  type: 'family_member',
  nodeLabelVariable: 'fm_name',
  form: [
    { id: 'a', text: 'Alpha' },
    { id: 'b', text: 'Bravo' },
  ],
};

const nestedFormOf = (nodeConfig: unknown): Prompt[] => {
  const form =
    nodeConfig !== null &&
    typeof nodeConfig === 'object' &&
    'form' in nodeConfig
      ? nodeConfig.form
      : undefined;
  return rowsOf(form);
};

const addPrompt = async (user: HarnessUser, text: string) => {
  await user.click(
    await screen.findByRole('button', { name: 'Create new prompt' }),
  );
  await user.type(
    await screen.findByRole('textbox', { name: 'Prompt text' }),
    text,
  );
  await user.click(screen.getByRole('button', { name: 'Add' }));
};

describe('a list the stage keeps at a nested path', () => {
  it('writes each row operation at that path, not at the key above it', async () => {
    const { harness, draft } = renderList(
      {
        title: 'Welcome',
        items: [],
        label: 'Welcome',
        nodeConfig: { ...NODE_CONFIG },
      },
      nestedPromptList,
      'Family members',
    );

    await screen.findByText('Bravo');
    await addPrompt(harness.user, 'Charlie');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Prompt text' })).toBeNull(),
    );

    // The keyboard half of the drag handle, which commits the same operation
    // the pointer drag does.
    const handle = await screen.findByRole('button', {
      name: 'Reorder prompt 3 of 3',
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    await waitFor(() =>
      expect(
        nestedFormOf(draft().nodeConfig).map((prompt) => prompt.text),
      ).toEqual(['Alpha', 'Charlie', 'Bravo']),
    );

    await removeRow(harness.user, 2);
    await waitFor(() => expect(screen.queryByText('Bravo')).toBeNull());

    // Every edit landed inside the list, and the keys beside it are exactly as
    // the stage held them. Addressed at `nodeConfig` instead, each of the three
    // could only have said "the node configuration is now this" — which needs
    // every other slot on screen to be able to say even that.
    await waitFor(() =>
      expect(draft().nodeConfig).toEqual({
        type: 'family_member',
        nodeLabelVariable: 'fm_name',
        form: [
          { id: 'a', text: 'Alpha' },
          { id: expect.any(String) as unknown as string, text: 'Charlie' },
        ],
      }),
    );
  });

  /**
   * The same rule `readArray` states for the list's own key, asked of the way
   * to it: an import, a migration or a legacy protocol can leave an ancestor
   * as a string, a number or a list, and then nothing under it is reachable at
   * all — `set`, `insertItem`, `removeItem` and `moveItem` alike throw on the
   * way past it, out of the click that asked for the row.
   */
  it.each([
    ['a string', 'family_member'],
    ['a number', 42],
    ['nothing at all', null],
    ['a list', [{ id: 'a', text: 'Alpha' }]],
  ])('replaces an ancestor left as %s', async (_shape, held) => {
    const { harness, draft } = renderList(
      { title: 'Welcome', items: [], label: 'Welcome', nodeConfig: held },
      nestedPromptList,
      'Family members',
    );

    // The list reads as absent, so the researcher is shown an empty list with
    // a working Add button — and the click behind it has to make the document
    // hold the list it has been showing.
    await addPrompt(harness.user, 'Charlie');

    await waitFor(() =>
      expect(
        nestedFormOf(draft().nodeConfig).map((prompt) => prompt.text),
      ).toEqual(['Charlie']),
    );
  });

  /**
   * An ancestor that is simply not there needs no repair: the engine creates
   * the containers on the way to a write, exactly as it does for a top-level
   * key that does not exist yet.
   */
  it('adds the first row under an ancestor the document has not got', async () => {
    const { harness, draft } = renderList(
      { title: 'Welcome', items: [], label: 'Welcome' },
      nestedPromptList,
      'Family members',
    );

    await addPrompt(harness.user, 'Charlie');

    await waitFor(() =>
      expect(
        nestedFormOf(draft().nodeConfig).map((prompt) => prompt.text),
      ).toEqual(['Charlie']),
    );
  });
});

describe('array-level validation', () => {
  it('refuses a save the rows could only have complained about', async () => {
    const seeded = {
      title: 'Welcome',
      items: [],
      label: 'Welcome',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'Yes', value: 'no' },
      ],
    };
    const { harness } = renderList(
      seeded,
      <ProtocolArrayField
        name="options"
        label="Options"
        component={Options}
        addButtonLabel="Create new option"
        {...optionsValidation}
      />,
      'Options',
    );

    await screen.findByRole('button', { name: 'Create new option' });
    expect(await harness.submit()).toBeNull();

    // A row's own duplicate-label error can only be displayed; this is the
    // rule that actually stops the protocol being saved with it.
    expect(
      await screen.findByText('Every option needs a unique label.'),
    ).toBeInTheDocument();
    expect(
      harness.protocolSections()[
        sectionId({ kind: 'stage', stageId: harness.seeded.id })
      ],
    ).toEqual({ id: harness.seeded.id, type: 'Information', ...seeded });
  });
});

const TAGS = [
  { label: 'Alpha', value: 'alpha' },
  { label: 'Bravo', value: 'bravo' },
];

/**
 * Removes the option at `index` through its own confirmation, which names the
 * item type rather than the row — see `removeRow` for why the two names are
 * told apart by the modal rather than by the wording.
 */
async function removeOption(user: HarnessUser, index: number) {
  await user.click(
    await screen.findByRole('button', { name: `Remove option ${index + 1}` }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Remove option' }),
  );
}

describe('a list whose name is not a document key', () => {
  it('leaves the list around it alone when it is held inside another list', async () => {
    const seeded = {
      title: 'Welcome',
      items: [],
      label: 'Welcome',
      prompts: [{ id: 'a', text: 'Alpha', tags: TAGS }],
    };
    const { harness, draft } = renderList(
      seeded,
      <ProtocolArrayField
        name="prompts[0].tags"
        label="Tags"
        component={Options}
        addButtonLabel="Create new tag"
      />,
      'Tags',
    );

    // The command vocabulary addresses a document KEY and cannot reach inside
    // a prompt, so this list is an ordinary form value. Taking the first
    // segment as the key would not merely miss: it would write these tag rows
    // into `prompts`.
    await removeOption(harness.user, 0);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Remove option 2' }),
      ).toBeNull(),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new tag' }),
    );
    await screen.findByRole('button', { name: 'Remove option 2' });

    const prompts = rowsOf(draft().prompts);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.text).toBe('Alpha');
  });
});

function PromptFieldsWithTags({ item }: Record<string, unknown>) {
  const row = (item ?? {}) as Partial<Prompt>;
  return (
    <>
      <Field
        name="text"
        label="Prompt text"
        component={InputField}
        initialValue={row.text ?? ''}
      />
      {/* A name a document key COULD be spelled with, so the only thing that
          can tell this list it is not one is the store it was mounted in. */}
      <ProtocolArrayField
        name="tags"
        label="Tags"
        component={Options}
        addButtonLabel="Create new tag"
      />
    </>
  );
}

describe('a list rendered inside a row dialog', () => {
  it('writes nothing to the stage until the dialog saves', async () => {
    const seeded = {
      title: 'Welcome',
      items: [],
      label: 'Welcome',
      prompts: [{ id: 'a', text: 'Alpha' }],
    };
    const { harness, draft } = renderList(
      seeded,
      <ProtocolArrayField
        name="prompts"
        label="Prompts"
        component={DialogArrayField}
        addButtonLabel="Create new prompt"
        editorTitle="Edit prompt"
        addTitle="Add prompt"
        itemLabel={promptItemLabel}
        previewComponent={PromptPreview}
        editorFieldsComponent={PromptFieldsWithTags}
      />,
    );

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new tag' }),
    );
    // The row really was added to the list on screen — the dialog is still
    // holding it, and the researcher can still cancel out of it.
    await screen.findByRole('button', { name: 'Remove option 1' });

    // Writing it to the stage document now would commit half of an edit that
    // has not been agreed to yet.
    expect(draft().prompts).toEqual(seeded.prompts);
  });
});
