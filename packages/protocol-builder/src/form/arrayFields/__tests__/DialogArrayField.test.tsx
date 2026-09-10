import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { createElement, useContext, useState, type ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DialogModule from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { createStageDraftProbe } from '../../__tests__/stageDraftProbe.tsx';
import { DialogFormField } from '../../DialogForm.tsx';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import DialogArrayField, {
  type DialogArrayEditorValidate,
} from '../DialogArrayField.tsx';
import {
  ArrayFieldBindingContext,
  useArrayFieldCommands,
} from '../useArrayFieldCommands.ts';
import { promptItemLabel } from './itemLabel.ts';

/**
 * `layoutId` is a Motion prop, so it leaves no trace in the DOM: what the row
 * editor has to prove is that the dialog RECEIVED the row's identity, which is
 * what this records. Fresco's own `Dialog` still renders — the mock is a
 * passthrough — so every test in this file exercises the real component.
 */
const dialogRenders = vi.hoisted(() =>
  vi.fn<(props: { layoutId?: string }) => void>(),
);

vi.mock('@codaco/fresco-ui/dialogs/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof DialogModule>();
  const RealDialog = actual.default;
  return {
    ...actual,
    default: (props: DialogModule.DialogProps) => {
      dialogRenders(props);
      return createElement(RealDialog, props);
    },
  };
});

beforeEach(() => {
  dialogRenders.mockClear();
});

type Prompt = { id: string; text: string };
type HarnessUser = ReturnType<typeof userEvent.setup>;

function PromptPreview({ text }: Record<string, unknown>) {
  return <span>{typeof text === 'string' ? text : ''}</span>;
}

/**
 * States no `initialValue` of its own: the row's value has to arrive through
 * the dialog, which is the seam the editor is wired on.
 */
function PromptFields() {
  return (
    <DialogFormField name="text" label="Prompt text" component={InputField} />
  );
}

/** The optional pane beside the fields, for the row the dialog opened on. */
function PromptEditorPreview({ text }: Record<string, unknown>) {
  return <span>Preview of {typeof text === 'string' ? text : ''}</span>;
}

type Rule = { id: string; label: string };

const NEW_RULE: Rule = { id: 'rule-1', label: 'New rule' };

/**
 * A minimal stand-in for production's `MultiSelect`/`Options`: it calls
 * `useArrayFieldCommands` itself rather than being wrapped in its own
 * `ProtocolArrayField`, so it inherits whatever `ArrayFieldBindingContext` is
 * ambient at the point it renders. That is exactly how a real sort-rule list
 * reaches a prompt's row dialog (`DialogFormField` + `MultiSelect`, never
 * `ProtocolArrayField`), and exactly the route `DialogArrayField` has to bind
 * for itself instead of leaving to whatever wraps it.
 */
function RuleList({
  value,
  onChange,
}: {
  value?: Rule[];
  onChange?: (next: Rule[]) => void;
}) {
  const rows = Array.isArray(value) ? value : [];
  const { onOperation } = useArrayFieldCommands<Rule>(rows, onChange);

  return (
    <button
      type="button"
      onClick={() => {
        if (onOperation) {
          onOperation({ type: 'insert', index: rows.length, item: NEW_RULE });
        } else {
          onChange?.([...rows, NEW_RULE]);
        }
      }}
    >
      Add rule
    </button>
  );
}

/** The row editor for a prompt whose "rules" is a list reached by no
 * `ProtocolArrayField` of its own — matching `SortOrderRows`' real use of
 * `DialogFormField` + `MultiSelect`. */
function PromptFieldsWithRuleList() {
  return (
    <>
      <DialogFormField name="text" label="Prompt text" component={InputField} />
      <DialogFormField name="rules" label="Rules" component={RuleList} />
    </>
  );
}

/**
 * The prompt list in a real stage editor.
 *
 * `prompts` is not a key an Information page's schema declares, so nothing
 * here is saved: what a row edit reached is read out of the document the
 * editor is holding, which is the value a save would assemble.
 */
