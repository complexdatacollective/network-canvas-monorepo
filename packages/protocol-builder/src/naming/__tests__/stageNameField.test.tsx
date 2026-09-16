import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../../form/stageEditorContext.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { useStageName } from '../useStageName.ts';

const NAME = { name: 'Stage name' } as const;

/**
 * The stage's name as a host actually mounts it: the title in the editor's
 * header slot, OUTSIDE the `<form>` element, which is what the harness draws
 * for every test in this package.
 *
 * That arrangement is the point. A control's form owner decides what Enter
 * does and what a submit collects, and a control drawn outside its form has
 * one only because the `form` attribute gives it one. A test that mounted the
 * name as a section of the form would be testing an arrangement no host ships
 * — and would pass with the association missing entirely.
 */
describe('the stage name drawn outside the form', () => {
  it('belongs to the stage form it is drawn outside of', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <></>,
    });

    const box = screen.getByRole('textbox', NAME);
    // Not `closest('form')`: the question is which form OWNS the control,
    // which is what the browser answers with, and the answer here comes from
    // the attribute rather than from where the element sits.
    expect(box.closest('form')).toBeNull();
    expect((box as HTMLTextAreaElement).form?.id).toBe(harness.formId);
  });

  /**
   * Enter saves the stage rather than typing a line into the name.
   *
   * The `<input>` this control replaced performed the form's implicit
   * submission, so that is what Enter still does — and implicit submission is
   * a property of the control's FORM OWNER. Without the association it is not
   * that Enter does something else; it does nothing at all, with no newline
   * and no save, which is a key a researcher can press forever.
   */
  it('saves the stage when Enter is pressed in the name', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <></>,
    });

    await harness.user.type(screen.getByRole('textbox', NAME), ' (revised)');
    await harness.user.keyboard('{Enter}');

    await waitFor(() => {
      expect(harness.protocolSections()['stage:information-1']).toMatchObject({
        label: 'Information (revised)',
      });
    });
  });
});

/**
 * A second reader of the name, mounted and unmounted while the editor stays
 * open — a host's rename dialog, opened and closed.
 */
function RenameDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen((was) => !was)}>
        Toggle rename dialog
      </button>
      {open ? <RenameReader /> : null}
    </>
  );
}

function RenameReader() {
  const { value } = useStageName();
  return <p>Renaming: {value}</p>;
}

describe('a second reader of the name', () => {
  /**
   * `useStageName` registers nothing, so a host may call it wherever it likes
   * and as often as it likes.
   *
   * The registration is `useStageNameField`'s alone, and fresco's field
   * registry counts no references: when both halves were one hook, a rename
   * dialog closing deleted the live field and took its refusals with it. The
   * researcher was left looking at a title bound to nothing, and the editor's
   * own "this stage has to be called something" replaced by the form's generic
   * "not finished".
   */
  it('comes and goes without taking the registered field with it', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-unnamed',
        type: 'Information',
        fields: { label: 'Named', title: 'Welcome', items: [] },
      },
      sections: <RenameDialog />,
    });

    const box = screen.getByRole('textbox', NAME);
    await harness.user.clear(box);
    expect(await harness.submit()).toBeNull();
    const refusal = await screen.findByText('This field is required.');
    expect(refusal).toBeInTheDocument();

    // Opened, and reading the same name.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle rename dialog' }),
    );
    expect(screen.getByText(/^Renaming:/)).toBeInTheDocument();

    // Closed again. The field is still registered, still refused, and still
    // the thing the researcher types into.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle rename dialog' }),
    );
    expect(screen.getByText('This field is required.')).toBeInTheDocument();

    await harness.user.type(screen.getByRole('textbox', NAME), 'Named again');
    expect(screen.getByRole('textbox', NAME)).toHaveValue('Named again');

    // And the field is still one the FORM holds rather than a value parked
    // beside it: emptied again, the save is refused about the name rather
    // than about a setting nothing on screen shows, which is what a refusal
    // reaching the protocol schema instead of the field would look like.
    await harness.user.clear(screen.getByRole('textbox', NAME));
    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([]);
  });
});

