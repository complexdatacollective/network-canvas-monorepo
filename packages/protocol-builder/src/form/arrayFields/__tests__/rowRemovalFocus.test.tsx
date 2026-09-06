import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import { DialogFormField } from '../../DialogForm.tsx';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import DialogArrayField from '../DialogArrayField.tsx';
import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../MultiSelect.tsx';
import Options, { optionsValidation } from '../Options.tsx';

/**
 * Where a row's removal confirm sends focus, asked of the confirm itself.
 *
 * The answer cannot be read off `document.activeElement` here: Base UI decides
 * a return target inside its own popup teardown, and that teardown does not
 * run under jsdom — focus simply stays wherever the removed control left it,
 * whether or not a target was named. A test written against the focused
 * element therefore passes identically with the target present and absent,
 * which is no test at all.
 *
 * So the confirm is captured instead. What these tests hold is everything this
 * package owns: that every row type names a target, and that the target it
 * names is the right element once the row is gone.
 */
type CapturedConfirm = {
  finalFocus?: unknown;
  onConfirm?: () => void;
};

const confirms = vi.hoisted(() => [] as CapturedConfirm[]);

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({
    confirm: (options: CapturedConfirm) => {
      confirms.push(options);
      return Promise.resolve(true);
    },
  }),
}));

beforeEach(() => {
  confirms.length = 0;
});

/** The confirm the row just opened, and the target it named. */
const lastConfirm = () => {
  const confirm = confirms.at(-1);
  expect(confirm).toBeDefined();
  return confirm!;
};

const focusTarget = () => {
  const { finalFocus } = lastConfirm();
  // A function, not an element: the row that takes this one's place does not
  // exist until the removal has landed, so an element resolved when the
  // confirm opened would be the wrong one — or a dead one.
  expect(typeof finalFocus).toBe('function');
  return (finalFocus as () => HTMLElement | null)();
};

/** Answers the confirm the way the researcher's Remove click would. */
const confirmRemoval = async () => {
  const { onConfirm } = lastConfirm();
  expect(onConfirm).toBeDefined();
  act(() => {
    onConfirm!();
  });
};

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Row removal focus test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function renderInShell(
  session: ProtocolBuilderSessionStore,
  children: ReactNode,
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="List">{children}</BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

const SORT_PROPERTIES: PropertyField[] = [
  { fieldName: 'property', control: 'input' },
  { fieldName: 'direction', control: 'input' },
];

const SORT_VALIDATION = makeMultiSelectValidation(SORT_PROPERTIES);
const NO_OPTIONS = () => [];

function PromptPreview({ text }: Record<string, unknown>) {
  return <span>{typeof text === 'string' ? text : ''}</span>;
}

function PromptFields() {
  return (
    <DialogFormField name="text" label="Prompt text" component={InputField} />
  );
}

describe('a row removal confirm', () => {
  it('names the option that takes the removed one’s place', async () => {
    const user = userEvent.setup();
    const session = createSession({
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
        { label: 'Charlie', value: 'charlie' },
      ],
    });
    renderInShell(
      session,
      <ProtocolArrayField
        name="options"
        label="Answer options"
        component={Options}
        addButtonLabel="Create new option"
        {...optionsValidation}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 2' }),
    );
    await confirmRemoval();
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.options).toHaveLength(
        2,
      ),
    );

    // The row that has moved up into the removed one's place, which is where
    // the researcher was already looking. Options are named by position, so
    // that row is now the one called "Remove option 2".
    expect(focusTarget()).toBe(
      screen.getByRole('button', { name: 'Remove option 2' }),
    );
  });

  it('names the control that asked when the option is still there', async () => {
    const user = userEvent.setup();
    const session = createSession({
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
    });
    renderInShell(
      session,
      <ProtocolArrayField
        name="options"
        label="Answer options"
        component={Options}
        addButtonLabel="Create new option"
        {...optionsValidation}
      />,
    );

    const opener = await screen.findByRole('button', {
      name: 'Remove option 2',
    });
    await user.click(opener);

    // Declined, so nothing was removed and the control that opened the confirm
    // is both still there and where focus belongs.
    expect(focusTarget()).toBe(opener);
  });

  it('names the add button when the last option is removed', async () => {
    const user = userEvent.setup();
    const session = createSession({
      options: [{ label: 'Alpha', value: 'alpha' }],
    });
    renderInShell(
      session,
      <ProtocolArrayField
        name="options"
        label="Answer options"
        component={Options}
        addButtonLabel="Create new option"
        {...optionsValidation}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 1' }),
    );
    await confirmRemoval();
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.options).toHaveLength(
        0,
      ),
    );

    // An emptied list has no row to hand focus to. Answering nothing here is
    // what leaves focus on `<body>`, which Base UI resolves to the first
    // tabbable element in the document — the page header.
    expect(focusTarget()).toBe(
      screen.getByRole('button', { name: 'Create new option' }),
    );
  });

  it('names the surviving row of a list whose rows are all called the same thing', async () => {
    const user = userEvent.setup();
    const session = createSession({
      sortOrder: [
        { property: 'name', direction: 'asc' },
        { property: 'age', direction: 'desc' },
      ],
    });
    renderInShell(
      session,
      <ProtocolArrayField
        name="sortOrder"
        label="Sort order"
        component={MultiSelect}
        addButtonLabel="Add new sort rule"
        properties={SORT_PROPERTIES}
        options={NO_OPTIONS}
        {...SORT_VALIDATION}
      />,
    );

    const [firstRemove] = await screen.findAllByRole('button', {
      name: 'Remove item',
    });
    await user.click(firstRemove!);
    await confirmRemoval();
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.sortOrder).toHaveLength(
        1,
      ),
    );

    // Every row of a MultiSelect names its Remove control identically, so the
    // row that took this one's place can only be found by its position in the
    // list the confirm was opened from.
    const remaining = screen.getByRole('button', { name: 'Remove item' });
    expect(focusTarget()).toBe(remaining);
    expect(remaining).not.toBe(firstRemove);
  });

  it('names the prompt that takes the removed one’s place', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
        { id: 'c', text: 'Charlie' },
      ],
    });
    renderInShell(
      session,
      <ProtocolArrayField
        name="prompts"
        label="Prompts"
        component={DialogArrayField}
        addButtonLabel="Create new prompt"
        editorTitle="Edit prompt"
        itemLabel="prompt"
        previewComponent={PromptPreview}
        editorFieldsComponent={PromptFields}
      />,
    );

    const removes = await screen.findAllByRole('button', {
      name: 'Remove prompt',
    });
    await user.click(removes[1]!);
    await confirmRemoval();
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.prompts).toHaveLength(
        2,
      ),
    );

    const remaining = screen.getAllByRole('button', { name: 'Remove prompt' });
    expect(focusTarget()).toBe(remaining[1]);
  });
});