function renderPromptList(
  fields: SectionDoc,
  extra?: Readonly<{
    withPreview?: boolean;
    onBeforeSave?: (value: unknown) => unknown;
    editorFieldsComponent?: ComponentType<Record<string, unknown>>;
    editorValidate?: DialogArrayEditorValidate;
  }>,
) {
  // How a test takes the list's own interactivity away mid-edit, the way a
  // section does when a prerequisite it depends on stops being chosen.
  const controls: { setDisabled: (value: boolean) => void } = {
    setDisabled: () => undefined,
  };
  const { probe, draft } = createStageDraftProbe();

  function List() {
    const [disabled, setDisabled] = useState(false);
    controls.setDisabled = setDisabled;
    return (
      <BuilderSection title="Prompts">
        {probe}
        <ProtocolArrayField
          name="prompts"
          label="Prompts"
          component={DialogArrayField}
          addButtonLabel="Create new prompt"
          editorTitle="Edit prompt"
          addTitle="Add prompt"
          itemLabel={promptItemLabel}
          disabled={disabled}
          previewComponent={PromptPreview}
          editorFieldsComponent={extra?.editorFieldsComponent ?? PromptFields}
          {...(extra?.withPreview === true
            ? { editorPreviewComponent: PromptEditorPreview }
            : {})}
          {...(extra?.onBeforeSave === undefined
            ? {}
            : { onBeforeSave: extra.onBeforeSave })}
          {...(extra?.editorValidate === undefined
            ? {}
            : { editorValidate: extra.editorValidate })}
        />
      </BuilderSection>
    );
  }

  const harness = renderStageEditor({
    stage: { type: 'Information', fields },
    sections: <List />,
  });

  return {
    user: harness.user,
    /** The prompts the editor is holding right now. */
    prompts: (): unknown => draft().prompts,
    disableList: () => {
      act(() => {
        controls.setDisabled(true);
      });
    },
  };
}

/** Adds a prompt through the list's own editor. */
async function addPrompt(user: HarnessUser, text: string) {
  await user.click(
    await screen.findByRole('button', { name: 'Create new prompt' }),
  );
  const field = await screen.findByRole('textbox', { name: 'Prompt text' });
  await user.type(field, text);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'Prompt text' }),
    ).not.toBeInTheDocument(),
  );
}

const promptText = () => screen.getByRole('textbox', { name: 'Prompt text' });

/** Opens the editor for the row at `index` and waits for its field. */
async function editRow(user: HarnessUser, index: number) {
  await user.click(
    (await screen.findAllByRole('button', { name: 'Edit prompt' }))[index]!,
  );
  return await screen.findByRole('textbox', { name: 'Prompt text' });
}

/**
 * A family's own editor code, throwing where every one of them can: while it
 * renders. Nothing the researcher typed causes this and nothing they type
 * fixes it.
 */
function ThrowingPromptFields(): never {
  throw new Error('the row editor is broken');
}