/**
 * A host with a rename menu and no stage title at all: `useStageName` and
 * nothing else.
 */
function MenuRename() {
  const { value, setValue } = useStageName();

  return (
    <>
      <p>Called: {value}</p>
      <button type="button" onClick={() => setValue('Renamed from a menu')}>
        Rename from a menu
      </button>
      <button type="button" onClick={() => setValue('')}>
        Clear the name
      </button>
    </>
  );
}

/** A host whose only relationship with the name is `useStageName`. */
const menuOnlyHost = {
  sections: <MenuRename />,
  // No title. That is the whole case: this host draws no control at all.
  header: () => null,
} as const;

describe('a host that draws no name control at all', () => {
  it('renames the stage, and the save carries it', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      ...menuOnlyHost,
    });
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Rename from a menu' }),
    );
    expect(screen.getByText('Called: Renamed from a menu')).toBeInTheDocument();

    const saved = await harness.submit();
    expect(saved?.stageDocument.label).toBe('Renamed from a menu');
  });

  /**
   * And the name is a FIELD of the form, not a value parked beside it.
   *
   * `useStageName` holds the registration, so a menu rename is judged by the
   * editor's own rule about the name: the form refuses the submit itself and
   * never reaches the host's save. Without it the write is only a staged
   * value — the form has nothing at `label` to validate, the submit runs, and
   * the researcher is refused by the protocol schema about "a setting this
   * editor does not show" instead of about the name they just emptied.
   *
   * The save is refused either way, so the refusal's EXISTENCE proves
   * nothing; which refusal it is, is the whole of it.
   *
   * `harness.submit()` cannot be used here: it waits for a refusal to appear
   * on screen, and this host draws no control for one to appear beside — a
   * gap that is the host's own issue surfacing to close, out of `problems`
   * and the form's field errors.
   */
  it('refuses an emptied name as the name, not as a setting nothing shows', async () => {
    let storeApi: StageFormStoreApi | null = null;
    const harness = renderStageEditor({
      stageId: 'information-1',
      ...menuOnlyHost,
      header: () => (
        <FormProbe
          onStore={(api) => {
            storeApi = api;
          }}
        />
      ),
    });
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Clear the name' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save stage' }),
    );

    await waitFor(() => {
      const state = (storeApi as StageFormStoreApi | null)?.getState();
      expect(state?.getFieldErrors('label')).toHaveLength(1);
    });
    // Refused before the protocol was ever asked, so there is nothing for the
    // schema to have said about an unshown setting.
    expect(harness.problems()).toEqual([]);
    expect(harness.protocolSections()['stage:information-1']).toMatchObject({
      label: 'Information',
    });
  });
});

/** The stage form's own store, for a host that renders nothing to read. */
function FormProbe({
  onStore,
}: {
  onStore: (storeApi: StageFormStoreApi) => void;
}) {
  onStore(useStageEditorForm().storeApi);
  return null;
}

/**
 * A rename offered to somebody who may not write.
 */
function SpectatorRename() {
  const { setValue } = useStageName();

  return (
    <button type="button" onClick={() => setValue('Renamed by a spectator')}>
      Rename from a menu
    </button>
  );
}

describe('a spectator', () => {
  /**
   * The name is the one control a host draws OUTSIDE the editor's own
   * `FieldsDisabled`, so being unable to write has to be decided by the name
   * itself — and by the hook rather than by the control, because a host with a
   * rename menu and no control writes through the hook and nothing else.
   *
   * Refused out loud rather than silently: a write that vanished would look to
   * the researcher exactly like one that worked.
   */
  it('cannot rename the stage from a menu', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      readOnly: true,
      sections: <SpectatorRename />,
    });
    await harness.opened();

    const before = screen.getByRole('textbox', NAME);
    expect(before).toHaveValue('Information');

    await harness.user.click(
      screen.getByRole('button', { name: 'Rename from a menu' }),
    );

    expect(screen.getByRole('textbox', NAME)).toHaveValue('Information');
    expect(
      await screen.findByText(
        'This stage is read-only, so your change was not made. Somebody else is editing it.',
      ),
    ).toBeInTheDocument();
  });
});