describe('the row editor', () => {
  /**
   * A dialog whose fields never rendered has nothing to save, and what it
   * would save is worse than nothing: for a new item, the empty row the
   * template made, committed as though the researcher had written it.
   */
  it('will not commit a row whose editor could not be shown', async () => {
    // React reports the render it caught as well; the boundary is what this
    // is about, and that report is not a failure.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { user, prompts } = renderPromptList(
      { prompts: [] },
      {
        editorFieldsComponent: ThrowingPromptFields,
      },
    );

    try {
      await user.click(
        await screen.findByRole('button', { name: 'Create new prompt' }),
      );
      await screen.findByText(/could not be shown/);

      const add = screen.getByRole('button', { name: 'Add' });
      expect(add).toHaveAttribute('aria-disabled', 'true');
      expect(add).toHaveAccessibleDescription(/could not be shown/);

      await user.click(add);

      // Nothing committed, and the dialog still there to be closed — which is
      // the only recovery this boundary offers.
      expect(prompts()).toEqual([]);
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('opens holding the values of the row it was opened on', async () => {
    const { user } = renderPromptList({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });

    // The field names a key and nothing else; the row it belongs to is what
    // the dialog was opened with.
    await editRow(user, 1);
    await waitFor(() => expect(promptText()).toHaveValue('Bravo'));
  });

  it('asks before a dismissal throws an edited row away', async () => {
    const { user, prompts } = renderPromptList({
      prompts: [{ id: 'a', text: 'Alpha' }],
    });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByText(
        'This editor holds changes that have not been saved. Closing it now discards them.',
      ),
    ).toBeInTheDocument();
    // The editor is still there, still holding the draft — the question was
    // asked instead of the work being thrown away. Queried as hidden because
    // the confirmation above it takes the rest of the page out of the
    // accessibility tree while it is open.
    expect(
      screen.getByRole('textbox', { name: 'Prompt text', hidden: true }),
    ).toHaveValue('Alpha edited');

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    // The row's own controls are hidden while its editor is open, so their
    // return is that editor closing.
    await screen.findByRole('button', { name: 'Edit prompt' });
    expect(prompts()).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  it('closes an untouched row editor without asking', async () => {
    const { user, prompts } = renderPromptList({
      prompts: [{ id: 'a', text: 'Alpha' }],
    });

    const text = await editRow(user, 0);
    // Waited for, so that "untouched" is a draft that really did open on the
    // row's value rather than one that had not been seeded yet.
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await screen.findByRole('button', { name: 'Edit prompt' });
    expect(
      screen.queryByRole('button', { name: 'Discard changes' }),
    ).not.toBeInTheDocument();
    expect(prompts()).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  it('morphs out of the row it was opened from', async () => {
    const { user } = renderPromptList({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });

    await editRow(user, 1);

    // `ArrayField` gives each row the shared-element identity of the id the
    // list resolved it by, so naming the same id is what pairs the dialog with
    // the row it grew out of — and the inline radius is the geometry the two
    // edges interpolate on the way.
    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({
          layoutId: 'b',
          style: { borderRadius: 'var(--radius)' },
        }),
      ),
    );
    expect(dialogRenders).not.toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: 'a' }),
    );
  });

  it('puts the editor preview beside the fields, outside the form', async () => {
    const { user } = renderPromptList(
      {
        prompts: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Bravo' },
        ],
      },
      { withPreview: true },
    );

    await editRow(user, 1);

    // A preview can be interactive — a control that owns its own form
    // semantics — so it must not be nested inside the editor's `<form>`.
    const preview = await screen.findByText(/Preview of/);
    expect(preview).toHaveTextContent('Preview of Bravo');
    expect(preview.closest('form')).toBeNull();
    expect(promptText().closest('form')).not.toBeNull();
  });

  it('opens a new row with no row to morph out of', async () => {
    const { user } = renderPromptList({
      prompts: [{ id: 'a', text: 'Alpha' }],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('textbox', { name: 'Prompt text' });

    // A new row was never on screen, so there is no element for the dialog to
    // be the same thing as. Naming one anyway would pair it with whichever row
    // last held that id.
    expect(dialogRenders).not.toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: expect.anything() as unknown }),
    );
  });

  it('gives a new row an id of its own', async () => {
    const { user, prompts } = renderPromptList({ prompts: [] });

    await addPrompt(user, 'First prompt');

    // Every list operation is addressed by the row's own id — that is what
    // survives a reorder, a repaired list, and a save that outlives its
    // dialog. A row created without one falls back to position, which is the
    // relabelling the whole seam exists to prevent.
    const written = prompts();
    expect(Array.isArray(written)).toBe(true);
    const [prompt] = written as Prompt[];
    expect(prompt?.text).toBe('First prompt');
    expect(prompt?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

/**
 * A commit that reaches no row is a commit the list's own save handler is
 * silent about: `ArrayField` withdraws its handler when the list stops
 * accepting changes, so calling it writes nothing and answers nothing. What
 * the write path says it did is the only thing between that and a dialog
 * closing over the researcher's draft.
 */
describe('a row editor whose commit reaches nothing', () => {
  it('refuses a row save the list has stopped accepting', async () => {
    const { user, prompts, disableList } = renderPromptList({
      prompts: [{ id: 'a', text: 'Alpha' }],
    });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    // The list stops accepting changes while the editor sits open — something
    // it depends on stopped being chosen. `ArrayField` withdraws its own save
    // handler when that happens, so calling it commits nothing at all.
    disableList();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This list is not accepting changes at the moment, so this prompt was not saved. Copy anything you want to keep, then try again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    // Reporting a save that never happened as a success is what closes the
    // dialog over a discarded edit, so the draft is still here to be rescued.
    expect(promptText()).toHaveValue('Alpha edited');
    expect(prompts()).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  /**
   * The third list that shares `useConfirmRowRemoval`, and the same window: a
   * confirm answered after `ArrayField` has withdrawn the row's delete
   * handler removes nothing and used to close as though it had.
   */
  it('removes no row when the list stops accepting changes mid-confirm', async () => {
    const { user, prompts, disableList } = renderPromptList({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });

    const removes = await screen.findAllByRole('button', {
      name: 'Remove prompt',
    });
    await user.click(removes[1]!);
    const dialog = await screen.findByRole('dialog');

    disableList();
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove prompt' }),
    );

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so this prompt was not removed. Remove it again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    expect(prompts()).toEqual([
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Bravo' },
    ]);
  });

  it('commits a row once when a second submit arrives while the first is running', async () => {
    let release: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onBeforeSave = vi.fn(async (value: unknown) => {
      await inFlight;
      return value;
    });
    const { user, prompts } = renderPromptList(
      { prompts: [{ id: 'a', text: 'Alpha' }] },
      { onBeforeSave },
    );

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The footer's submit control is disabled while a save runs, but a submit
    // raised on the form element itself — a keyboard submit from inside a
    // field — still reaches the form's own handler.
    const form = promptText().closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await act(async () => {
      release();
      await inFlight;
    });

    await waitFor(() =>
      expect(prompts()).toEqual([{ id: 'a', text: 'Alpha edited' }]),
    );
    // One commit, not two. The save already running answers for both.
    expect(onBeforeSave).toHaveBeenCalledTimes(1);
  });
});

describe('what a row editor validates against', () => {
  /**
   * The shape of every "unchanged pick" escape in this package: a value is
   * refused unless it is the one the row already had — reselecting what is
   * already saved is never a NEW contradiction. What answers "already had" is
   * the row the dialog OPENED on.
   */
  const reservedText: DialogArrayEditorValidate = (values, context) => {
    const initial = context?.initialValues;
    const openedWith =
      typeof initial === 'object' && initial !== null && 'text' in initial
        ? initial.text
        : undefined;
    return values.text === 'Reserved' && openedWith !== 'Reserved'
      ? { text: 'That name is reserved. Choose another.' }
      : undefined;
  };

  it('still refuses a value the researcher did choose', async () => {
    const { user, prompts } = renderPromptList(
      { prompts: [{ id: 'a', text: 'Alpha' }] },
      { editorValidate: reservedText },
    );

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Reserved');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('That name is reserved. Choose another.'),
    ).toBeInTheDocument();
    expect(prompts()).toEqual([{ id: 'a', text: 'Alpha' }]);
  });
});

describe('a list rendered inside a row dialog', () => {
  it('does not let an insert inside the row reach the list around it', async () => {
    const { user, prompts } = renderPromptList(
      {
        prompts: [{ id: 'a', text: 'Alpha', rules: [] }],
      },
      {
        editorFieldsComponent: PromptFieldsWithRuleList,
      },
    );

    await editRow(user, 0);
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));

    // The rule is part of THIS row, not a sibling of it: adding one must not
    // commit an insert against the array of prompts the dialog belongs to,
    // even before the dialog is saved.
    expect(prompts()).toEqual([{ id: 'a', text: 'Alpha', rules: [] }]);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The rule went into the prompt's own field, not beside it.
    expect(prompts()).toEqual([
      { id: 'a', text: 'Alpha', rules: [{ id: 'rule-1', label: 'New rule' }] },
    ]);
  });
});

describe('a list key holding something that is not a list', () => {
  it('adds a prompt to it rather than throwing out of the save', async () => {
    // What an import, a migration or a legacy protocol can leave at a list
    // key. The editor renders it as an empty list with a working Add button,
    // so the save behind that button has to reach the document.
    const { user, prompts } = renderPromptList({ prompts: 'legacy' });

    await addPrompt(user, 'About work');

    await waitFor(() =>
      expect(prompts()).toEqual([
        expect.objectContaining({ text: 'About work' }) as unknown as Prompt,
      ]),
    );
  });
});

/**
 * A list a family renders INSIDE the row dialog — a prompt's sort rules, a
 * block's options — is part of one row of the list around it, and that outer
 * list is what holds the document path.
 *
 * Left inherited, that path is what the inner list would commit its own
 * insertions and reorderings against: adding a sort rule would insert a row
 * into the array of prompts. It also must not commit anything at all until the
 * dialog saves, which is the same rule `ProtocolArrayField` states for a list
 * that finds itself in a nested form store — this closes the same gap for one
 * that never goes through `ProtocolArrayField` at all.
 */
describe('a list nested inside a row dialog', () => {
  function ReportedBinding() {
    const binding = useContext(ArrayFieldBindingContext);
    return (
      <p>
        Bound to:{' '}
        {binding === null
          ? 'no list at all'
          : (binding.documentPath?.join('.') ?? 'no document path')}
      </p>
    );
  }

  function NestingPromptFields() {
    return (
      <>
        <ReportedBinding />
        <PromptFields />
      </>
    );
  }

  it('is bound to no place in the document of its own', async () => {
    const { user } = renderPromptList(
      { prompts: [{ id: 'a', text: 'Alpha' }] },
      { editorFieldsComponent: NestingPromptFields },
    );

    await editRow(user, 0);

    expect(
      await screen.findByText('Bound to: no document path'),
    ).toBeInTheDocument();
  });
});
